import type { Pool } from "pg";
import { createHash } from "node:crypto";
export interface OfficialIdentity {
  id: string; primaryEmailAddressId: string | null;
  emailAddresses: { id: string; verification?: { status: string } | null }[];
}
/** Requires a Clerk-authenticated subject, never an ID supplied in the request.
 * Stateless verification remains possible before the pilot migration exists.
 * The digest is for internal audit, not a bearer token or permission grant.
 */
export async function officialPilotIdentity(
  actor: string, environment: "development" | "production",
  officialUser: (id: string) => Promise<OfficialIdentity>,
) {
  const user = await officialUser(actor);
  if (user.id !== actor || !user.primaryEmailAddressId ||
      !user.emailAddresses.some(email => email.id === user.primaryEmailAddressId && email.verification?.status === "verified"))
    throw new Error("VERIFIED_IDENTITY_REQUIRED");
  return { environment, fingerprint: createHash("sha256").update(JSON.stringify({
    issuer: "official_clerk_api", subject: actor, environment, primaryEmailId: user.primaryEmailAddressId, emailVerified: true,
  })).digest("hex") };
}
/** Independent owner attestation must have been reviewed through the official Clerk
 * console. There is deliberately no HTTP endpoint to create or modify this binding. */
export async function verifiedPilotOwner(
  pool: Pool, actor: string, environment: "development" | "production",
  officialUser: (id: string) => Promise<OfficialIdentity>,
): Promise<string | null> {
  const result = await pool.query(
    `SELECT clerk_user_id FROM portfolio_pilot_owner_bindings
     WHERE singleton=true AND clerk_user_id=$1 AND clerk_environment=$2
       AND revoked_at IS NULL AND verified_at <= now()
       AND verification_method='official_clerk_owner_attestation'
       AND evidence_digest ~ '^[a-f0-9]{64}$'
       AND EXISTS (
         SELECT 1 FROM portfolio_pilot_audit a
         WHERE a.user_id=clerk_user_id
           AND a.event->>'type' = 'identity_verified:' || $2
           AND a.event->>'fingerprint'=evidence_digest
       )`, [actor, environment]);
  if (result.rowCount !== 1) return null; // No discovery/listing of customers or guesses.
  const user = await officialUser(actor);
  const verified = user.emailAddresses.some(e => e.id === user.primaryEmailAddressId && e.verification?.status === "verified");
  return user.id === actor && verified ? actor : null;
}
