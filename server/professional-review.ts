import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { pool, storage, type InvestmentReport } from "./storage";
import { perfilVigente, respostasSaoValidas, classificarPerfil, perfilExigidoPara, type SuitabilityProfile } from "./suitability";
import { informationalReport, referenceDate, reportPresentation, type ProfileCheck } from "./report-policy";
import type { ProfessionalReview, ReportPresentation } from "../shared/report-quality";
import type { PendingReviewItem, PendingReviewReason, PendingReviews } from "../shared/review-pending";

/** Canonical content hashes bind decisions to content, not just an editable ID or timestamp. */
export function versionOf(value: unknown): string {
  const canonical = (v: any): any => v instanceof Date ? v.toISOString()
    : Array.isArray(v) ? v.map(canonical)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

const REVIEW_COLUMNS = `id, reviewer_id AS "reviewerId", client_id AS "clientId",
 report_id AS "reportId", report_version AS "reportVersion", profile_version AS "profileVersion",
 decision, reason, recommendation_text AS "recommendationText",
 to_char(reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "reviewedAt"`;

/** Login is not qualification. Only the explicitly verified owner and scoped grants may review. */
export const reviewRepository = {
  async assignments(reviewerId: string): Promise<Array<{ clientId: string }>> {
    const { rows } = await pool.query(
      `SELECT a.client_id AS "clientId" FROM investment_consultant_authorizations a
       JOIN investment_review_professional p ON p.reviewer_id = a.reviewer_id
       WHERE a.reviewer_id = $1 AND a.revoked_at IS NULL AND a.reviewer_id <> a.client_id
       AND p.revoked_at IS NULL AND p.verified_at <= clock_timestamp() AND p.valid_until > clock_timestamp()`, [reviewerId]);
    return rows;
  },
  async authorized(reviewerId: string, clientId: string, reviewedAt?: string): Promise<boolean> {
    if (reviewerId === clientId) return false;
    const { rows } = await pool.query(
      `SELECT 1 FROM investment_consultant_authorizations a
       JOIN investment_review_professional p ON p.reviewer_id = a.reviewer_id
       WHERE a.reviewer_id = $1 AND a.client_id = $2 AND a.revoked_at IS NULL
       AND p.revoked_at IS NULL AND p.verified_at <= clock_timestamp() AND p.valid_until > clock_timestamp()
        AND ($3::timestamptz IS NULL OR a.granted_at <= $3::timestamptz)
        AND (SELECT count(*) FROM pg_trigger t JOIN pg_proc f ON f.oid=t.tgfoid
          WHERE NOT t.tgisinternal AND t.tgenabled IN ('O','A')
          AND t.tgqual IS NULL AND t.tgnargs=0 AND NOT f.prosecdef
          AND f.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
          AND md5(f.prosrc)=CASE WHEN t.tgname='investment_authorization_renewal'
            THEN '71df38ab7630d24fd1fb8a5e73b48534' ELSE '0dddf10721235c2ccc76ea98db4ebcf7' END
          AND (
            (t.tgrelid='public.investment_professional_reviews'::regclass AND t.tgname='investment_review_immutable'
              AND t.tgtype=27
              AND t.tgfoid=to_regprocedure('public.prevent_investment_review_changes()'))
            OR (t.tgrelid='public.investment_assignment_audit'::regclass AND t.tgname='investment_assignment_audit_immutable'
              AND t.tgtype=27
              AND t.tgfoid=to_regprocedure('public.prevent_investment_review_changes()'))
            OR (t.tgrelid='public.investment_consultant_authorizations'::regclass AND t.tgname='investment_authorization_renewal'
              AND t.tgtype=19
              AND t.tgfoid=to_regprocedure('public.renew_investment_consultant_authorization()'))
          )) = 3`, [reviewerId, clientId, reviewedAt ?? null]);
    return rows.length === 1;
  },
  async grantVersion(reviewerId: string, clientId: string): Promise<string | null> {
    const { rows } = await pool.query(`SELECT a.grant_id AS "grantId" FROM investment_consultant_authorizations a
      JOIN investment_review_professional p ON p.reviewer_id = a.reviewer_id
      WHERE a.reviewer_id = $1 AND a.client_id = $2 AND a.revoked_at IS NULL AND a.reviewer_id <> a.client_id
      AND p.revoked_at IS NULL AND p.verified_at <= clock_timestamp() AND p.valid_until > clock_timestamp()`,
    [reviewerId, clientId]);
    return rows[0]?.grantId ?? null;
  },
  async profile(clientId: string): Promise<SuitabilityProfile | null> {
    return perfilVigente(clientId);
  },
  async history(clientId: string, reportId: string): Promise<ProfessionalReview[]> {
    const { rows } = await pool.query(
      `SELECT ${REVIEW_COLUMNS} FROM investment_professional_reviews
       WHERE client_id = $1 AND report_id = $2 ORDER BY reviewed_at DESC, id DESC`, [clientId, reportId]);
    // Preserve PostgreSQL microseconds for comparison with renewed grant timestamps.
    return rows;
  },
  async append(review: ProfessionalReview, expectedGrantId: string): Promise<void> {
    // Serialize with operational grant/revoke, and bind to the grant read BEFORE reviewing.
    const tx = await pool.connect();
    try {
      await tx.query("BEGIN");
      await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`investment-assignment:${review.clientId}`]);
      const { rowCount, rows } = await tx.query(
      `WITH scoped AS (
         SELECT a.* FROM investment_consultant_authorizations a
         JOIN investment_review_professional p ON p.reviewer_id = a.reviewer_id
         WHERE a.reviewer_id = $2 AND a.client_id = $3 AND a.revoked_at IS NULL
         AND a.grant_id = $10
         AND p.revoked_at IS NULL AND p.verified_at <= clock_timestamp() AND p.valid_until > clock_timestamp()
         FOR SHARE OF a, p
       )
       INSERT INTO investment_professional_reviews
        (id, reviewer_id, client_id, report_id, report_version, profile_version, decision, reason, recommendation_text, reviewed_at)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp()
       FROM scoped a
       JOIN investment_reports r ON r.id = $4 AND r.user_id = $3
       WHERE $2 <> $3
       RETURNING to_char(reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "reviewedAt"`,
      [review.id, review.reviewerId, review.clientId, review.reportId, review.reportVersion,
        review.profileVersion, review.decision, review.reason, review.recommendationText, expectedGrantId]);
      if (rowCount !== 1) throw new ReviewError(403, "CONSULTANT_NOT_AUTHORIZED");
      await tx.query("COMMIT");
      review.reviewedAt = rows[0].reviewedAt;
    } catch (error) {
      await tx.query("ROLLBACK");
      throw error;
    } finally { tx.release(); }
  },
};

