import { createHash, randomUUID } from "node:crypto";
import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { PILOT_LIMITS, type PilotBudget, type PilotPosition } from "../shared/portfolio-pilot";
import { storage, pool } from "./storage";
import { PostgresPilotLedger } from "./portfolio-pilot-ledger";
import { verifiedPilotOwner, officialPilotIdentity } from "./portfolio-pilot-owner";
import { clerkClient } from "@clerk/express";
import type { EngineMarket } from "../shared/portfolio-pilot-engine";
import type { PilotRun, PilotExecutionContext } from "./portfolio-pilot-executor";
import { preparePrivatePilot } from "./portfolio-pilot-runtime";

// No display-name matching, first-account inference, browser flags, or environment escape hatch.
// No owner identity has been unequivocally bound for this preparation phase.
const OWNER_BINDING: string | null = null;
export const REAL_PORTFOLIO_PILOT_ENABLED = false as const;
export type PilotModel = {
  key: string; name: string; provider: string; modelId: string; priceVersion: string;
  inputUsdMicrosPerMillion: number; outputUsdMicrosPerMillion: number;
  verifiedAt: number; validUntil: number; source: string;
  accountPricingVerified?: boolean;
};
export type PilotMarket = { version: string; verifiedAt: number; source: string; validUntil: number; verified: boolean; prices: Record<string, number>; engine?: EngineMarket };
type Approval = { budgetId: string; fingerprint: string; approvedAt: number };
type Usage = { calls: number; inputTokens: number; outputTokens: number; costUsdMicros: number; retries: number; startedAt: number };
export type PilotAccountState = {
  budgets: PilotBudget[]; approval?: Approval;
  modelSelection?: { modelKey: string; modelId: string; selectedAt: number };
  active?: { budgetId: string; usage: Usage };
  runs?: PilotRun[];
  events: { type: string; budgetId: string; at: number; fingerprint: string }[];
};
/** An implementation must commit budgets, approval, reservations and audit atomically.
 * No in-memory production substitute exists; lack of a durable adapter fails closed. */
