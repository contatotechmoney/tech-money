import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it, mock } from "node:test";
import { readFileSync } from "node:fs";
import express from "express";
import { PortfolioPilot, portfolioPilot, registerPortfolioPilotRoutes, type PilotAccountState, type PilotDependencies, type PilotLedger } from "./portfolio-pilot";
import { PILOT_LIMITS } from "../shared/portfolio-pilot";

// Disposable, synthetic-only transaction adapter. Never imported by the application.
class FakeLedger implements PilotLedger {
  states = new Map<string, PilotAccountState>();
  tails = new Map<string, Promise<unknown>>();
  async transaction<T>(owner: string, work: (state: PilotAccountState) => Promise<T>): Promise<T> {
    const prior = this.tails.get(owner) ?? Promise.resolve();
    const task = prior.catch(() => {}).then(async () => {
      const state = structuredClone(this.states.get(owner) ?? { budgets: [], events: [] });
      const result = await work(state);
      this.states.set(owner, state);
      return result;
    });
    this.tails.set(owner, task);
    return task;
  }
}
function fixture() {
  let now = 1_000_000;
  const ledger = new FakeLedger();
  const deps: PilotDependencies = {
    ownerId: "synthetic-explicit-owner", executorReady: true, ledger, now: () => now,
    positions: async actor => actor === "synthetic-explicit-owner"
      ? [{ id: "SYN_A", ticker: "SYN_A", quantity: 10, revision: "v1" },
        { id: "SYN_B", ticker: "SYN_B", quantity: 20, revision: "v1" }] : [],
    models: () => [{
      key: "synthetic-provider:model-A:tariff-A", name: "Identical display name",
      provider: "fake", modelId: "synthetic-A", priceVersion: "synthetic-price-1",
      inputUsdMicrosPerMillion: 100_000, outputUsdMicrosPerMillion: 1_000_000,
      verifiedAt: now - 1, validUntil: 2_000_000, source: "synthetic-fixture",
    }],
    market: () => ({ version: "synthetic-market-v1", verified: true, verifiedAt: 999_999,
      source: "synthetic-fixture", validUntil: 2_000_000, prices: { SYN_A: 100, SYN_B: 200 } }),
  };
  // Freeze catalogue verification timestamp across clock changes.
  const initialModels = deps.models(); deps.models = () => initialModels;
  const pilot = new PortfolioPilot(deps);
  const input = () => ({ requestKey: randomUUID(), positionIds: ["SYN_A"], modelKey: initialModels[0].key, maxSpendUsdMicros: 10_000 });
  const approval = (b: Awaited<ReturnType<PortfolioPilot["quote"]>>) => ({ budgetId: b.id, fingerprint: b.fingerprint, confirm: true });
  return { pilot, deps, ledger, input, approval, actor: deps.ownerId!, setNow: (value: number) => { now = value; } };
}
const usage = { calls: 1, inputTokens: 100, outputTokens: 100, costUsdMicros: 100, retries: 0 };

