import type { Pool } from "pg";
import { createHash } from "node:crypto";
import { officialPilotIdentity, verifiedPilotOwner, type OfficialIdentity } from "./portfolio-pilot-owner";
import type { PilotAccountState } from "./portfolio-pilot";
import type { OwnerBindingState } from "../shared/portfolio-pilot-confirmation";

/** Trusted production operator or explicit owner action, only AFTER the route
 * matches the authenticated subject against the operator's private reference.
 * expectedOwner never comes from the browser's request body.
 * auth() must be Clerk getAuth(req), not request body/headers chosen by a browser.
 * A production session is checked again using the official backend service.
 * Merely importing/registering this procedure performs no write.
 */
export async function bindReviewedProductionOwner(options: {
  expectedOwner: string;
  auth: () => { userId: string | null; sessionId: string | null };
  officialUser: (id: string) => Promise<OfficialIdentity>;
  officialSession: (id: string) => Promise<{ id: string; userId: string; status: string }>;
  pool: Pool;
  environment?: () => "development" | "production";
}): Promise<OwnerBindingState> {
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
    const binding = (await client.query(`SELECT clerk_user_id, clerk_environment, revoked_at, evidence_digest
      FROM portfolio_pilot_owner_bindings WHERE singleton=true FOR UPDATE`)).rows[0];
    if (binding && (binding.clerk_user_id !== actor.userId || binding.clerk_environment !== "production" || binding.revoked_at))
      throw new Error("OWNER_BINDING_CONFLICT");
    await client.query("INSERT INTO portfolio_pilot_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING", [actor.userId]);
    const result = await client.query("SELECT state FROM portfolio_pilot_accounts WHERE user_id=$1 FOR UPDATE", [actor.userId]);
    const state: PilotAccountState = result.rows[0].state;
    let changed = !binding || binding.evidence_digest !== proof.fingerprint;
    const addEvent = async (type: string, fingerprint: string) => {
      if (state.events.some(event => event.type === type && event.fingerprint === fingerprint)) return;
      const event = { type, budgetId: "identity-attestation", at: Date.now(), fingerprint };
      await client.query("INSERT INTO portfolio_pilot_audit(user_id,event_index,event) VALUES($1,$2,$3::jsonb)",
        [actor.userId, state.events.length, JSON.stringify(event)]);
      state.events.push(event);
      changed = true;
    };
    await addEvent("identity_verified:production", proof.fingerprint);
    await addEvent("owner_binding_confirmed:production", sessionProof);
    const audit = await client.query(`SELECT count(*)::int AS proofs FROM portfolio_pilot_audit
      WHERE user_id=$1 AND ((event->>'type'='identity_verified:production' AND event->>'fingerprint'=$2)
        OR (event->>'type'='owner_binding_confirmed:production' AND event->>'fingerprint'=$3))`,
    [actor.userId, proof.fingerprint, sessionProof]);
    if (audit.rows[0]?.proofs !== 2) throw new Error("DURABLE_AUDIT_NOT_READY");
    if (changed) {
      await client.query(`INSERT INTO portfolio_pilot_owner_bindings
      (singleton,clerk_user_id,clerk_environment,evidence_digest,verification_method,verified_at)
      VALUES(true,$1,'production',$2,'official_clerk_owner_attestation',now())
      ON CONFLICT(singleton) DO UPDATE SET evidence_digest=EXCLUDED.evidence_digest,verified_at=EXCLUDED.verified_at`,
    [actor.userId, proof.fingerprint]);
      await client.query("UPDATE portfolio_pilot_accounts SET state=$2::jsonb,revision=revision+1,updated_at=now() WHERE user_id=$1",
        [actor.userId, JSON.stringify(state)]);
    }
    await client.query("COMMIT");
    return { environment: "production" as const, ownerBound: true, revoked: false, executable: false, auditRecorded: true };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

/** Read only, and called only after the production/session/reference checks. */
export async function readProductionOwnerBinding(
  pool: Pool, actor: string, officialUser: (id: string) => Promise<OfficialIdentity>,
): Promise<OwnerBindingState> {
  const row = (await pool.query(`SELECT revoked_at FROM portfolio_pilot_owner_bindings
    WHERE singleton=true AND clerk_user_id=$1 AND clerk_environment='production'`, [actor])).rows[0];
  const owner = row && !row.revoked_at ? await verifiedPilotOwner(pool, actor, "production", officialUser) : null;
  return { environment: "production", ownerBound: owner === actor, revoked: Boolean(row?.revoked_at),
    auditRecorded: owner === actor, executable: false };
}
