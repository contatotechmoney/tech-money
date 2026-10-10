import type { Pool } from "pg";
import type { PilotAccountState, PilotLedger } from "./portfolio-pilot";

/** Cross-process atomic locking; no connection, calls or writes during import/startup. */
export class PostgresPilotLedger implements PilotLedger {
  constructor(private readonly pool: Pool) {}
  async transaction<T>(owner: string, work: (state: PilotAccountState) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '3s'");
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query("INSERT INTO portfolio_pilot_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING", [owner]);
      const row = await client.query("SELECT state FROM portfolio_pilot_accounts WHERE user_id=$1 FOR UPDATE", [owner]);
      const state: PilotAccountState = row.rows[0].state;
      const existingEvents = state.events.length;
      const originalEvents = JSON.stringify(state.events);
      const result = await work(state);
      if (JSON.stringify(state.events.slice(0, existingEvents)) !== originalEvents)
        throw new Error("AUDIT_IMMUTABLE");
      // Audit and state commit together. Original event rows are never updated or deleted.
      for (let i = existingEvents; i < state.events.length; i++)
        await client.query("INSERT INTO portfolio_pilot_audit(user_id,event_index,event) VALUES($1,$2,$3::jsonb)",
          [owner, i, JSON.stringify(state.events[i])]);
      await client.query("UPDATE portfolio_pilot_accounts SET state=$2::jsonb,revision=revision+1,updated_at=now() WHERE user_id=$1",
        [owner, JSON.stringify(state)]);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }
}