describe("owner portfolio pre-execution preparation, entirely synthetic", () => {
  it("production has durable ledger but no owner binding, catalogue, executor or real dispatch", async () => {
    assert.deepEqual(portfolioPilot.status("any-account").models, []);
    assert.equal(portfolioPilot.status("any-account").allowed, false);
    await assert.rejects(portfolioPilot.positions("any-account"), /PILOT_CLOSED/);
    await assert.rejects(portfolioPilot.quote("any-account", {}), /PILOT_CLOSED/);
    assert.throws(() => portfolioPilot.execute("any-account"), /PILOT_CLOSED/);
    assert.equal(portfolioPilot.status("any-account").blockers.length, 5);
  });
  it("neither display name, first user nor client-provided identity authorizes access", async () => {
    const f = fixture();
    for (const actor of ["first-account", "owner-display-name", "synthetic-other-user", ""]) {
      await assert.rejects(f.pilot.positions(actor), /PILOT_CLOSED/);
      await assert.rejects(f.pilot.quote(actor, f.input()), /PILOT_CLOSED/);
      await assert.rejects(f.pilot.approve(actor, {}), /PILOT_CLOSED/);
    }
    assert.equal(f.ledger.states.size, 0);
  });
  it("requires owned selections and rejects client quantities, costs, balances and principals", async () => {
    const f = fixture();
    await assert.rejects(f.pilot.quote(f.actor, { ...f.input(), positionIds: ["other-account-position"] }), /POSITION_NOT_OWNED/);
    for (const key of ["owner", "quantity", "cost", "balance", "price", "positions", "model"]) {
      await assert.rejects(f.pilot.quote(f.actor, { ...f.input(), [key]: "forged" }));
    }
    await assert.rejects(f.pilot.quote(f.actor, { ...f.input(), positionIds: ["SYN_A", "SYN_A"] }));
    assert.equal(f.ledger.states.size, 0);
  });
  it("never substitutes equal simulated weights for missing quantities", async () => {
    const f = fixture();
    for (const quantity of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      f.deps.positions = async () => [{ id: "SYN_A", ticker: "SYN_A", quantity }];
      await assert.rejects(f.pilot.quote(f.actor, f.input()), /QUANTITY_REQUIRED/);
    }
  });
  it("blocks missing/unverified market, exact model pricing, executor and durable audit", async () => {
    for (const kind of ["market", "model", "executor", "audit"]) {
      const f = fixture();
      if (kind === "market") f.deps.market = () => null;
      if (kind === "model") f.deps.models = () => [];
      if (kind === "executor") f.deps.executorReady = false;
      if (kind === "audit") f.deps.ledger = null;
      await assert.rejects(f.pilot.quote(f.actor, f.input()),
        /MARKET_DATA_UNVERIFIED|MODEL_PRICE_UNCONFIRMED|EXECUTOR_NOT_CONNECTED|DURABLE_AUDIT_NOT_READY/);
    }
  });
  it("does not select a model by ambiguous name or presume a tariff", async () => {
    const f = fixture(); const first = f.deps.models()[0];
    f.deps.models = () => [first, { ...first, key: "synthetic-provider:model-B:tariff-B", modelId: "synthetic-B", outputUsdMicrosPerMillion: 2_000_000 }];
    await assert.rejects(f.pilot.quote(f.actor, { ...f.input(), modelKey: first.name }), /MODEL_PRICE_UNCONFIRMED/);
    assert.equal((await f.pilot.quote(f.actor, f.input())).estimatedMaxUsdMicros, 7800);
    f.deps.models = () => [{ ...first, inputUsdMicrosPerMillion: Number.NaN }];
    await assert.rejects(f.pilot.quote(f.actor, f.input()), /MODEL_PRICE_UNCONFIRMED/);
  });
  it("produces a versioned non-executable budget and explicit auditable preparation approval", async () => {
    const f = fixture(); const b = await f.pilot.quote(f.actor, f.input());
    assert.equal(b.version, 1); assert.equal(b.executable, false);
    assert.equal(b.expiresAt - b.createdAt, PILOT_LIMITS.validityMs);
    assert.equal(b.positions[0].quantity, 10);
    assert.ok(b.sharing.some(s => s.includes("Preparar o orçamento não envia dados")));
    assert.deepEqual(await f.pilot.approve(f.actor, f.approval(b)), { approved: true, executable: false });
    assert.throws(() => f.pilot.execute(f.actor), /REAL_EXECUTION_DISABLED/);
    assert.deepEqual(f.ledger.states.get(f.actor)!.events.map(e => e.type), ["budget_prepared", "preparation_approved"]);
  });
  it("requires an existing budget and explicit fingerprint-bound consent before reservations", async () => {
    const f = fixture();
    await assert.rejects(f.pilot.reserve(f.actor, randomUUID(), usage), /BUDGET_NOT_FOUND/);
    const b = await f.pilot.quote(f.actor, f.input());
    await assert.rejects(f.pilot.reserve(f.actor, b.id, usage), /APPROVAL_REQUIRED/);
    await assert.rejects(f.pilot.approve(f.actor, { ...f.approval(b), confirm: false }));
    await assert.rejects(f.pilot.approve(f.actor, { ...f.approval(b), fingerprint: "a".repeat(64) }), /APPROVAL_INVALIDATED/);
  });
  it("expires at the exact boundary and shorter upstream validity", async () => {
    const f = fixture(); const b = await f.pilot.quote(f.actor, f.input());
    f.setNow(b.expiresAt);
    await assert.rejects(f.pilot.approve(f.actor, f.approval(b)), /BUDGET_EXPIRED/);
    const g = fixture(); const m = g.deps.models()[0]; g.deps.models = () => [{ ...m, validUntil: 1_000_010 }];
    assert.equal((await g.pilot.quote(g.actor, g.input())).expiresAt, 1_000_010);
  });
  it("invalidates changed selected/unselected quantities, revision, model price and market prices", async () => {
    for (const kind of ["selected", "unselected", "revision", "model", "market"]) {
      const f = fixture(); const b = await f.pilot.quote(f.actor, f.input());
      await f.pilot.approve(f.actor, f.approval(b));
      if (kind === "selected" || kind === "unselected" || kind === "revision") {
        const rows = await f.deps.positions(f.actor);
        if (kind === "revision") rows[0].revision = "v2";
        else rows[kind === "selected" ? 0 : 1].quantity++;
        f.deps.positions = async () => rows;
      } else if (kind === "model") {
        const m = f.deps.models()[0]; f.deps.models = () => [{ ...m, outputUsdMicrosPerMillion: 2_000_000 }];
      } else {
        const m = f.deps.market()!; f.deps.market = () => ({ ...m, prices: { ...m.prices, SYN_A: 101 } });
      }
      await assert.rejects(f.pilot.reserve(f.actor, b.id, usage), /APPROVAL_INVALIDATED/);
    }
  });
  it("coalesces concurrent double-click budgets/approvals and rejects changed retries", async () => {
    const f = fixture(); const input = f.input();
    const budgets = await Promise.all(Array.from({ length: 10 }, () => f.pilot.quote(f.actor, input)));
    assert.equal(new Set(budgets.map(b => b.id)).size, 1);
    await Promise.all(Array.from({ length: 10 }, () => f.pilot.approve(f.actor, f.approval(budgets[0]))));
    assert.equal(f.ledger.states.get(f.actor)!.events.length, 2);
    await assert.rejects(f.pilot.quote(f.actor, { ...input, maxSpendUsdMicros: 9000 }), /IDEMPOTENCY_CONFLICT/);
  });
  it("enforces ceiling, token/call/time/retry limits, atomic concurrency and one active budget", async () => {
    const f = fixture();
    await assert.rejects(f.pilot.quote(f.actor, { ...f.input(), maxSpendUsdMicros: 1 }), /BUDGET_EXCEEDED/);
    await assert.rejects(f.pilot.quote(f.actor, { ...f.input(), maxSpendUsdMicros: PILOT_LIMITS.ceilingUsdMicros + 1 }));
    const b = await f.pilot.quote(f.actor, f.input());
    await f.pilot.approve(f.actor, f.approval(b));
    for (const excessive of [
      { ...usage, costUsdMicros: b.maxSpendUsdMicros + 1 }, { ...usage, inputTokens: PILOT_LIMITS.inputTokens + 1 },
      { ...usage, outputTokens: PILOT_LIMITS.outputTokens + 1 }, { ...usage, retries: 1 },
    ]) await assert.rejects(f.pilot.reserve(f.actor, b.id, excessive), /BUDGET_EXCEEDED/);
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => f.pilot.reserve(f.actor, b.id, usage)));
    assert.equal(results.filter(r => r.status === "fulfilled").length, 6);
    assert.equal(f.ledger.states.get(f.actor)!.active!.usage.calls, 6);
    await assert.rejects(f.pilot.quote(f.actor, f.input()), /EXECUTION_ACTIVE/);
    const g = fixture(); const gb = await g.pilot.quote(g.actor, g.input()); await g.pilot.approve(g.actor, g.approval(gb));
    await g.pilot.reserve(g.actor, gb.id, usage); g.setNow(1_000_000 + PILOT_LIMITS.timeoutMs);
    await assert.rejects(g.pilot.reserve(g.actor, gb.id, usage), /BUDGET_EXCEEDED/);
  });
  it("uses only a local fake provider for budget enforcement and never dispatches real execution", async () => {
    const f = fixture(); const b = await f.pilot.quote(f.actor, f.input()); await f.pilot.approve(f.actor, f.approval(b));
    let fakeCalls = 0;
    const fakeProvider = async () => { fakeCalls++; return { synthetic: true }; };
    const network = mock.method(globalThis, "fetch", async () => { throw Error("REAL_NETWORK_FORBIDDEN"); });
    try {
      await f.pilot.reserve(f.actor, b.id, usage); await fakeProvider();
      assert.throws(() => f.pilot.execute(f.actor), /REAL_EXECUTION_DISABLED/);
      await assert.rejects(f.pilot.reserve(f.actor, b.id, { ...usage, costUsdMicros: 100_000 }), /BUDGET_EXCEEDED/);
      assert.equal(fakeCalls, 1); assert.equal(network.mock.callCount(), 0);
    } finally { network.mock.restore(); }
  });
  it("protects HTTP endpoints, denies spoofing and stays closed without querying positions", async () => {
    const app = express(); app.use(express.json());
    let reads = 0;
    const d = fixture().deps; d.ownerId = null; d.positions = async () => { reads++; return []; };
    registerPortfolioPilotRoutes(app, (req, res, next) => {
      const actor = req.headers["x-synthetic-actor"];
      if (!actor) { res.status(401).end(); return; }
      req.userId = String(actor); next();
    }, new PortfolioPilot(d));
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address() as { port: number }; const base = `http://127.0.0.1:${address.port}/api/investments/portfolio-pilot`;
    try {
      assert.equal((await fetch(base + "/status")).status, 401);
      for (const [path, method] of [["positions", "GET"], ["budgets", "POST"], ["approvals", "POST"], ["execute", "POST"]]) {
        const response = await fetch(base + "/" + path, { method, headers: {
          "x-synthetic-actor": "first-account", "content-type": "application/json",
        }, ...(method === "POST" ? { body: JSON.stringify({ owner: "first-account", allowed: true }) } : {}) });
        assert.equal(response.status, 403); assert.match(response.headers.get("cache-control")!, /no-store/);
      }
      assert.equal(reads, 0);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
  it("has no network engine/credit/billing dependency and production auth remains Clerk", () => {
    const source = readFileSync("server/portfolio-pilot.ts", "utf8");
    assert.doesNotMatch(source, /fetch\(|yfinance|runAgents|runCommittee|guardRun|criarCheckout|process\.env\.(?:LLM|HERMES|PILOT_OWNER)/);
    assert.match(readFileSync("server/routes.ts", "utf8"), /registerPortfolioPilotRoutes\(app, requireAuth\)/);
  });
});
