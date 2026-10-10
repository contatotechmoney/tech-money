import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PORTFOLIO_AGENTS } from "../shared/portfolio-simulation";
import { portfolioDossier, type EngineMarket } from "../shared/portfolio-pilot-engine";
import type { PilotBudget } from "../shared/portfolio-pilot";
import type { PortfolioPilot, PilotModel } from "./portfolio-pilot";

export type PilotExecutionContext = { budget: PilotBudget; model: PilotModel; market: EngineMarket };
export type PilotRun = {
  id: string; budgetId: string; status: "running" | "completed" | "partial" | "failed" | "timeout";
  startedAt: number; finishedAt?: number; error?: string;
  agents: { id: string; summary: string; observations: string[] }[];
  consumption: { calls: number; inputTokens: number; outputTokens: number; costUsdMicros: number };
  reservedConsumption?: { calls: number; inputTokens: number; outputTokens: number; costUsdMicros: number };
  outcomeUnconfirmed?: boolean;
  dossier: ReturnType<typeof portfolioDossier>;
  professionalReviewRequired: true; recommendationApproved: false;
};
/** No default HTTP adapter exists. Implementations must enforce hard output token
 * limits, acknowledge cancellation and provide authoritative usage/price identity.
 * This contract is exercised only by local fakes in this revision. */
export interface PilotProvider {
  complete(input: {
    agentId: string; modelId: string; priceVersion: string; prompt: string;
    maxInputTokens: number; maxOutputTokens: number; signal: AbortSignal;
  }): Promise<{
    modelId: string; priceVersion: string; inputTokens: number; outputTokens: number;
    result: { summary: string; observations: string[] };
  }>;
}
const outputSchema = z.object({
  summary: z.string().max(2_000), observations: z.array(z.string().max(500)).max(6),
}).strict();
const micros = (input: number, output: number, model: PilotModel) =>
  Number((BigInt(input) * BigInt(model.inputUsdMicrosPerMillion) +
    BigInt(output) * BigInt(model.outputUsdMicrosPerMillion) + BigInt(999_999)) / BigInt(1_000_000));
const safeError = (error: unknown) => {
  const code = error instanceof Error ? error.message : "";
  return /^(BUDGET_EXCEEDED|BUDGET_EXPIRED|APPROVAL_INVALIDATED|APPROVAL_REQUIRED|MARKET_DATA_UNVERIFIED|QUANTITY_REQUIRED|TOKEN_LIMIT|PRICE_CHANGED|TIMEOUT|PROVIDER_USAGE_INVALID)$/.test(code)
    ? code : "EXECUTOR_FAILED"; // Never persist provider bodies, secrets or transport errors.
};

