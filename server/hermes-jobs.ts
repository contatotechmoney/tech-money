import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { HermesRun } from "./hermes-client";

export type AnalysisJob = {
  id: string; user_id: string; idempotency_key: string; ticker: string; model_id: string;
  status: "submitting" | HermesRun["status"]; run_id: string | null;
  output: string | null; runtime: HermesRun["runtime"]; created_at: string; updated_at: string;
};
export interface AnalysisStore {
  ready(): Promise<boolean>;
  list(userId: string): Promise<AnalysisJob[]>;
  get(userId: string, id: string): Promise<AnalysisJob | null>;
  reserve(userId: string, key: string, ticker: string, model: string, limit: number, globalLimit: number, globalConcurrent: number): Promise<AnalysisJob>;
  attach(userId: string, id: string, runId: string): Promise<void>;
  update(userId: string, id: string, result: HermesRun): Promise<void>;
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export async function closeHermesJobs() { await pool.end(); }
export const analysisStore: AnalysisStore = {
  async ready() {
    const result = await pool.query("SELECT to_regclass('public.hermes_analysis_jobs') AS name");
    return Boolean(result.rows[0]?.name);
  },
  async list(userId) {
    return (await pool.query("SELECT * FROM hermes_analysis_jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20", [userId])).rows;
  },
  async get(userId, id) {
    return (await pool.query("SELECT * FROM hermes_analysis_jobs WHERE user_id=$1 AND id=$2", [userId, id])).rows[0] || null;
  },
  async reserve(userId, key, ticker, model, limit, globalLimit, globalConcurrent) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["tech-money-hermes-global-budget"]);
      const existing = (await client.query("SELECT * FROM hermes_analysis_jobs WHERE user_id=$1 AND idempotency_key=$2", [userId, key])).rows[0];
      if (existing) {
        if (existing.ticker !== ticker || existing.model_id !== model) throw new Error("IDEMPOTENCY_CONFLICT");
        await client.query("COMMIT"); return existing;
      }
      const active = await client.query("SELECT id FROM hermes_analysis_jobs WHERE user_id=$1 AND status IN ('submitting','running')", [userId]);
      if (active.rowCount) throw new Error("ANALYSIS_ACTIVE");
      const count = await client.query("SELECT count(*)::int AS total FROM hermes_analysis_jobs WHERE user_id=$1 AND created_at > now() - interval '24 hours'", [userId]);
      if (count.rows[0].total >= limit) throw new Error("DAILY_LIMIT");
      const global = await client.query("SELECT count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS total, count(*) FILTER (WHERE status IN ('submitting','running'))::int AS active FROM hermes_analysis_jobs");
      if (global.rows[0].total >= globalLimit) throw new Error("GLOBAL_LIMIT");
      if (global.rows[0].active >= globalConcurrent) throw new Error("GLOBAL_BUSY");
      const job = (await client.query("INSERT INTO hermes_analysis_jobs (id,user_id,idempotency_key,ticker,model_id,status) VALUES ($1,$2,$3,$4,$5,'submitting') RETURNING *", [randomUUID(),userId,key,ticker,model])).rows[0];
      await client.query("COMMIT"); return job;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  },
  async attach(userId, id, runId) {
    await pool.query("UPDATE hermes_analysis_jobs SET run_id=$3,status='running',updated_at=now() WHERE user_id=$1 AND id=$2 AND status='submitting'", [userId,id,runId]);
  },
  async update(userId, id, result) {
    await pool.query("UPDATE hermes_analysis_jobs SET status=$3,output=$4,runtime=$5::jsonb,updated_at=now() WHERE user_id=$1 AND id=$2 AND status='running'", [userId,id,result.status,result.output,JSON.stringify(result.runtime)]);
  },
};

export function publicJob(job: AnalysisJob) {
  return { id: job.id, requestKey: job.idempotency_key, ticker: job.ticker, modelId: job.model_id, status: job.status,
    output: job.output, runtime: job.runtime, createdAt: job.created_at, updatedAt: job.updated_at,
    professionalReview: "pending", purpose: "informational" };
}
