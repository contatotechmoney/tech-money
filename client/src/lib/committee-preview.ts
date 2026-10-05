import type { AnalysisJob, AnalysisOptions, AnalysisPreviewTransport } from "../components/hermes-analysis-panel";

export type PreviewScenario = "success" | "incomplete" | "limit" | "uncertain";
const root = "/api/investments";

/** Local fixtures only: never imports a provider, fetch or the live API client. */
export function createCommitteePreview(scenario: PreviewScenario = "success", initialBalance = 20) {
  if (!Number.isSafeInteger(initialBalance) || initialBalance < 0) throw new Error("Invalid synthetic balance");
  let available = initialBalance, reserved = 0, revision = 1, delta = 0;
  const jobs = new Map<string, AnalysisJob>();
  const requests = new Map<string, string>();
  const finalized = new Set<string>();
  const ledger: { kind: string; credits: number; jobId: string }[] = [];
  const options = (): AnalysisOptions => ({ available: true, dailyLimit: 3,
    models: [
      { id: "deepseek-fixture", label: "DeepSeek V4.1 Flash · simulado", credits: 2 + delta, priceVersion: `fixture-${revision}` },
      { id: "alternative-fixture", label: "Modelo alternativo · fictício", credits: 5 + delta, priceVersion: `fixture-${revision}` },
    ], tickers: ["BBDC3", "BBAS3"], wallet: { available, reserved } });
  const snapshot = <T,>(value: T): T => structuredClone(value);
  const transport: AnalysisPreviewTransport = {
    scope: crypto.randomUUID(),
    async request(method, path, data) {
      if (method === "GET" && path === `${root}/analysis-options`) return snapshot(options());
      if (method === "GET" && path === `${root}/analyses`) return { jobs: snapshot(Array.from(jobs.values()).reverse()) };
      if (method === "POST" && path === `${root}/analyses`) {
        const payload = data as { ticker?: string; modelId?: string; idempotencyKey?: string; confirmedCredits?: number; priceVersion?: string } | undefined;
        const model = options().models.find(m => m.id === payload?.modelId);
        if (!payload || !model || !options().tickers.includes(payload.ticker ?? "") || !payload.idempotencyKey) throw new Error("INVALID_REQUEST");
        const prior = requests.get(payload.idempotencyKey);
        if (prior) {
          const job = jobs.get(prior)!;
          if (job.ticker !== payload.ticker || job.modelId !== payload.modelId) throw new Error("REQUEST_CONFLICT");
          return snapshot(job);
        }
        if (payload.confirmedCredits !== model.credits || payload.priceVersion !== model.priceVersion) throw new Error("PRICE_CHANGED: confira a oferta novamente.");
        if (Array.from(jobs.values()).some(j => j.status === "running")) throw new Error("ANALYSIS_IN_PROGRESS");
        if (available < model.credits) throw new Error("INSUFFICIENT_CREDITS");
        const id = crypto.randomUUID();
        const job: AnalysisJob = { id, requestKey: payload.idempotencyKey, ticker: payload.ticker!, modelId: model.id, status: "running", output: null, runtime: null, createdAt: new Date().toISOString(), simulation: { stage: 0, total: 21 } };
        available -= model.credits; reserved += model.credits;
        ledger.push({ kind: "reserve", credits: -model.credits, jobId: id });
        jobs.set(id, job); requests.set(payload.idempotencyKey, id);
        return snapshot(job);
      }
      if (method === "GET" && path.startsWith(`${root}/analyses/`)) {
        const id = path.slice(`${root}/analyses/`.length), job = jobs.get(id);
        if (!job) throw new Error("NOT_FOUND");
        if (!finalized.has(id) && !job.simulation?.blockedReason) {
          job.simulation!.stage = scenario === "success" ? Math.min(21, job.simulation!.stage + 7) : 1;
          if (scenario === "uncertain") {
            job.simulation!.blockedReason = "Consumo não confirmado. Reserva mantida e nova análise bloqueada até conferência.";
          } else if (scenario !== "success" || job.simulation!.stage === 21) {
            const cost = -ledger.find(e => e.jobId === id && e.kind === "reserve")!.credits;
            reserved -= cost; finalized.add(id);
            if (scenario === "success") {
              job.status = "completed";
              job.output = "SIMULAÇÃO: duas rodadas, duas revisões e uma síntese. Nenhum estudo financeiro real foi produzido. Revisão profissional pendente.";
              ledger.push({ kind: "consume", credits: 0, jobId: id });
            } else {
              job.status = "failed"; available += cost;
              job.simulation!.blockedReason = scenario === "incomplete" ? "Resposta incompleta. Créditos fictícios devolvidos." : "Limite de processamento atingido. Créditos fictícios devolvidos.";
              ledger.push({ kind: "refund", credits: cost, jobId: id });
            }
          }
        }
        return snapshot(job);
      }
      throw new Error("Operação não disponível na simulação isolada.");
    },
  };
  return { transport, reprice: () => { revision++; delta++; }, ledger: () => snapshot(ledger) };
}
