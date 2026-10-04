import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { validAnalysisPrice, walletSnapshot, type AnalysisPrice } from "./analysis-wallet";
import type { HermesRun } from "./hermes-client";

export type AnalysisJob = {
  id: string; user_id: string; idempotency_key: string; ticker: string; model_id: string;
  status: "submitting" | HermesRun["status"]; run_id: string | null;
  output: string | null; runtime: HermesRun["runtime"]; created_at: string; updated_at: string;
};
export interface AnalysisStore {
  ready(): Promise<boolean>;
  wallet(userId: string): ReturnType<typeof walletSnapshot>;
  list(userId: string): Promise<AnalysisJob[]>;
  get(userId: string, id: string): Promise<AnalysisJob | null>;
  reserve(userId: string, key: string, ticker: string, model: string, limit: number, globalLimit: number, globalConcurrent: number, price: AnalysisPrice): Promise<AnalysisJob>;
  attach(userId: string, id: string, runId: string): Promise<void>;
  update(userId: string, id: string, result: HermesRun): Promise<void>;
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export async function closeHermesJobs() { await pool.end(); }
export const analysisStore: AnalysisStore = {
  async wallet(userId) { return walletSnapshot(pool, userId); },
  async ready() {
    const result = await pool.query("SELECT to_regclass('public.hermes_analysis_jobs') AS name, to_regclass('public.analysis_credit_entries') AS wallet");
    return Boolean(result.rows[0]?.name && result.rows[0]?.wallet);
  },
  async list(userId) {
    return (await pool.query("SELECT * FROM hermes_analysis_jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20", [userId])).rows;
  },
  async get(userId, id) {
    return (await pool.query("SELECT * FROM hermes_analysis_jobs WHERE user_id=$1 AND id=$2", [userId, id])).rows[0] || null;
  },
  async reserve(userId, key, ticker, model, limit, globalLimit, globalConcurrent, price) {
    if (!validAnalysisPrice(price)) throw Error("INVALID_ANALYSIS_PRICE");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["tech-money-hermes-global-budget"]);
      const existing = (await client.query("SELECT * FROM hermes_analysis_jobs WHERE user_id=$1 AND idempotency_key=$2", [userId, key])).rows[0];
      if (existing) {
        if (existing.ticker !== ticker || existing.model_id !== model || existing.execution_fingerprint !== price.executionFingerprint) throw new Error("IDEMPOTENCY_CONFLICT");
        await client.query("COMMIT"); return existing;
      }
      const active = await client.query("SELECT id FROM hermes_analysis_jobs WHERE user_id=$1 AND status IN ('submitting','running')", [userId]);
      if (active.rowCount) throw new Error("ANALYSIS_ACTIVE");
      const count = await client.query("SELECT count(*)::int AS total FROM hermes_analysis_jobs WHERE user_id=$1 AND created_at > now() - interval '24 hours'", [userId]);
      if (count.rows[0].total >= limit) throw new Error("DAILY_LIMIT");
      const global = await client.query("SELECT count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS total, count(*) FILTER (WHERE status IN ('submitting','running'))::int AS active FROM hermes_analysis_jobs");
      if (global.rows[0].total >= globalLimit) throw new Error("GLOBAL_LIMIT");
      if (global.rows[0].active >= globalConcurrent) throw new Error("GLOBAL_BUSY");
      const spent = await client.query("SELECT COALESCE(sum(cost_ceiling_micro_usd),0)::bigint AS held FROM hermes_analysis_jobs WHERE created_at > now() - interval '24 hours' OR updated_at > now() - interval '24 hours' OR status IN ('submitting','running')");
      if (BigInt(spent.rows[0].held) + BigInt(price.maxCostMicroUsd) > BigInt(price.dailyBudgetMicroUsd)) throw Error("FINANCIAL_BUDGET");
      const balance = await client.query("SELECT COALESCE(sum(delta),0)::bigint AS available FROM analysis_credit_entries WHERE user_id=$1", [userId]);
      if (BigInt(balance.rows[0].available) < BigInt(price.credits)) throw Error("INSUFFICIENT_CREDITS");
      const job = (await client.query("INSERT INTO hermes_analysis_jobs (id,user_id,idempotency_key,ticker,model_id,status,credit_price,cost_ceiling_micro_usd,execution_fingerprint) VALUES ($1,$2,$3,$4,$5,'submitting',$6,$7,$8) RETURNING *", [randomUUID(),userId,key,ticker,model,price.credits,price.maxCostMicroUsd,price.executionFingerprint])).rows[0];
      await client.query("INSERT INTO analysis_credit_entries(id,user_id,event_key,kind,delta,job_id,reason) VALUES ($1,$2,$3,'reserve',$4,$5,'Reserva para estudo informativo')", [randomUUID(),userId,`reserve:${job.id}`,-price.credits,job.id]);
      await client.query("COMMIT"); return job;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  },
  async attach(userId, id, runId) {
    await pool.query("UPDATE hermes_analysis_jobs SET run_id=$3,status='running',updated_at=now() WHERE user_id=$1 AND id=$2 AND status='submitting'", [userId,id,runId]);
  },
  async update(userId, id, result) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["tech-money-hermes-global-budget"]);
      const job = (await client.query("SELECT * FROM hermes_analysis_jobs WHERE user_id=$1 AND id=$2 FOR UPDATE", [userId,id])).rows[0];
      if (job?.status === "running") {
        await client.query("UPDATE hermes_analysis_jobs SET status=$3,output=$4,runtime=$5::jsonb,updated_at=now() WHERE user_id=$1 AND id=$2", [userId,id,result.status,result.output,JSON.stringify(result.runtime)]);
        if (job.credit_price > 0 && result.status !== "running") {
          const kind = result.status === "failed" ? "refund" : "consume";
          await client.query("INSERT INTO analysis_credit_entries(id,user_id,event_key,kind,delta,job_id,reason) VALUES ($1,$2,$3,$4,$5,$6,$7)", [randomUUID(),userId,`settle:${id}`,kind,kind === "refund" ? job.credit_price : 0,id,kind === "refund" ? "Execução confirmada sem entrega: créditos devolvidos" : "Estudo informativo concluído; revisão profissional é uma etapa distinta"]);
        }
      }
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  },
};

export function publicJob(job: AnalysisJob) {
  return { id: job.id, requestKey: job.idempotency_key, ticker: job.ticker, modelId: job.model_id, status: job.status,
    output: job.output, runtime: job.runtime, createdAt: job.created_at, updatedAt: job.updated_at,
    professionalReview: "pending", purpose: "informational" };
}
