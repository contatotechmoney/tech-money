import type { Pool } from "pg";
import { createHash } from "node:crypto";
import { officialPilotIdentity, type OfficialIdentity } from "./portfolio-pilot-owner";
import type { PilotAccountState } from "./portfolio-pilot";

/** Trusted production operator only, deliberately NOT exposed as an HTTP route.
 * expectedOwner comes from the independent private owner confirmation.
 * auth() must be Clerk getAuth(req), not request body/headers chosen by a browser.
 * A production session is checked again using the official backend service.
 * This function is prepared, not invoked against production during this phase.
 */
export async function bindReviewedProductionOwner(options: {
  expectedOwner: string;
  auth: () => { userId: string | null; sessionId: string | null };
  officialUser: (id: string) => Promise<OfficialIdentity>;
  officialSession: (id: string) => Promise<{ id: string; userId: string; status: string }>;
  pool: Pool;
  environment?: () => "development" | "production";
}) {
  const environment = options.environment?.() ?? (process.env.NODE_ENV === "production" ? "production" : "development");
  if (environment !== "production") throw new Error("PRODUCTION_IDENTITY_REQUIRED");
  const actor = options.auth();
  if (!actor.userId || !actor.sessionId || actor.userId !== options.expectedOwner)
    throw new Error("OWNER_SESSION_REQUIRED");
  const session = await options.officialSession(actor.sessionId);
  if (session.id !== actor.sessionId || session.userId !== actor.userId || session.status !== "active")
    throw new Error("OWNER_SESSION_REQUIRED");
  const proof = await officialPilotIdentity(actor.userId, environment, options.officialUser);
  // No raw session identifier is persisted or returned.
  const sessionProof = createHash("sha256").update(`${proof.fingerprint}:${session.id}`).digest("hex");
  const client = await options.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query("SET LOCAL statement_timeout='5s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('techmoney_portfolio_owner_binding'))");
    const binding = (await client.query(`SELECT clerk_user_id, clerk_environment, revoked_at
      FROM portfolio_pilot_owner_bindings WHERE singleton=true FOR UPDATE`)).rows[0];
    if (binding && (binding.clerk_user_id !== actor.userId || binding.clerk_environment !== "production" || binding.revoked_at))
      throw new Error("OWNER_BINDING_CONFLICT");
    await client.query("INSERT INTO portfolio_pilot_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING", [actor.userId]);
    const result = await client.query("SELECT state FROM portfolio_pilot_accounts WHERE user_id=$1 FOR UPDATE", [actor.userId]);
    const state: PilotAccountState = result.rows[0].state;
    const addEvent = async (type: string, fingerprint: string) => {
      if (state.events.some(event => event.type === type && event.fingerprint === fingerprint)) return;
      const event = { type, budgetId: "identity-attestation", at: Date.now(), fingerprint };
      await client.query("INSERT INTO portfolio_pilot_audit(user_id,event_index,event) VALUES($1,$2,$3::jsonb)",
        [actor.userId, state.events.length, JSON.stringify(event)]);
      state.events.push(event);
    };
    await addEvent("identity_verified:production", proof.fingerprint);
    await addEvent("owner_binding_confirmed:production", sessionProof);
    await client.query(`INSERT INTO portfolio_pilot_owner_bindings
      (singleton,clerk_user_id,clerk_environment,evidence_digest,verification_method,verified_at)
      VALUES(true,$1,'production',$2,'official_clerk_owner_attestation',now())
      ON CONFLICT(singleton) DO UPDATE SET evidence_digest=EXCLUDED.evidence_digest,verified_at=EXCLUDED.verified_at`,
    [actor.userId, proof.fingerprint]);
    await client.query("UPDATE portfolio_pilot_accounts SET state=$2::jsonb,revision=revision+1,updated_at=now() WHERE user_id=$1",
      [actor.userId, JSON.stringify(state)]);
    await client.query("COMMIT");
    return { environment: "production" as const, ownerBound: true, executable: false, auditRecorded: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