export class ReviewError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const reviewInput = z.object({
  reportVersion: z.string().regex(/^[a-f0-9]{64}$/),
  profileVersion: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(10).max(4000),
  recommendationText: z.string().trim().min(10).max(8000).optional(),
}).strict().superRefine((input, ctx) => {
  if (input.decision === "approved" && !input.recommendationText)
    ctx.addIssue({ code: "custom", path: ["recommendationText"], message: "Registre a recomendação profissional efetivamente revisada." });
});

export function checkReviewedProfile(profile: SuitabilityProfile | null, report: InvestmentReport, now = Date.now()): ProfileCheck {
  if (!profile || profile.userId !== report.userId || !profile.respostas || !respostasSaoValidas(profile.respostas)
    || classificarPerfil(profile.respostas) !== profile.perfil
    || !Number.isFinite(profile.pontuacaoMedia)
    || Math.abs(profile.pontuacaoMedia - Object.values(profile.respostas!).reduce((a, b) => a + b + 1, 0) / Object.keys(profile.respostas!).length) > 0.011
    || !Number.isFinite(referenceDate(profile.dataAvaliacao)) || referenceDate(profile.dataAvaliacao) > now
    || !Number.isFinite(referenceDate(profile.dataProximaReavaliacao)) || referenceDate(profile.dataProximaReavaliacao) <= now
    || referenceDate(profile.dataProximaReavaliacao) <= referenceDate(profile.dataAvaliacao))
    return { ok: false, motivo: "Perfil ausente, insuficiente, inválido ou vencido; atualize o questionário." };
  const levels = { CONSERVADOR: 1, MODERADO: 2, AGRESSIVO: 3 };
  if (report.riskScore === null || !Number.isFinite(report.riskScore)) return { ok: false, motivo: "Risco indisponível." };
  if (levels[profile.perfil] < levels[perfilExigidoPara(report.riskScore)])
    return { ok: false, incompativel: true, motivo: "Perfil incompatível; termo de ciência não substitui adequação." };
  return { ok: true };
}

export async function reviewContext(report: InvestmentReport, options: {
  refreshFailure?: string; historical?: boolean; profileCheck?: ProfileCheck;
} = {}) {
  const profile = await reviewRepository.profile(report.userId);
  const reportVersion = versionOf(report);
  const profileVersion = profile ? versionOf(profile) : null;
  const reviews = await reviewRepository.history(report.userId, report.id);
  const latest = (await storage.listReports(report.userId, report.ticker))[0];
  const candidate = reviews[0];
  const matched = candidate && candidate.clientId === report.userId && candidate.reportId === report.id
    && candidate.reportVersion === reportVersion && candidate.profileVersion === versionOf(profile)
    && Number.isFinite(Date.parse(candidate.reviewedAt)) && Date.parse(candidate.reviewedAt) <= Date.now()
    && await reviewRepository.authorized(candidate.reviewerId, report.userId, candidate.reviewedAt);
  const profileCheck = checkReviewedProfile(profile, report);
  const presentation = reportPresentation(report, {
    ...options,
    // A supplied conformity check may veto, never replace the actual profile.
    profile: options.profileCheck?.ok === false ? options.profileCheck : profileCheck,
    historical: options.historical || latest?.id !== report.id,
    review: matched ? candidate : undefined,
  });
  return { reportVersion, profileVersion, profile, profileCheck, reviews, presentation, matchedReview: matched ? candidate : undefined };
}

