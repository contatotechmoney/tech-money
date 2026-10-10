import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it, describe, mock } from "node:test";
import { PortfolioPilot, type PilotAccountState, type PilotDependencies, type PilotLedger } from "./portfolio-pilot";
import { createPilotExecutor, type PilotProvider } from "./portfolio-pilot-executor";
import { portfolioDossier, type EngineMarket } from "../shared/portfolio-pilot-engine";
import { verifiedPilotOwner } from "./portfolio-pilot-owner";
import { parseNousCatalogue, nousRateMicros } from "./portfolio-pilot-models";

class SyntheticLedger implements PilotLedger {
  state: PilotAccountState = { budgets: [], events: [] };
  tail: Promise<unknown> = Promise.resolve();
  transaction<T>(_owner: string, work: (state: PilotAccountState) => Promise<T>): Promise<T> {
    const task = this.tail.catch(() => {}).then(async () => {
      const draft = structuredClone(this.state);
      const result = await work(draft); this.state = draft; return result;
    });
    this.tail = task; return task;
  }
}
const syntheticMarket = (): EngineMarket => ({
  source: "synthetic-source", asOf: "2026-10-10", prices: { SYN: 10 }, histories: {},
});
function fixture() {
  let now = 1_000_000, calls = 0;
  const ledger = new SyntheticLedger();
  const provider: PilotProvider = {
    complete: async input => {
      calls++;
      return { modelId: input.modelId, priceVersion: input.priceVersion, inputTokens: 30, outputTokens: 20,
        result: { summary: `Estudo fictício ${input.agentId}`, observations: ["Dados sintéticos, não recomendação."] } };
    },
  };
  const market = syntheticMarket();
  const model = { key: "synthetic:exact-id:price1", name: "DeepSeek homonym synthetic",
    provider: "fake", modelId: "synthetic-exact-id", priceVersion: "p1",
    inputUsdMicrosPerMillion: 100_000, outputUsdMicrosPerMillion: 1_000_000,
    verifiedAt: 999_999, validUntil: 2_000_000, source: "synthetic-tariff", accountPricingVerified: true };
  const deps: PilotDependencies = {
    ownerId: "synthetic-owner", ledger, executorReady: true, now: () => now,
    positions: async () => [{ id: "SYN", ticker: "SYN", quantity: 2, assetClass: "Caixa", settlementDays: 0 }],
    models: () => [model],
    market: () => ({ version: "m1", verifiedAt: 999_999, validUntil: 2_000_000,
      source: market.source, verified: true, prices: market.prices, engine: market }),
    execute: createPilotExecutor(provider),
  };
  const pilot = new PortfolioPilot(deps);
  const quote = () => pilot.quote("synthetic-owner", {
    requestKey: randomUUID(), positionIds: ["SYN"], modelKey: model.key, maxSpendUsdMicros: 10_000,
  });
  const approve = (b: Awaited<ReturnType<typeof quote>>) =>
    pilot.approve("synthetic-owner", { budgetId: b.id, fingerprint: b.fingerprint, confirm: true });
  return { pilot, deps, ledger, quote, approve, provider, model, market, calls: () => calls, setNow: (n: number) => { now = n; } };
}
describe("separate portfolio executor — local fake providers only", () => {
  it("completes six roles, Denise last, private auditable history and no real network", async () => {
    const spy = mock.method(globalThis, "fetch", async () => { throw new Error("NO_NETWORK"); });
    try {
      const f = fixture(), b = await f.quote(); await f.approve(b);
      const run = await f.pilot.execute("synthetic-owner", { budgetId: b.id });
      assert.equal(run.status, "completed"); assert.equal(f.calls(), 6);
      assert.deepEqual(run.agents.map(a => a.id), ["bruno", "tereza", "paulo", "larissa", "sergio", "denise"]);
      assert.equal(run.recommendationApproved, false); assert.equal(run.professionalReviewRequired, true);
      assert.equal(run.consumption.inputTokens, 180); assert.ok(run.reservedConsumption!.costUsdMicros <= b.maxSpendUsdMicros);
      assert.equal((await f.pilot.history("synthetic-owner"))[0].id, run.id);
      await assert.rejects(f.pilot.history("other-user"), /PILOT_CLOSED/);
      assert.ok(f.ledger.state.events.some(e => e.type === "execution_completed"));
      const again = await f.pilot.execute("synthetic-owner", { budgetId: b.id });
      assert.equal(again.id, run.id); assert.equal(f.calls(), 6); assert.equal(spy.mock.callCount(), 0);
    } finally { spy.mock.restore(); }
  });
  it("denies absent approval, foreign identity, client owner/cost and missing configuration", async () => {
    const f = fixture(), b = await f.quote();
    await assert.rejects(f.pilot.execute("synthetic-owner", { budgetId: b.id }), /APPROVAL_REQUIRED/);
    assert.throws(() => f.pilot.execute("other", { budgetId: b.id }), /PILOT_CLOSED/);
    assert.throws(() => f.pilot.execute("synthetic-owner", { budgetId: b.id, cost: 0 }));
    f.deps.execute = undefined;
    assert.throws(() => f.pilot.execute("synthetic-owner", { budgetId: b.id }), /REAL_EXECUTION_DISABLED/);
    assert.equal(f.calls(), 0);
  });
  it("checks prices, quantities and expiry again before starting", async () => {
    for (const changed of ["price", "quantity", "expiry"]) {
      const f = fixture(), b = await f.quote(); await f.approve(b);
      if (changed === "price") f.model.outputUsdMicrosPerMillion++;
      if (changed === "quantity") f.deps.positions = async () => [{ id: "SYN", ticker: "SYN", quantity: 3 }];
      if (changed === "expiry") f.setNow(b.expiresAt);
      await assert.rejects(f.pilot.execute("synthetic-owner", { budgetId: b.id }), /APPROVAL_INVALIDATED|BUDGET_EXPIRED/);
      assert.equal(f.calls(), 0);
    }
  });
  it("keeps a same-price verification refresh valid but never extends the approved budget expiry", async () => {
    const f = fixture(), b = await f.quote();
    f.model.verifiedAt++; f.model.validUntil++;
    await f.approve(b);
    assert.equal(f.ledger.state.budgets[0].expiresAt, b.expiresAt);
    const run = await f.pilot.execute("synthetic-owner", { budgetId: b.id });
    assert.equal(run.status, "completed");
    assert.equal(b.pricing!.modelId, f.model.modelId);
  });
  it("serializes double-click execution and rejects a competing account run", async () => {
    const f = fixture(), b = await f.quote(); await f.approve(b);
    const results = await Promise.all(Array.from({ length: 10 }, () => f.pilot.execute("synthetic-owner", { budgetId: b.id })));
    assert.equal(new Set(results.map(r => r.id)).size, 1); assert.equal(f.calls(), 6);
    assert.equal(f.ledger.state.runs!.length, 1);
  });
  it("price increase between agents stops next dispatch and records partial state", async () => {
    const f = fixture(), original = f.provider.complete;
    f.provider.complete = async input => { const r = await original(input); f.model.inputUsdMicrosPerMillion++; return r; };
    const b = await f.quote(); await f.approve(b);
    const run = await f.pilot.execute("synthetic-owner", { budgetId: b.id });
    assert.equal(run.status, "partial"); assert.equal(run.error, "APPROVAL_INVALIDATED");
    assert.equal(f.calls(), 1); assert.equal(run.agents.length, 1);
  });
  it("budget ceiling is enforced before another paid admission", async () => {
    const f = fixture(), b = await f.quote(); await f.approve(b);
    // Synthetic corruption reduces approved ceiling: never trust prior client estimates.
    f.ledger.state.budgets[0].maxSpendUsdMicros = 1;
    const run = await f.pilot.execute("synthetic-owner", { budgetId: b.id });
    assert.equal(run.status, "failed"); assert.equal(run.error, "BUDGET_EXCEEDED"); assert.equal(f.calls(), 0);
  });
  it("provider price mismatch/usage overflow is uncertain, retains reservation and prevents retries", async () => {
    for (const invalid of ["price", "tokens"]) {
      const f = fixture();
      f.provider.complete = async input => ({
        modelId: input.modelId, priceVersion: invalid === "price" ? "changed" : input.priceVersion,
        inputTokens: 20, outputTokens: invalid === "tokens" ? 1001 : 20, result: { summary: "fake", observations: [] },
      });
      const b = await f.quote(); await f.approve(b);
      const run = await f.pilot.execute("synthetic-owner", { budgetId: b.id });
      assert.equal(run.status, "failed"); assert.equal(run.outcomeUnconfirmed, true);
      assert.ok(f.ledger.state.active); assert.equal(run.reservedConsumption!.calls, 1);
      await assert.rejects(f.quote(), /EXECUTION_ACTIVE/);
    }
  });
  it("timeout aborts, leaves an uncertain reservation and does not invent Denise synthesis", async () => {
    const f = fixture(), original = f.provider.complete;
    f.provider.complete = async input => {
      if (input.agentId === "bruno") { const r = await original(input); f.setNow(1_089_997); return r; }
      return new Promise((_resolve, reject) => input.signal.addEventListener("abort", () => reject(new Error("TIMEOUT")), { once: true }));
    };
    const b = await f.quote(); await f.approve(b);
    const run = await f.pilot.execute("synthetic-owner", { budgetId: b.id });
    assert.equal(run.status, "timeout"); assert.equal(run.agents.length, 1);
    assert.ok(run.reservedConsumption!.calls >= 2);
    assert.ok(f.ledger.state.events.some(e => e.type.startsWith("execution_timeout")));
  });
  it("partial provider failure preserves successful usage and reserved failed call with no retry", async () => {
    const f = fixture(), original = f.provider.complete;
    f.provider.complete = async input => {
      if (input.agentId === "paulo") throw new Error("secret transport body must not be persisted");
      return original(input);
    };
    const b = await f.quote(); await f.approve(b);
    const run = await f.pilot.execute("synthetic-owner", { budgetId: b.id });
    assert.equal(run.status, "partial"); assert.equal(run.error, "EXECUTOR_FAILED");
    assert.equal(run.consumption.calls, 2); assert.equal(run.reservedConsumption!.calls, 3);
    assert.equal(run.outcomeUnconfirmed, true);
    assert.doesNotMatch(JSON.stringify(f.ledger.state), /secret transport/);
  });
});
describe("supplied-data adaptation of b3 engine and dossier", () => {
  it("does not redistribute missing history, confuse D+1 with same day, presume RV or macro", () => {
    const market = syntheticMarket(); market.prices.OTHER = 30;
    const dossier = portfolioDossier([
      { ticker: "SYN", quantity: 1, assetClass: "Caixa", settlementDays: 0 },
      { ticker: "OTHER", quantity: 1, assetClass: "Renda fixa", settlementDays: 1 },
    ], market);
    assert.deepEqual(dossier.weights, { SYN: .25, OTHER: .75 });
    assert.deepEqual(dossier.liquidity, { "D+0": .25, "D+1": .75 });
    assert.deepEqual(dossier.classes, { Caixa: .25, "Renda fixa": .75 });
    assert.equal(dossier.risk, null); assert.equal(dossier.macro, null); assert.deepEqual(dossier.scenarios, []);
    assert.deepEqual(dossier.historyCoverage.missing, ["SYN", "OTHER"]);
  });
  it("calculates full coverage metrics only with aligned supplied history; beta never fetches", () => {
    const market = syntheticMarket();
    market.histories.SYN = Array.from({ length: 100 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), close: 10 + i * .1 + Math.sin(i) * .1,
    }));
    const dossier = portfolioDossier([{ ticker: "SYN", quantity: 2 }], market);
    assert.equal(dossier.historyCoverage.weight, 1); assert.equal(dossier.risk!.observations, 99);
    assert.equal(dossier.risk!.beta, null); assert.ok(Number.isFinite(dossier.risk!.annualVolatility));
    market.benchmark = market.histories.SYN;
    assert.ok(Math.abs(portfolioDossier([{ ticker: "SYN", quantity: 2 }], market).risk!.beta! - 1) < 1e-9);
    market.prices.OTHER = 10;
    const partial = portfolioDossier([{ ticker: "SYN", quantity: 1 }, { ticker: "OTHER", quantity: 1 }], market);
    assert.equal(partial.historyCoverage.weight, .5); assert.equal(partial.risk, null);
    assert.equal(partial.weights.SYN, .5);
  });
  it("rejects missing quantities/quotes, unknown classes remain unknown, macro needs dated source", () => {
    const market = syntheticMarket();
    assert.throws(() => portfolioDossier([{ ticker: "SYN", quantity: 0 }], market), /QUANTITY_REQUIRED/);
    assert.throws(() => portfolioDossier([{ ticker: "missing", quantity: 1 }], market), /MARKET_DATA_UNVERIFIED/);
    const positions = [{ ticker: "SYN", quantity: 2 }];
    assert.deepEqual(portfolioDossier(positions, market).classes, { "Não classificado": 1 });
    market.macro = { source: "", asOf: "2026-10-10", facts: ["unverified"] };
    assert.equal(portfolioDossier(positions, market).macro, null);
    market.macro = { source: "synthetic-official", asOf: "2026-10-09", facts: ["synthetic dated fact"] };
    assert.deepEqual(portfolioDossier(positions, market).macro, market.macro);
  });
});
describe("official owner proof, no account discovery", () => {
  it("only bound subject in exact Clerk environment is checked with official provider", async () => {
    let calls = 0; const parameters: unknown[][] = [];
    const pool = { query: async (_sql: string, params: unknown[]) => {
      parameters.push(params); return { rowCount: params[0] === "synthetic-owner" ? 1 : 0 };
    } };
    const official = async (id: string) => {
      calls++; return { id, primaryEmailAddressId: "email-id", emailAddresses: [{ id: "email-id", verification: { status: "verified" } }] };
    };
    assert.equal(await verifiedPilotOwner(pool as any, "foreign", "production", official), null); assert.equal(calls, 0);
    assert.equal(await verifiedPilotOwner(pool as any, "synthetic-owner", "production", official), "synthetic-owner");
    assert.deepEqual(parameters[1], ["synthetic-owner", "production"]); assert.equal(calls, 1);
    assert.equal(await verifiedPilotOwner(pool as any, "synthetic-owner", "production", async () => ({
      id: "synthetic-owner", primaryEmailAddressId: "email-id", emailAddresses: [{ id: "email-id", verification: { status: "unverified" } }],
    })), null);
  });
});
describe("Nous public catalogue exact identity and integer rates", () => {
  it("distinguishes homonyms by exact IDs, excludes GLM/Hermes/batch and never confirms account pricing", () => {
    const row = (id: string, prompt: string, completion: string) => ({
      id, name: "DeepSeek V4.1 Flash", canonical_slug: id, supported_parameters: ["max_tokens"],
      pricing: { prompt, completion },
    });
    const result = parseNousCatalogue({ data: [
      row("deepseek/deepseek-v4.1-flash", "0.0000001060", "0.0000005130"),
      row("deepseek/deepseek-v4.1-flash:US", "0.0000003630", "0.0000010890"),
      row("deepseek/deepseek-v4-flash", "0.0000000300", "0.0000012800"),
      row("z-ai/glm-5.2", "0.0000009000", "0.0000028300"),
      row("deepseek/deepseek-v4.1-flash:batch", "0.0000001120", "0.0000003360"),
    ] }, 1_000_000);
    assert.equal(result.length, 2); assert.notEqual(result[0].key, result[1].key);
    assert.equal(result[0].inputUsdMicrosPerMillion, 106_000);
    assert.equal(result[1].outputUsdMicrosPerMillion, 1_089_000);
    assert.equal(result[0].validUntil, 1_060_000);
    assert.equal(result[0].accountPricingVerified, false);
    const changed = parseNousCatalogue({ data: [row("deepseek/deepseek-v4.1-flash", "0.0000001070", "0.0000005130")] }, 1_000_000);
    assert.notEqual(changed[0].priceVersion, result[0].priceVersion);
  });
  it("rejects ambiguous duplicate IDs and invalid rates, and executable quotes require account-effective price proof", async () => {
    for (const bad of ["NaN", "Infinity", "-1.0", "1e-7", "0.0000000000001", 0.0000001])
      assert.throws(() => nousRateMicros(bad), /MODEL_PRICE_UNCONFIRMED/);
    const row = { id: "deepseek/deepseek-v4.1-flash", canonical_slug: "id", supported_parameters: ["max_tokens"],
      pricing: { prompt: "0.0000001060", completion: "0.0000005130" } };
    assert.throws(() => parseNousCatalogue({ data: [row, row] }, 1), /MODEL_PRICE_UNCONFIRMED/);
    const f = fixture(); f.model.accountPricingVerified = false;
    await assert.rejects(f.quote(), /MODEL_PRICE_UNCONFIRMED/); assert.equal(f.calls(), 0);
  });
});
