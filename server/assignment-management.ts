import { z } from "zod";
import { pool } from "./storage";
import { ReviewError } from "./professional-review";

export const assignmentClientId = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/);
export const assignmentChangeInput = z.object({
  clientId: assignmentClientId,
  reason: z.string().trim().min(10).max(4000),
  // Optimistic concurrency: null means a pair that has never existed.
  expectedGrantId: z.string().uuid().nullable(),
}).strict();

const assignmentColumns = `reviewer_id AS "reviewerId", client_id AS "clientId", grant_id AS "grantId",
 granted_by AS "grantedBy", reason, granted_at AS "grantedAt", revoked_at AS "revokedAt"`;
const professionalColumns = `reviewer_id AS "reviewerId", credential_reference AS "credentialReference",
 verified_at AS "verifiedAt", valid_until AS "validUntil", revoked_at AS "revokedAt",
 (revoked_at IS NULL AND verified_at <= clock_timestamp() AND valid_until > clock_timestamp()) AS eligible`;

export const assignmentManagement = {
  async canManage(actorId: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM investment_assignment_administrators WHERE user_id = $1 AND revoked_at IS NULL`, [actorId]);
    return rowCount === 1;
  },
  async overview(actorId: string) {
    if (!await this.canManage(actorId)) throw new ReviewError(403, "ASSIGNMENT_ADMIN_REQUIRED");
    const [professional, assignments] = await Promise.all([
      pool.query(`SELECT ${professionalColumns} FROM investment_review_professional`),
      pool.query(`SELECT ${assignmentColumns} FROM investment_consultant_authorizations ORDER BY client_id, reviewer_id`),
    ]);
    return { professional: professional.rows[0] ?? null, assignments: assignments.rows };
  },
  async history(actorId: string, clientId: string) {
    if (!await this.canManage(actorId)) throw new ReviewError(403, "ASSIGNMENT_ADMIN_REQUIRED");
    const { rows } = await pool.query(
      `SELECT id, actor_id AS "actorId", reviewer_id AS "reviewerId", client_id AS "clientId",
       action, reason, grant_id AS "grantId", occurred_at AS "occurredAt",
       granted_at AS "grantedAt", revoked_at AS "revokedAt", credential_reference AS "credentialReference",
       credential_valid_until AS "credentialValidUntil"
       FROM investment_assignment_audit WHERE client_id = $1 ORDER BY occurred_at DESC, id DESC LIMIT 200`, [clientId]);
    return { events: rows };
  },
  async change(actorId: string, action: "grant" | "revoke", input: z.infer<typeof assignmentChangeInput>) {
    // A second authorization check inside the transaction prevents stale UI privileges.
    const tx = await pool.connect();
    try {
      await tx.query("BEGIN");
      const admin = await tx.query(`SELECT user_id FROM investment_assignment_administrators
        WHERE user_id = $1 AND revoked_at IS NULL FOR SHARE`, [actorId]);
      if (admin.rowCount !== 1) throw new ReviewError(403, "ASSIGNMENT_ADMIN_REQUIRED");
      // Serialize even first grants (there is no row to lock yet).
      await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`investment-assignment:${input.clientId}`]);
      const current = (await tx.query(`SELECT ${assignmentColumns} FROM investment_consultant_authorizations
        WHERE client_id = $1 AND grant_id = $2 FOR UPDATE`, [input.clientId, input.expectedGrantId])).rows[0];
      const professional = (await tx.query(`SELECT ${professionalColumns} FROM investment_review_professional FOR SHARE`)).rows[0];
      let assignment;
      if (action === "grant") {
        if (!professional?.eligible) throw new ReviewError(409, "PROFESSIONAL_NOT_ELIGIBLE");
        if (professional.reviewerId === input.clientId) throw new ReviewError(403, "SELF_ASSIGNMENT_FORBIDDEN");
        const existing = (await tx.query(`SELECT ${assignmentColumns} FROM investment_consultant_authorizations
          WHERE reviewer_id = $1 AND client_id = $2 FOR UPDATE`, [professional.reviewerId, input.clientId])).rows[0];
        if ((existing?.grantId ?? null) !== input.expectedGrantId)
          throw new ReviewError(409, "ASSIGNMENT_VERSION_CHANGED");
        if (existing && !existing.revokedAt) throw new ReviewError(409, "ASSIGNMENT_ALREADY_ACTIVE");
        assignment = (await tx.query(`INSERT INTO investment_consultant_authorizations (reviewer_id, client_id, granted_by, reason)
          VALUES ($1,$2,$3,$4) ON CONFLICT (reviewer_id,client_id) DO UPDATE
          SET granted_by = EXCLUDED.granted_by, reason = EXCLUDED.reason, revoked_at = NULL
          RETURNING ${assignmentColumns}`, [professional.reviewerId, input.clientId, actorId, input.reason])).rows[0];
      } else {
        // Revocation remains possible after qualification expires or registry removal.
        if (!current) throw new ReviewError(409, "ASSIGNMENT_VERSION_CHANGED");
        if (current.revokedAt) throw new ReviewError(409, "ASSIGNMENT_ALREADY_REVOKED");
        assignment = (await tx.query(`UPDATE investment_consultant_authorizations SET revoked_at = clock_timestamp()
          WHERE reviewer_id = $1 AND client_id = $2 RETURNING ${assignmentColumns}`,
        [current.reviewerId, input.clientId])).rows[0];
      }
      await tx.query(`INSERT INTO investment_assignment_audit
        (actor_id, reviewer_id, client_id, action, reason, grant_id, granted_at, revoked_at, credential_reference, credential_valid_until)
        SELECT $1, a.reviewer_id, a.client_id, $2, $3, a.grant_id, a.granted_at, a.revoked_at,
          p.credential_reference, p.valid_until
        FROM investment_consultant_authorizations a
        LEFT JOIN investment_review_professional p ON p.reviewer_id = a.reviewer_id
        WHERE a.reviewer_id = $4 AND a.client_id = $5 AND a.grant_id = $6`,
      [actorId, action, input.reason, assignment.reviewerId, input.clientId, assignment.grantId]);
      await tx.query("COMMIT");
      return { assignment };
    } catch (error) {
      await tx.query("ROLLBACK");
      throw error;
    } finally { tx.release(); }
  },
};
