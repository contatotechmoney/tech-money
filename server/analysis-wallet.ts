import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export type AnalysisPrice = { credits: number; maxCostMicroUsd: number; dailyBudgetMicroUsd: number; executionFingerprint: string };
export function validAnalysisPrice(value: AnalysisPrice): boolean {
  return Number.isSafeInteger(value.credits) && value.credits > 0 && value.credits <= 1000000
    && Number.isSafeInteger(value.maxCostMicroUsd) && value.maxCostMicroUsd > 0
    && Number.isSafeInteger(value.dailyBudgetMicroUsd) && value.dailyBudgetMicroUsd >= value.maxCostMicroUsd
    && /^[a-f0-9]{64}$/.test(value.executionFingerprint);
}
export async function walletSnapshot(db: Pool | PoolClient, userId: string) {
  // A single statement uses one database snapshot for balance, reservations and history.
  const result = await db.query(`SELECT
    (SELECT COALESCE(sum(delta),0)::bigint FROM analysis_credit_entries WHERE user_id=$1) AS available,
    (SELECT COALESCE(sum(credit_price),0)::bigint FROM hermes_analysis_jobs WHERE user_id=$1 AND status IN ('submitting','running')) AS reserved,
    (SELECT COALESCE(jsonb_agg(entry), '[]'::jsonb) FROM
      (SELECT kind,delta,reason,job_id AS "jobId",created_at AS "createdAt" FROM analysis_credit_entries WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50) entry) AS entries`, [userId]);
  const row = result.rows[0];
  const available = Number(row.available), reserved = Number(row.reserved);
  if (!Number.isSafeInteger(available) || !Number.isSafeInteger(reserved)) throw Error("INVALID_WALLET_BALANCE");
  return { available, reserved, entries: row.entries as { kind: string; delta: number; reason: string; jobId: string | null; createdAt: string }[] };
}

// Operator-only primitive: never expose this function as a client grant endpoint.
// Payment/plan adapters must verify the source event before calling it.
export async function grantAnalysisCredits(db: Pool, userId: string, credits: number, eventKey: string, reason: string) {
  if (!userId || !Number.isSafeInteger(credits) || credits <= 0 || credits > 1000000
    || !eventKey || eventKey.length > 240 || !reason.trim() || reason.length > 1000) throw Error("INVALID_CREDIT_GRANT");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["tech-money-hermes-global-budget"]);
    const old = (await client.query("SELECT delta,reason,kind FROM analysis_credit_entries WHERE user_id=$1 AND event_key=$2", [userId,eventKey])).rows[0];
    if (old && (old.kind !== "grant" || old.delta !== credits || old.reason !== reason)) throw Error("CREDIT_EVENT_CONFLICT");
    if (!old) await client.query("INSERT INTO analysis_credit_entries(id,user_id,event_key,kind,delta,reason) VALUES ($1,$2,$3,'grant',$4,$5)", [randomUUID(),userId,eventKey,credits,reason]);
    await client.query("COMMIT");
    return !old;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