export interface PilotLedger {
  transaction<T>(owner: string, work: (state: PilotAccountState) => Promise<T>): Promise<T>;
}
export interface PilotDependencies {
  ownerId: string | null;
  positions(owner: string): Promise<PilotPosition[]>;
  models(): PilotModel[];
  market(): PilotMarket | null;
  executorReady: boolean;
  ledger: PilotLedger | null;
  now(): number;
  execute?: (pilot: PortfolioPilot, actor: string, budgetId: string) => Promise<PilotRun>;
  beforeAdmission?: (actor: string) => Promise<void>;
  requireModelSelection?: boolean;
  extraBlockers?: string[];
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function fail(code: string): never { throw new Error(code); }
const quoteInput = z.object({
  requestKey: z.string().uuid(), positionIds: z.array(z.string().min(1)).min(1).max(100),
  modelKey: z.string().min(1), maxSpendUsdMicros: z.number().int().positive().max(PILOT_LIMITS.ceilingUsdMicros),
}).strict().refine(v => new Set(v.positionIds).size === v.positionIds.length);
const approvalInput = z.object({
  budgetId: z.string().uuid(), fingerprint: z.string().length(64), confirm: z.literal(true),
}).strict();

export class PortfolioPilot {
  constructor(private readonly deps: PilotDependencies) {}
  private owner(actor: string) {
    if (!this.deps.ownerId || actor !== this.deps.ownerId) fail("PILOT_CLOSED");
  }
  status(actor: string) {
    const allowed = !!this.deps.ownerId && actor === this.deps.ownerId;
    const currentModels = this.deps.models().filter(m => m.validUntil > this.deps.now());
    const blockers = [
      ...(!allowed ? ["OWNER_ID_UNCONFIRMED"] : []),
      ...(!currentModels.length ? ["MODEL_PRICE_UNCONFIRMED"] : []),
      ...(currentModels.some(m => m.accountPricingVerified === false) ? ["ACCOUNT_TARIFF_UNVERIFIED"] : []),
      ...(!this.deps.market()?.verified ? ["MARKET_DATA_UNVERIFIED"] : []),
      ...(!this.deps.executorReady ? ["EXECUTOR_NOT_CONNECTED"] : []),
      ...(!this.deps.ledger ? ["DURABLE_AUDIT_NOT_READY"] : []),
      ...(!this.deps.execute ? ["REAL_EXECUTION_DISABLED"] : []),
      ...(this.deps.extraBlockers ?? []),
    ];
    return { allowed, mode: "preparation" as const, executable: allowed && !blockers.length,
      blockers, limits: PILOT_LIMITS,
      models: allowed ? currentModels
        .map(m => ({ key: m.key, name: m.name, priceVersion: m.priceVersion })) : [] };
  }
  async positions(actor: string) {
    this.owner(actor);
    return this.deps.positions(actor);
  }
  async selectModel(actor: string, raw: unknown) {
    this.owner(actor);
    const { modelKey } = z.object({ modelKey: z.string().min(1) }).strict().parse(raw);
    await this.deps.beforeAdmission?.(actor);
    const matches = this.deps.models().filter(model => model.key === modelKey &&
      model.validUntil > this.deps.now() && model.accountPricingVerified);
    if (matches.length !== 1) fail("MODEL_PRICE_UNCONFIRMED");
    if (!this.deps.ledger) fail("DURABLE_AUDIT_NOT_READY");
    return this.deps.ledger.transaction(actor, async state => {
      if (state.active) fail("EXECUTION_ACTIVE");
      if (state.modelSelection?.modelKey === modelKey) return { selected: true, executable: false };
      state.modelSelection = { modelKey, modelId: matches[0].modelId, selectedAt: this.deps.now() };
      state.approval = undefined;
      state.events.push({ type: "model_selected", budgetId: "model-selection", at: this.deps.now(),
        fingerprint: digest(state.modelSelection) });
      return { selected: true, executable: false };
    });
  }
  private async context(actor: string, ids: string[], modelKey: string) {
    this.owner(actor);
    await this.deps.beforeAdmission?.(actor);
    const now = this.deps.now();
    const all = await this.deps.positions(actor); // Owned snapshot, never client quantities or prices.
    const positions = ids.map(id => all.find(p => p.id === id) ?? fail("POSITION_NOT_OWNED"))
       .map(p => ({ ...p })).sort((a, b) => a.id.localeCompare(b.id));
    if (positions.some(p => !Number.isFinite(p.quantity) || p.quantity <= 0)) fail("QUANTITY_REQUIRED");
    const matches = this.deps.models().filter(m => m.key === modelKey);
    if (matches.length !== 1) fail("MODEL_PRICE_UNCONFIRMED");
    const model = matches[0];
    if (!model.provider || !model.modelId || !model.source || !model.priceVersion ||
        !Number.isFinite(model.verifiedAt) || model.verifiedAt > now ||
        !Number.isFinite(model.validUntil) || model.validUntil <= now ||
        ![model.inputUsdMicrosPerMillion, model.outputUsdMicrosPerMillion].every(n => Number.isSafeInteger(n) && n >= 0))
      fail("MODEL_PRICE_UNCONFIRMED");
    if (this.deps.execute && !model.accountPricingVerified) fail("MODEL_PRICE_UNCONFIRMED");
    const market = this.deps.market();
    if (!market?.verified || !market.version || !market.source || !Number.isFinite(market.verifiedAt) ||
        market.verifiedAt > now || !Number.isFinite(market.validUntil) || market.validUntil <= now ||
        positions.some(p => !Number.isFinite(market.prices[p.ticker]) || market.prices[p.ticker] <= 0))
      fail("MARKET_DATA_UNVERIFIED");
    if (!this.deps.executorReady) fail("EXECUTOR_NOT_CONNECTED");
    if (!this.deps.ledger) fail("DURABLE_AUDIT_NOT_READY");
     if (this.deps.execute && (!market.engine || market.engine.source !== market.source ||
         JSON.stringify(market.engine.prices) !== JSON.stringify(market.prices)))
       fail("MARKET_DATA_UNVERIFIED");
    const estimate = Number((BigInt(PILOT_LIMITS.inputTokens) * BigInt(model.inputUsdMicrosPerMillion)
      + BigInt(PILOT_LIMITS.outputTokens) * BigInt(model.outputUsdMicrosPerMillion) + BigInt(999_999)) / BigInt(1_000_000));
    if (!Number.isSafeInteger(estimate)) fail("BUDGET_EXCEEDED");
    // Includes complete owned snapshot: even a change in an unselected position invalidates approval.
    const { verifiedAt: _modelVerifiedAt, validUntil: _modelValidUntil, ...modelIdentityAndPrice } = model;
    const { verifiedAt: _marketVerifiedAt, validUntil: _marketValidUntil, ...marketData } = market;
    const fingerprint = digest({
      all: all.map(p => ({ id: p.id, ticker: p.ticker, quantity: p.quantity, revision: p.revision })).sort((a, b) => a.id.localeCompare(b.id)),
      positions, model: modelIdentityAndPrice, market: marketData, limits: PILOT_LIMITS,
    });
    return { positions, model, market, estimate, fingerprint };
  }
  async quote(actor: string, raw: unknown): Promise<PilotBudget> {
    this.owner(actor);
    const input = quoteInput.parse(raw);
    const context = await this.context(actor, input.positionIds, input.modelKey);
    if (context.estimate > input.maxSpendUsdMicros) fail("BUDGET_EXCEEDED");
    return this.deps.ledger!.transaction(actor, async state => {
      if (this.deps.requireModelSelection && state.modelSelection?.modelKey !== input.modelKey)
        fail("MODEL_SELECTION_REQUIRED");
      const prior = state.budgets.find(b => b.requestKey === input.requestKey);
      if (prior) {
        if (prior.fingerprint !== context.fingerprint || prior.maxSpendUsdMicros !== input.maxSpendUsdMicros)
          fail("IDEMPOTENCY_CONFLICT");
        if (prior.expiresAt <= this.deps.now()) fail("BUDGET_EXPIRED");
        return structuredClone(prior);
      }
      if (state.active) fail("EXECUTION_ACTIVE");
      const now = this.deps.now();
      const budget: PilotBudget = {
        id: randomUUID(), version: state.budgets.length + 1, requestKey: input.requestKey, owner: actor,
        fingerprint: context.fingerprint, modelKey: context.model.key, priceVersion: context.model.priceVersion,
         pricing: { modelId: context.model.modelId, provider: context.model.provider, source: context.model.source,
           inputUsdMicrosPerMillion: context.model.inputUsdMicrosPerMillion,
           outputUsdMicrosPerMillion: context.model.outputUsdMicrosPerMillion,
           verifiedAt: context.model.verifiedAt, validUntil: context.model.validUntil,
           accountPricingVerified: context.model.accountPricingVerified === true },
        positions: context.positions, createdAt: now,
        expiresAt: Math.min(now + PILOT_LIMITS.validityMs, context.model.validUntil, context.market.validUntil),
        maxSpendUsdMicros: input.maxSpendUsdMicros, estimatedMaxUsdMicros: context.estimate,
         limits: PILOT_LIMITS, executable: !!this.deps.execute,
        sharing: ["Somente ativos e quantidades selecionados, dados de mercado verificados e resultados derivados.",
          "Destinatário previsto: " + context.model.provider + " / " + context.model.modelId,
          "Sem nome, contato, identificador da conta, credenciais ou arquivos do notebook.",
          "Preparar o orçamento não envia dados. Qualquer execução exige aprovação específica antes do compartilhamento."],
      };
      state.budgets.push(budget);
      state.approval = undefined;
      state.events.push({ type: "budget_prepared", budgetId: budget.id, at: now, fingerprint: budget.fingerprint });
      return structuredClone(budget);
    });
  }
  private async validBudget(actor: string, state: PilotAccountState, id: string) {
    const budget = state.budgets.find(b => b.id === id);
    if (!budget || budget.owner !== actor) fail("BUDGET_NOT_FOUND");
    if (this.deps.requireModelSelection && state.modelSelection?.modelKey !== budget.modelKey)
      fail("APPROVAL_INVALIDATED");
    if (budget.expiresAt <= this.deps.now()) fail("BUDGET_EXPIRED");
    const current = await this.context(actor, budget.positions.map(p => p.id), budget.modelKey);
    if (current.fingerprint !== budget.fingerprint) fail("APPROVAL_INVALIDATED");
    return budget;
  }
  async approve(actor: string, raw: unknown) {
    this.owner(actor);
    const input = approvalInput.parse(raw);
    if (!this.deps.ledger) fail("DURABLE_AUDIT_NOT_READY");
    return this.deps.ledger!.transaction(actor, async state => {
      const budget = await this.validBudget(actor, state, input.budgetId);
      if (budget.fingerprint !== input.fingerprint) fail("APPROVAL_INVALIDATED");
      if (state.active) fail("EXECUTION_ACTIVE");
      if (state.approval?.budgetId === budget.id && state.approval.fingerprint === budget.fingerprint)
        return { approved: true, executable: false };
      state.approval = { budgetId: budget.id, fingerprint: budget.fingerprint, approvedAt: this.deps.now() };
      state.events.push({ type: "preparation_approved", budgetId: budget.id, at: this.deps.now(), fingerprint: budget.fingerprint });
      return { approved: true, executable: !!this.deps.execute };
    });
  }
  /** Admission/usage controls only; no provider dispatch exists.
   * Test adapters exercise these reservations with a fake provider. */
  async reserve(actor: string, budgetId: string, usage: Omit<Usage, "startedAt">) {
    this.owner(actor);
    if (!this.deps.ledger) fail("DURABLE_AUDIT_NOT_READY");
    return this.deps.ledger!.transaction(actor, async state => {
      const budget = await this.validBudget(actor, state, budgetId);
      if (state.approval?.budgetId !== budget.id || state.approval.fingerprint !== budget.fingerprint) fail("APPROVAL_REQUIRED");
      if (state.active && state.active.budgetId !== budgetId) fail("EXECUTION_ACTIVE");
      const previous = state.active?.usage ?? { calls: 0, inputTokens: 0, outputTokens: 0, costUsdMicros: 0, retries: 0, startedAt: this.deps.now() };
      if (!Object.values(usage).every(n => Number.isSafeInteger(n) && n >= 0) || usage.calls !== 1) fail("INVALID_USAGE");
      const total = { ...previous, calls: previous.calls + usage.calls, inputTokens: previous.inputTokens + usage.inputTokens,
        outputTokens: previous.outputTokens + usage.outputTokens, costUsdMicros: previous.costUsdMicros + usage.costUsdMicros,
        retries: previous.retries + usage.retries };
      // Costs are reserved by a future trusted executor, not exposed as a client API.
      if (total.calls > PILOT_LIMITS.calls || total.inputTokens > PILOT_LIMITS.inputTokens ||
          total.outputTokens > PILOT_LIMITS.outputTokens || total.retries > PILOT_LIMITS.retries ||
          total.costUsdMicros > budget.maxSpendUsdMicros || this.deps.now() - total.startedAt >= PILOT_LIMITS.timeoutMs)
        fail("BUDGET_EXCEEDED");
      state.active = { budgetId, usage: total };
      state.events.push({ type: "usage_reserved_without_dispatch", budgetId, at: this.deps.now(), fingerprint: budget.fingerprint });
      return structuredClone(total);
    });
  }
  execute(actor: string, raw?: unknown): Promise<PilotRun> {
    this.owner(actor);
    if (!this.deps.executorReady || !this.deps.execute) fail("REAL_EXECUTION_DISABLED");
    const { budgetId } = z.object({ budgetId: z.string().uuid() }).strict().parse(raw);
    return this.deps.execute(this, actor, budgetId);
  }
  /** Trusted executor access only; never serialized as a route response. */
  async executionContext(actor: string, budgetId: string): Promise<PilotExecutionContext> {
    this.owner(actor);
    if (!this.deps.ledger) fail("DURABLE_AUDIT_NOT_READY");
    return this.deps.ledger.transaction(actor, async state => {
      const budget = await this.validBudget(actor, state, budgetId);
      const context = await this.context(actor, budget.positions.map(p => p.id), budget.modelKey);
      if (state.approval?.budgetId !== budget.id || state.approval.fingerprint !== budget.fingerprint) fail("APPROVAL_REQUIRED");
      if (!context.market.engine || context.market.engine.source !== context.market.source ||
          JSON.stringify(context.market.engine.prices) !== JSON.stringify(context.market.prices)) fail("MARKET_DATA_UNVERIFIED");
      return { budget, model: context.model, market: context.market.engine };
    });
  }
  async runTransaction<T>(actor: string, work: (state: PilotAccountState) => Promise<T>) {
    this.owner(actor);
    if (!this.deps.ledger) fail("DURABLE_AUDIT_NOT_READY");
    return this.deps.ledger.transaction(actor, work);
  }
  async history(actor: string) {
    return this.runTransaction(actor, async state => structuredClone(state.runs ?? []));
  }
  clock() { return this.deps.now(); }
}

export const portfolioPilot = new PortfolioPilot({
  ownerId: OWNER_BINDING, executorReady: false, ledger: new PostgresPilotLedger(pool), models: () => [], market: () => null,
  now: Date.now,
  positions: async owner => (await storage.getPortfolioSnapshot(owner)).positions
    .map(p => ({ id: p.ticker, ticker: p.ticker, quantity: p.quantity, revision: digest(p) })),
});
async function resolveRuntimePilot(actor: string): Promise<PortfolioPilot> {
  const ownerId = await verifiedPilotOwner(pool, actor, process.env.NODE_ENV === "production" ? "production" : "development",
    id => clerkClient.users.getUser(id));
  return preparePrivatePilot({
    ownerId, ledger: new PostgresPilotLedger(pool),
    credential: () => process.env.NOUS_INFERENCE_API_KEY || process.env.NOUS_API_KEY,
    armed: REAL_PORTFOLIO_PILOT_ENABLED,
    positions: async owner => (await storage.getPortfolioSnapshot(owner)).positions
      .map(p => ({ id: p.ticker, ticker: p.ticker, quantity: p.quantity, revision: digest(p) })),
  });
}
export function registerPortfolioPilotRoutes(app: Express, auth: RequestHandler, pilot?: PortfolioPilot) {
  const privateResponse: RequestHandler = (_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); };
  const handle = (work: (p: PortfolioPilot, actor: string, body: unknown) => unknown): RequestHandler => async (req, res) => {
    try {
      const instance = pilot ?? await resolveRuntimePilot(req.userId!);
      res.json(await work(instance, req.userId!, req.body));
    }
    catch (error) {
      const code = error instanceof z.ZodError ? "INVALID_REQUEST" : error instanceof Error ? error.message : "";
      const known = /^(PILOT_CLOSED|POSITION_NOT_OWNED|QUANTITY_REQUIRED|MODEL_PRICE_UNCONFIRMED|MODEL_SELECTION_REQUIRED|MARKET_DATA_UNVERIFIED|NOUS_CREDENTIAL_UNAVAILABLE|ACCOUNT_TARIFF_UNVERIFIED|EXECUTOR_NOT_CONNECTED|DURABLE_AUDIT_NOT_READY|BUDGET_EXCEEDED|IDEMPOTENCY_CONFLICT|BUDGET_EXPIRED|EXECUTION_ACTIVE|BUDGET_NOT_FOUND|APPROVAL_INVALIDATED|APPROVAL_REQUIRED|REAL_EXECUTION_DISABLED|INVALID_REQUEST)$/;
      res.status(code === "PILOT_CLOSED" || code === "REAL_EXECUTION_DISABLED" ? 403 :
        code === "BUDGET_NOT_FOUND" ? 404 : code === "INVALID_REQUEST" ? 400 : known.test(code) ? 409 : 503)
        .json({ error: known.test(code) ? code : "PILOT_UNAVAILABLE", executable: false });
    }
  };
  // Official self-account evidence only. This does NOT grant or bind owner access.
  // The owner must attest this exact subject through the trusted operator conversation.
  if (!pilot) app.get("/api/investments/portfolio-pilot/identity-check", auth, privateResponse, async (req, res) => {
    try {
      const proof = await officialPilotIdentity(req.userId!,
        process.env.NODE_ENV === "production" ? "production" : "development", id => clerkClient.users.getUser(id));
      res.json({ environment: proof.environment, authenticated: true, primaryEmailVerified: true,
        ownerBound: false, executable: false, auditRecorded: false });
    } catch (error) {
      const unverified = error instanceof Error && error.message === "VERIFIED_IDENTITY_REQUIRED";
      res.status(unverified ? 403 : 503).json({
        code: unverified ? "VERIFIED_IDENTITY_REQUIRED" : "IDENTITY_VERIFICATION_UNAVAILABLE", executable: false });
    }
  });
  if (!pilot) app.get("/api/investments/portfolio-pilot/identity", auth, privateResponse, async (req, res) => {
    try {
      const actor = req.userId!;
      const environment = process.env.NODE_ENV === "production" ? "production" : "development";
      const identity = await officialPilotIdentity(actor, environment, id => clerkClient.users.getUser(id));
      const proof = identity.fingerprint;
      await new PostgresPilotLedger(pool).transaction(actor, async state => {
        if (!state.events.some(e => e.type === `identity_verified:${environment}` && e.fingerprint === proof))
          state.events.push({ type: `identity_verified:${environment}`, budgetId: "identity-attestation",
            at: Date.now(), fingerprint: proof });
      });
      res.json({ environment, verified: true, ownerBound: false, executable: false, auditRecorded: true,
        nextStep: "A evidência oficial foi registrada. O vínculo exige conferência independente do operador e não concede acesso real." });
    } catch { res.status(503).json({ code: "IDENTITY_VERIFICATION_UNAVAILABLE", executable: false }); }
  });
  app.get("/api/investments/portfolio-pilot/status", auth, privateResponse, handle((p, actor) => p.status(actor)));
  app.get("/api/investments/portfolio-pilot/positions", auth, privateResponse, handle((p, actor) => p.positions(actor)));
  app.post("/api/investments/portfolio-pilot/budgets", auth, privateResponse, handle((p, actor, body) => p.quote(actor, body)));
  app.post("/api/investments/portfolio-pilot/model-selection", auth, privateResponse, handle((p, actor, body) => p.selectModel(actor, body)));
  app.post("/api/investments/portfolio-pilot/approvals", auth, privateResponse, handle((p, actor, body) => p.approve(actor, body)));
  app.post("/api/investments/portfolio-pilot/execute", auth, privateResponse, handle((p, actor, body) => p.execute(actor, body)));
  app.get("/api/investments/portfolio-pilot/history", auth, privateResponse, handle((p, actor) => p.history(actor)));
}
