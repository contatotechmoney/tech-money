/**
 * Créditos e travas de proteção do comitê de agentes.
 *
 * Motivação: o custo de UMA consulta é ~R$ 0,06 (medido), então o risco do produto
 * NÃO é margem — é "denial of wallet": um bot martelando o endpoint pode gerar
 * milhares de reais de fatura. Estas travas existem para cobrar E para proteger.
 *
 * Travas (todas verificadas antes de gastar 1 token de LLM):
 *   1. Circuit breaker global  — teto de gasto/dia somando TODOS os usuários (a mais importante)
 *   2. Rate limit por usuário  — N por hora e por dia
 *   3. Débito de crédito atômico (ledger append-only, sem saldo sobrescrito)
 *   4. Lock de concorrência    — 1 execução por vez por usuário
 *   5. Log de auditoria        — quem, quando, ticker, tokens, custo (exigência CVM Art. 17)
 *   + Idempotência por chave   — reenvio não cobra duas vezes
 *
 * Config por env (com defaults seguros):
 *   CREDIT_RATE_PER_HOUR (5) · CREDIT_RATE_PER_DAY (20) · GLOBAL_DAILY_COST_CAP_BRL (50)
 *   FREE_CREDITS_ON_SIGNUP (1) · LLM_USD_BRL (5.40) · LLM_PRICE_IN_USD_PER_M (0.27) · LLM_PRICE_OUT_USD_PER_M (1.10)
 */
import { randomUUID } from "crypto";
import type { Pool } from "pg";

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(+v) ? +v : d);
const CFG = {
  rateHour: num(process.env.CREDIT_RATE_PER_HOUR, 5),
  rateDay: num(process.env.CREDIT_RATE_PER_DAY, 20),
  dailyCapBrl: num(process.env.GLOBAL_DAILY_COST_CAP_BRL, 50),
  freeOnSignup: num(process.env.FREE_CREDITS_ON_SIGNUP, 1),
  usdBrl: num(process.env.LLM_USD_BRL, 5.4),
  priceIn: num(process.env.LLM_PRICE_IN_USD_PER_M, 0.27),
  priceOut: num(process.env.LLM_PRICE_OUT_USD_PER_M, 1.1),
};

export type Comite = "rv" | "rf";
export type LedgerTipo = "grant" | "debit" | "refund";

export function estimarCustoBrl(tokensIn: number, tokensOut: number): number {
  const usd = (tokensIn * CFG.priceIn + tokensOut * CFG.priceOut) / 1e6;
  return Math.round(usd * CFG.usdBrl * 10000) / 10000;
}

export interface RunRow {
  id: string;
  user_id: string;
  ticker: string;
  comite: string;
  status: string;
  tokens_in: number;
  tokens_out: number;
  custo_brl: number;
  idempotency_key: string | null;
  criado_em: string;
}

export interface DebitResult {
  ok: boolean;
  motivo?: string;
}

