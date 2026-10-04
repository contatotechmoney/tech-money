import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { pool, storage, type InvestmentReport } from "./storage";
import { perfilVigente, respostasSaoValidas, classificarPerfil, perfilExigidoPara, type SuitabilityProfile } from "./suitability";
import { informationalReport, referenceDate, reportPresentation, type ProfileCheck } from "./report-policy";
import type { ProfessionalReview, ReportPresentation } from "../shared/report-quality";

/** Canonical content hashes bind decisions to content, not just an editable ID or timestamp. */
export function versionOf(value: unknown): string {
  const canonical = (v: any): any => v instanceof Date ? v.toISOString()
    : Array.isArray(v) ? v.map(canonical)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

const REVIEW_COLUMNS = `id, reviewer_id AS "reviewerId", client_id AS "clientId",
 report_id AS "reportId", report_version AS "reportVersion", profile_version AS "profileVersion",
 decision, reason, recommendation_text AS "recommendationText", reviewed_at AS "reviewedAt"`;

/** No self-service grant endpoint: only a trusted operator can provision scoped authorizations. */
export const reviewRepository = {
  async assignments(reviewerId: string): Promise<Array<{ clientId: string }>> {
    const { rows } = await pool.query(
      `SELECT client_id AS "clientId" FROM investment_consultant_authorizations
       WHERE reviewer_id = $1 AND revoked_at IS NULL AND reviewer_id <> client_id`, [reviewerId]);
    return rows;
  },
  async authorized(reviewerId: string, clientId: string, reviewedAt?: string): Promise<boolean> {
    if (reviewerId === clientId) return false;
    const { rows } = await pool.query(
      `SELECT 1 FROM investment_consultant_authorizations
       WHERE reviewer_id = $1 AND client_id = $2 AND revoked_at IS NULL
       AND ($3::timestamptz IS NULL OR granted_at <= $3::timestamptz)`, [reviewerId, clientId, reviewedAt ?? null]);
    return rows.length === 1;
  },
  async profile(clientId: string): Promise<SuitabilityProfile | null> {
    return perfilVigente(clientId);
  },
  async history(clientId: string, reportId: string): Promise<ProfessionalReview[]> {
    const { rows } = await pool.query(
      `SELECT ${REVIEW_COLUMNS} FROM investment_professional_reviews
       WHERE client_id = $1 AND report_id = $2 ORDER BY reviewed_at DESC, id DESC`, [clientId, reportId]);
    return rows.map(row => ({ ...row, reviewedAt: new Date(row.reviewedAt).toISOString() }));
  },
  async append(review: ProfessionalReview): Promise<void> {
    // Re-check authorization atomically at insert. Reviews are append-only.
    const { rowCount } = await pool.query(
      `INSERT INTO investment_professional_reviews
        (id, reviewer_id, client_id, report_id, report_version, profile_version, decision, reason, recommendation_text, reviewed_at)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
       FROM investment_consultant_authorizations a
       JOIN investment_reports r ON r.id = $4 AND r.user_id = $3
       WHERE a.reviewer_id = $2 AND a.client_id = $3 AND a.revoked_at IS NULL AND $2 <> $3`,
      [review.id, review.reviewerId, review.clientId, review.reportId, review.reportVersion,
        review.profileVersion, review.decision, review.reason, review.recommendationText, review.reviewedAt]);
    if (rowCount !== 1) throw new ReviewError(403, "CONSULTANT_NOT_AUTHORIZED");
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
  return { reportVersion, profileVersion, profile, reviews, presentation };
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
  await reviewRepository.append(review);
  return review;
}