/** Derive work from current source data, never from delivery events or an auto-approval. */
export function pendingReviewReason(context: Awaited<ReturnType<typeof reviewContext>>): PendingReviewReason | null {
  const candidate = context.reviews[0];
  if (!candidate) return "new_report";
  if (candidate.reportVersion !== context.reportVersion) return "report_changed";
  // Decisions store the hash of null as well; the public profileVersion is nullable.
  if (candidate.profileVersion !== versionOf(context.profile)) return "profile_changed";
  if (!context.matchedReview) return "authorization_changed";
  // A rejection of this exact version is a completed decision, not another pending review.
  if (candidate.decision === "rejected") return null;
  if (!context.profileCheck.ok) return "profile_requires_update";
  return null;
}

export async function pendingReviews(reviewerId: string): Promise<PendingReviews> {
  const assignments = await reviewRepository.assignments(reviewerId);
  const items: PendingReviewItem[] = [];
  const grants = new Map<string, string>();
  for (const { clientId } of assignments) {
    // Bind reads to a grant so revocation/reassignment during evaluation discards the data.
    const grantId = await reviewRepository.grantVersion(reviewerId, clientId);
    if (!grantId) continue;
    const reports = await storage.listReports(clientId);
    const latestByTicker = new Map<string, InvestmentReport>();
    // listReports returns newest first, as used by reviewContext's historical check.
    for (const report of reports) {
      if (report.userId === clientId && !latestByTicker.has(report.ticker))
        latestByTicker.set(report.ticker, report);
    }
    const clientItems: PendingReviewItem[] = [];
    for (const report of Array.from(latestByTicker.values())) {
      const context = await reviewContext(report);
      if (context.presentation.historical) continue;
      const reason = pendingReviewReason(context);
      if (reason) clientItems.push({
        clientId, reportId: report.id, ticker: report.ticker,
        companyName: report.companyName, generatedAt: report.generatedAt, reason,
        blockedReasons: context.presentation.recommendation.reasons.filter(r => !r.startsWith("Revisão")),
      });
    }
    if (await reviewRepository.grantVersion(reviewerId, clientId) === grantId) {
      grants.set(clientId, grantId);
      items.push(...clientItems);
    }
  }
  // Recheck all grants at the response boundary, including clients processed earlier.
  const currentAssignments = new Set<string>();
  for (const [clientId, grantId] of Array.from(grants))
    if (await reviewRepository.grantVersion(reviewerId, clientId) === grantId) currentAssignments.add(clientId);
  const scoped = items.filter(item => currentAssignments.has(item.clientId));
  return { total: scoped.length, items: scoped };
}

export async function reviewedReport(report: InvestmentReport, options: Parameters<typeof reviewContext>[1] = {}): Promise<InvestmentReport & ReportPresentation> {
  const context = await reviewContext(report, options);
  const view = informationalReport(report, context.presentation);
  // Audit can show an old decision, but its recommendation text must not leak when blocked.
  if (view.recommendation.review && view.recommendation.status !== "approved")
    view.recommendation = { ...view.recommendation, review: { ...view.recommendation.review, recommendationText: null } };
  return view;
}

export async function recordReview(reviewerId: string, clientId: string, reportId: string, input: z.infer<typeof reviewInput>) {
  if (!await reviewRepository.authorized(reviewerId, clientId)) throw new ReviewError(403, "CONSULTANT_NOT_AUTHORIZED");
  const grantId = await reviewRepository.grantVersion(reviewerId, clientId);
  if (!grantId) throw new ReviewError(403, "CONSULTANT_NOT_AUTHORIZED");
  const report = (await storage.listReports(clientId)).find(r => r.id === reportId);
  if (!report) throw new ReviewError(404, "REPORT_NOT_FOUND");
  const context = await reviewContext(report);
  if (context.reportVersion !== input.reportVersion || context.profileVersion !== input.profileVersion)
    throw new ReviewError(409, "REVIEW_VERSION_CHANGED");
  if (input.decision === "approved") {
    const reasons = context.presentation.recommendation.reasons.filter(r => !r.startsWith("Revisão"));
    if (reasons.length || !input.recommendationText?.trim()) throw new ReviewError(409, "REVIEW_SAFETY_BLOCKED");
  }
  const review: ProfessionalReview = {
    id: randomUUID(), reviewerId, clientId, reportId, reportVersion: context.reportVersion,
    profileVersion: versionOf(context.profile), decision: input.decision, reason: input.reason,
    recommendationText: input.decision === "approved" ? input.recommendationText! : null,
    reviewedAt: new Date().toISOString(),
  };
  await reviewRepository.append(review, grantId);
  return review;
}