export function createPilotExecutor(provider: PilotProvider) {
  return async (pilot: PortfolioPilot, actor: string, budgetId: string): Promise<PilotRun> => {
    const receipt = await pilot.runTransaction(actor, async state => structuredClone(state.runs?.find(r => r.budgetId === budgetId)));
    if (receipt) return receipt;
    const context = await pilot.executionContext(actor, budgetId);
    const dossier = portfolioDossier(context.budget.positions, context.market);
    const started = await pilot.runTransaction(actor, async state => {
      state.runs ??= [];
      const prior = state.runs.find(r => r.budgetId === budgetId);
      if (prior) return { launch: false, run: structuredClone(prior) };
      if (state.active) throw new Error("EXECUTION_ACTIVE");
      const run: PilotRun = {
        id: randomUUID(), budgetId, status: "running", startedAt: pilot.clock(), agents: [],
        consumption: { calls: 0, inputTokens: 0, outputTokens: 0, costUsdMicros: 0 }, dossier,
        professionalReviewRequired: true, recommendationApproved: false,
      };
      state.runs.push(run);
      state.active = { budgetId, usage: { calls: 0, inputTokens: 0, outputTokens: 0, costUsdMicros: 0, retries: 0, startedAt: run.startedAt } };
      state.events.push({ type: "execution_started", budgetId, at: pilot.clock(), fingerprint: context.budget.fingerprint });
      return { launch: true, run: structuredClone(run) };
    });
    if (!started.launch) return started.run; // A retry is a receipt, not another dispatch.
    const run = started.run;
    const controller = new AbortController();
    let cancellationUnconfirmed = false;
    let dispatchOutstanding = false;
    try {
      for (const agent of PORTFOLIO_AGENTS) {
        const current = await pilot.executionContext(actor, budgetId); // Revalidate before every admission.
        const prompt = JSON.stringify({
          identity: `${agent.name}: persona de IA; ${agent.role}`,
          instruction: "Estudo não aprovado. Não invente dados, credenciais, taxas, cenários ou recomendações aprovadas. Preserve lacunas e cobertura.",
          dossier, ...(agent.id === "denise" ? { previousAgents: run.agents } : {}),
        });
        const inputBound = Buffer.byteLength(prompt, "utf8");
        // Conservative byte bound; future adapter must validate its tokenizer too.
        if (inputBound > 3_000) throw new Error("TOKEN_LIMIT");
        const outputCap = 1_000;
        const costReserve = micros(inputBound, outputCap, current.model);
        const reserved = await pilot.reserve(actor, budgetId, {
          calls: 1, inputTokens: inputBound, outputTokens: outputCap, costUsdMicros: costReserve, retries: 0,
        });
        run.reservedConsumption = { calls: reserved.calls, inputTokens: reserved.inputTokens,
          outputTokens: reserved.outputTokens, costUsdMicros: reserved.costUsdMicros };
        await pilot.runTransaction(actor, async state => {
          Object.assign(state.runs!.find(r => r.id === run.id)!, run);
          state.events.push({ type: `call_reserved:${agent.id}`, budgetId, at: pilot.clock(), fingerprint: context.budget.fingerprint });
        });
        const remaining = context.budget.limits.timeoutMs - (pilot.clock() - run.startedAt);
        if (remaining <= 0) throw new Error("TIMEOUT");
        let timer: ReturnType<typeof setTimeout> | undefined;
        let settled = false;
        dispatchOutstanding = true;
        const call = provider.complete({
          agentId: agent.id, modelId: current.model.modelId, priceVersion: current.model.priceVersion,
          prompt, maxInputTokens: inputBound, maxOutputTokens: outputCap, signal: controller.signal,
        }).finally(() => { settled = true; });
        const response = await Promise.race([
          call,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => { controller.abort(); reject(new Error("TIMEOUT")); }, remaining);
          }),
        ]).finally(() => {
          if (timer) clearTimeout(timer);
          // Uncertain provider outcome retains active reservation: never blindly retry.
          cancellationUnconfirmed = !settled;
        });
        if (response.modelId !== current.model.modelId || response.priceVersion !== current.model.priceVersion)
          throw new Error("PRICE_CHANGED");
        if (![response.inputTokens, response.outputTokens].every(n => Number.isSafeInteger(n) && n >= 0) ||
            response.inputTokens > inputBound || response.outputTokens > outputCap)
          throw new Error("PROVIDER_USAGE_INVALID");
        run.consumption.calls++;
        run.consumption.inputTokens += response.inputTokens;
        run.consumption.outputTokens += response.outputTokens;
        run.consumption.costUsdMicros += micros(response.inputTokens, response.outputTokens, current.model);
        dispatchOutstanding = false;
        const result = outputSchema.parse(response.result);
        run.agents.push({ id: agent.id, ...result });
        await pilot.runTransaction(actor, async state => {
          const stored = state.runs!.find(r => r.id === run.id)!;
          Object.assign(stored, run);
          state.events.push({ type: `agent_completed:${agent.id}`, budgetId, at: pilot.clock(), fingerprint: context.budget.fingerprint });
        });
      }
      run.status = "completed";
    } catch (error) {
      controller.abort();
      run.error = safeError(error);
      run.status = run.error === "TIMEOUT" ? "timeout" : run.agents.length ? "partial" : "failed";
      cancellationUnconfirmed ||= dispatchOutstanding;
    }
    run.finishedAt = pilot.clock();
    run.outcomeUnconfirmed = cancellationUnconfirmed;
    return pilot.runTransaction(actor, async state => {
      Object.assign(state.runs!.find(r => r.id === run.id)!, run);
      if (!cancellationUnconfirmed && state.active?.budgetId === budgetId) state.active = undefined;
      if (state.approval?.budgetId === budgetId) state.approval = undefined;
      state.events.push({ type: `execution_${run.status}${cancellationUnconfirmed ? ":outcome_unconfirmed" : ""}`,
        budgetId, at: pilot.clock(), fingerprint: context.budget.fingerprint });
      return structuredClone(run);
    });
  };
}
