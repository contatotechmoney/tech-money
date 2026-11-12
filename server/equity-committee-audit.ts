import type { EquityCallEvent } from "./equity-committee-meter";

type Query = (sql: string, values: (string | number | boolean | null)[]) => Promise<unknown>;

/** Bind to a trusted server connection only. No prompt, response, credential or private dossier is stored. */
export function equityAuditAppender(query: Query) {
  return async (event: EquityCallEvent) => {
    const measured = event.status === "metered" || event.status === "limit_violation" ? event : null;
    await query(`INSERT INTO equity_committee_call_audit
      (user_id,run_id,quote_digest,ticker,agent_id,model_id,price_version,simulated,status,
       input_limit,output_limit,max_usd_micros,input_tokens,output_tokens,cost_usd_micros)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, [
      event.owner, event.runId, event.quoteDigest, event.ticker, event.agentId, event.modelId,
      event.priceVersion, event.simulated, event.status, event.inputLimit, event.outputLimit,
      event.maxUsdMicros, measured?.inputTokens ?? null, measured?.outputTokens ?? null, measured?.costUsdMicros ?? null,
    ]);
  };
}