export interface CreditStore {
  ensureSchema(): Promise<void>;
  balance(userId: string): Promise<number>;
  grantOnce(userId: string, qtd: number, motivo: string): Promise<boolean>;
  grant(userId: string, qtd: number, motivo: string): Promise<void>;
  runsSince(userId: string, ms: number): Promise<number>;
  globalSpendBrlSince(ms: number): Promise<number>;
  hasRunning(userId: string): Promise<boolean>;
  findByKey(key: string): Promise<RunRow | null>;
  debitAtomic(userId: string, qtd: number, runId: string, motivo: string): Promise<DebitResult>;
  insertRun(row: Omit<RunRow, "criado_em"> & { ip?: string | null }): Promise<void>;
  finishRun(runId: string, status: string, tokensIn: number, tokensOut: number, custoBrl: number, erro?: string | null): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* Implementação Postgres                                              */
/* ------------------------------------------------------------------ */
export class PostgresCreditStore implements CreditStore {
  private pool: Pool | null;
  constructor(pool?: Pool) {
    this.pool = pool ?? null;
  }
  /** Carrega o driver `pg` só quando realmente usado (permite testar sem banco). */
  private async db(): Promise<Pool> {
    if (!this.pool) {
      const { Pool } = await import("pg");
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    }
    return this.pool;
  }
  async ensureSchema() {
    const db = await this.db();
    await db.query(`
      CREATE TABLE IF NOT EXISTS credits_ledger (
        id bigserial PRIMARY KEY,
        user_id text NOT NULL,
        tipo text NOT NULL CHECK (tipo IN ('grant','debit','refund')),
        qtd integer NOT NULL,
        run_id text,
        motivo text,
        criado_em timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS credits_ledger_user_idx ON credits_ledger (user_id, criado_em DESC);
      CREATE TABLE IF NOT EXISTS agent_runs (
        id text PRIMARY KEY,
        user_id text NOT NULL,
        ticker text NOT NULL,
        comite text NOT NULL,
        status text NOT NULL,
        tokens_in integer NOT NULL DEFAULT 0,
        tokens_out integer NOT NULL DEFAULT 0,
        custo_brl numeric(12,4) NOT NULL DEFAULT 0,
        idempotency_key text UNIQUE,
        ip text,
        erro text,
        criado_em timestamptz NOT NULL DEFAULT now(),
        fim_em timestamptz
      );
      CREATE INDEX IF NOT EXISTS agent_runs_user_time_idx ON agent_runs (user_id, criado_em DESC);
      CREATE INDEX IF NOT EXISTS agent_runs_status_idx ON agent_runs (status);
    `);
  }
  async balance(userId: string) {
    const r = await (await this.db()).query(
      `SELECT COALESCE(SUM(CASE tipo WHEN 'debit' THEN -qtd ELSE qtd END),0)::int AS b
       FROM credits_ledger WHERE user_id=$1`, [userId]);
    return r.rows[0]?.b ?? 0;
  }
  async grantOnce(userId: string, qtd: number, motivo: string) {
    const r = await (await this.db()).query(
      `INSERT INTO credits_ledger (user_id,tipo,qtd,motivo)
       SELECT $1,'grant',$2,$3
       WHERE NOT EXISTS (SELECT 1 FROM credits_ledger WHERE user_id=$1 AND motivo=$3)
       RETURNING id`, [userId, qtd, motivo]);
    return r.rowCount === 1;
  }
  async grant(userId: string, qtd: number, motivo: string) {
    await (await this.db()).query(
      `INSERT INTO credits_ledger (user_id,tipo,qtd,motivo) VALUES ($1,'grant',$2,$3)`,
      [userId, qtd, motivo]);
  }
  async runsSince(userId: string, ms: number) {
    const r = await (await this.db()).query(
      `SELECT COUNT(*)::int AS n FROM agent_runs WHERE user_id=$1 AND criado_em > now() - ($2 || ' milliseconds')::interval`,
      [userId, ms]);
    return r.rows[0]?.n ?? 0;
  }
  async globalSpendBrlSince(ms: number) {
    const r = await (await this.db()).query(
      `SELECT COALESCE(SUM(custo_brl),0)::float AS s FROM agent_runs WHERE criado_em > now() - ($1 || ' milliseconds')::interval`,
      [ms]);
    return r.rows[0]?.s ?? 0;
  }
  async hasRunning(userId: string) {
    const r = await (await this.db()).query(
      `SELECT 1 FROM agent_runs WHERE user_id=$1 AND status='running' LIMIT 1`, [userId]);
    return (r.rowCount ?? 0) > 0;
  }
  async findByKey(key: string) {
    const r = await (await this.db()).query(`SELECT * FROM agent_runs WHERE idempotency_key=$1`, [key]);
    return (r.rows[0] as RunRow) ?? null;
  }
  async debitAtomic(userId: string, qtd: number, runId: string, motivo: string): Promise<DebitResult> {
    const r = await (await this.db()).query(
      `INSERT INTO credits_ledger (user_id,tipo,qtd,run_id,motivo)
       SELECT $1,'debit',$2,$3,$4
       WHERE (SELECT COALESCE(SUM(CASE tipo WHEN 'debit' THEN -qtd ELSE qtd END),0)
              FROM credits_ledger WHERE user_id=$1) >= $2
       RETURNING id`, [userId, qtd, runId, motivo]);
    return r.rowCount === 1 ? { ok: true } : { ok: false, motivo: "créditos insuficientes" };
  }
  async insertRun(row: Omit<RunRow, "criado_em"> & { ip?: string | null }) {
    await (await this.db()).query(
      `INSERT INTO agent_runs (id,user_id,ticker,comite,status,tokens_in,tokens_out,custo_brl,idempotency_key,ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [row.id, row.user_id, row.ticker, row.comite, row.status, row.tokens_in, row.tokens_out,
       row.custo_brl, row.idempotency_key, row.ip ?? null]);
  }
  async finishRun(runId: string, status: string, tokensIn: number, tokensOut: number, custoBrl: number, erro?: string | null) {
    await (await this.db()).query(
      `UPDATE agent_runs SET status=$2,tokens_in=$3,tokens_out=$4,custo_brl=$5,erro=$6,fim_em=now() WHERE id=$1`,
      [runId, status, tokensIn, tokensOut, custoBrl, erro ?? null]);
  }
}

/* ------------------------------------------------------------------ */
/* Implementação em memória (testes)                                   */
/* ------------------------------------------------------------------ */
export class MemoryCreditStore implements CreditStore {
  ledger: Array<{ user_id: string; tipo: LedgerTipo; qtd: number; motivo: string }> = [];
  runs: RunRow[] = [];
  private clock = 0;
  agora(ms: number) { this.clock = ms; }
  async ensureSchema() {}
  async balance(userId: string) {
    return this.ledger.filter((l) => l.user_id === userId)
      .reduce((a, l) => a + (l.tipo === "debit" ? -l.qtd : l.qtd), 0);
  }
  async grantOnce(userId: string, qtd: number, motivo: string) {
    if (this.ledger.some((l) => l.user_id === userId && l.motivo === motivo)) return false;
    this.ledger.push({ user_id: userId, tipo: "grant", qtd, motivo });
    return true;
  }
  async grant(userId: string, qtd: number, motivo: string) {
    this.ledger.push({ user_id: userId, tipo: "grant", qtd, motivo });
  }
  async runsSince(userId: string, ms: number) {
    return this.runs.filter((r) => r.user_id === userId && this.clock - Date.parse(r.criado_em) <= ms).length;
  }
  async globalSpendBrlSince(ms: number) {
    return this.runs.filter((r) => this.clock - Date.parse(r.criado_em) <= ms)
      .reduce((a, r) => a + Number(r.custo_brl), 0);
  }
  async hasRunning(userId: string) {
    return this.runs.some((r) => r.user_id === userId && r.status === "running");
  }
  async findByKey(key: string) {
    return this.runs.find((r) => r.idempotency_key === key) ?? null;
  }
  async debitAtomic(userId: string, qtd: number, runId: string, motivo: string): Promise<DebitResult> {
    // Sem await interno: em JS isso é atômico (o Postgres garante via INSERT...SELECT).
    let bal = 0;
    for (const l of this.ledger) {
      if (l.user_id === userId) bal += l.tipo === "debit" ? -l.qtd : l.qtd;
    }
    if (bal < qtd) return { ok: false, motivo: "créditos insuficientes" };
    this.ledger.push({ user_id: userId, tipo: "debit", qtd, motivo });
    return { ok: true };
  }
  async insertRun(row: Omit<RunRow, "criado_em"> & { ip?: string | null }) {
    this.runs.push({ ...row, criado_em: new Date(this.clock).toISOString() });
  }
  async finishRun(runId: string, status: string, tokensIn: number, tokensOut: number, custoBrl: number, erro?: string | null) {
    const r = this.runs.find((x) => x.id === runId);
    if (r) { r.status = status; r.tokens_in = tokensIn; r.tokens_out = tokensOut; r.custo_brl = custoBrl; }
  }
}

/* ------------------------------------------------------------------ */
/* A trava: decisão antes de gastar qualquer token                     */
/* ------------------------------------------------------------------ */
export interface GuardResult {
  ok: boolean;
  status: number;
  reason?: string;
  runId?: string;
  replay?: RunRow;
  finalize?: (uso: { tokensIn: number; tokensOut: number }) => Promise<number>;
  fail?: (erro: string) => Promise<void>;
}

export async function guardRun(
  store: CreditStore,
  ctx: { userId: string; ticker: string; comite: Comite; idempotencyKey?: string | null; ip?: string | null },
): Promise<GuardResult> {
  // 5 · idempotência — reenvio devolve o resultado anterior, sem cobrar de novo
  if (ctx.idempotencyKey) {
    const prev = await store.findByKey(ctx.idempotencyKey);
    if (prev) return { ok: true, status: 200, replay: prev };
  }
  // 1 · circuit breaker global
  const gasto = await store.globalSpendBrlSince(24 * 3600 * 1000);
  if (gasto >= CFG.dailyCapBrl) {
    return { ok: false, status: 503, reason: `Limite diário de processamento atingido (R$ ${gasto.toFixed(2)}). Tente amanhã.` };
  }
  // 2 · rate limit por usuário
  if ((await store.runsSince(ctx.userId, 3600 * 1000)) >= CFG.rateHour) {
    return { ok: false, status: 429, reason: `Limite de ${CFG.rateHour} consultas/hora atingido.` };
  }
  if ((await store.runsSince(ctx.userId, 24 * 3600 * 1000)) >= CFG.rateDay) {
    return { ok: false, status: 429, reason: `Limite de ${CFG.rateDay} consultas/dia atingido.` };
  }
  // 4 · lock de concorrência
  if (await store.hasRunning(ctx.userId)) {
    return { ok: false, status: 409, reason: "Já existe uma consulta em andamento. Aguarde concluir." };
  }
  // 3 · débito atômico (antes de chamar o LLM)
  const runId = randomUUID();
  const debit = await store.debitAtomic(ctx.userId, 1, runId, "consulta");
  if (!debit.ok) {
    return { ok: false, status: 402, reason: debit.motivo ?? "créditos insuficientes" };
  }
  await store.insertRun({
    id: runId, user_id: ctx.userId, ticker: ctx.ticker, comite: ctx.comite,
    status: "running", tokens_in: 0, tokens_out: 0, custo_brl: 0,
    idempotency_key: ctx.idempotencyKey ?? null, ip: ctx.ip ?? null,
  });

  return {
    ok: true, status: 200, runId,
    finalize: async (uso) => {
      const custo = estimarCustoBrl(uso.tokensIn, uso.tokensOut);
      await store.finishRun(runId, "ok", uso.tokensIn, uso.tokensOut, custo);
      return custo;
    },
    fail: async (erro) => {
      // devolve o crédito (refund) e marca a run como erro
      await store.grant(ctx.userId, 1, "refund");
      await store.finishRun(runId, "erro", 0, 0, 0, erro);
    },
  };
}

export function grantSignupCredits(store: CreditStore, userId: string) {
  return store.grantOnce(userId, CFG.freeOnSignup, "signup");
}

export const GUARD_CONFIG = CFG;
