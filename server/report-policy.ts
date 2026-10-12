import type { AnalysisQuality, ProfessionalReview, ReportPresentation } from "../shared/report-quality";

export const REPORT_FRESHNESS_MS = 6 * 60 * 60 * 1000;

export type PolicyReport = {
  generatedAt: string;
  riskScore: number | null;
  analysisQuality?: AnalysisQuality | null;
  source?: string;
  price?: number;
  changePercent?: number;
};

export type ProfileCheck = { ok: boolean; incompativel?: boolean; motivo?: string };

/** Reject rollover dates (e.g. February 30), ambiguous local dates and future placeholders. */
export function referenceDate(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string") return NaN;
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  if (!match) return NaN;
  const calendar = new Date(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== match[1]
    || (match[2] !== undefined && (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59))) return NaN;
  return Date.parse(value);
}

export function reportPresentation(
  report: PolicyReport,
  options: { now?: number; historical?: boolean; refreshFailure?: string; profile?: ProfileCheck; review?: ProfessionalReview } = {},
): ReportPresentation {
  const quality = report.analysisQuality?.version === 1 ? report.analysisQuality : null;
  const generated = referenceDate(report.generatedAt);
  const marketData = referenceDate(quality?.marketDataAt);
  const now = options.now ?? Date.now();
  const expired = !Number.isFinite(generated) || generated > now
    || now - generated >= REPORT_FRESHNESS_MS
    || (Number.isFinite(marketData) && (marketData > now || now - marketData >= REPORT_FRESHNESS_MS));
  const outdated = expired || Boolean(options.refreshFailure) || Boolean(options.historical);
  const riskValid = report.riskScore !== null && Number.isFinite(report.riskScore)
    && report.riskScore >= 0 && report.riskScore <= 10;
  const period = referenceDate(quality?.fundamentalsPeriod);
  const dataValid = Number.isFinite(marketData) && marketData <= now
    && Number.isFinite(period) && period <= now && now - period <= 366 * 24 * 60 * 60 * 1000
    && Boolean(report.source?.trim());
  const quoteValid = report.price !== undefined && Number.isFinite(report.price) && report.price > 0
    && report.changePercent !== undefined && Number.isFinite(report.changePercent);
  const baseStatus = quality?.status === "complete" && (!dataValid || !riskValid || !quoteValid
    || quality.availableAgents !== quality.expectedAgents || quality.expectedAgents !== 9
    || !Array.isArray(quality.missingAgents) || quality.missingAgents.length !== 0 || quality.consensusScore === null
    || !Number.isFinite(quality.consensusScore) || quality.consensusScore < 0 || quality.consensusScore > 10)
    ? "partial" : quality?.status ?? "unavailable";
  const analysisStatus = outdated ? "outdated" : baseStatus;
  const analysisReason = [
    options.historical ? "Documento histórico datado; não é uma análise atual nem uma recomendação aprovada." : "",
    options.refreshFailure,
    expired ? "O prazo de atualização de seis horas venceu." : "",
    quality?.status === "complete" && baseStatus !== "complete" ? "Os dados ou o risco necessários para uma análise completa não foram validados." : "",
    quality?.reason ?? "Documento anterior sem registro verificável da qualidade dos agentes; conteúdo original preservado, mas não validado nesta versão.",
  ].filter(Boolean).join(" ");
  const reasons = [
    analysisStatus !== "complete" ? "É necessária uma análise completa e atual." : "",
    !dataValid ? "Dados financeiros ou sua data de referência estão pendentes." : "",
    !quoteValid ? "Cotação ou variação inválida." : "",
    !riskValid ? "Classificação de risco válida pendente." : "",
    quality?.highRisk || (riskValid && report.riskScore! > 8.5) ? "Risco elevado: veto de segurança; não liberar recomendação." : "",
    !options.profile?.ok || options.profile?.incompativel
      ? options.profile?.motivo ?? "Perfil suficiente, vigente e compatível ainda não confirmado."
      : "",
    options.review?.decision === "rejected" ? `Revisão rejeitada: ${options.review.reason}`
      : !options.review ? "Revisão do consultor pendente para esta versão do relatório e do perfil." : "",
  ].filter(Boolean);
  return {
    analysisStatus,
    analysisReason,
    availableAgents: quality?.availableAgents ?? 0,
    expectedAgents: quality?.expectedAgents ?? 9,
    consensusScore: analysisStatus === "complete" && riskValid ? quality?.consensusScore ?? null : null,
    highRisk: Boolean(quality?.highRisk || (riskValid && report.riskScore! > 8.5)),
    marketDataAt: quality?.marketDataAt ?? null,
    fundamentalsPeriod: quality?.fundamentalsPeriod ?? null,
    historical: Boolean(options.historical),
    recommendation: {
      status: options.review?.decision === "rejected" ? "rejected"
        : options.review?.decision === "approved" && reasons.length === 0 ? "approved" : "pending",
      professionalReview: options.review?.decision ?? "pending",
      profileStatus: options.profile?.ok && analysisStatus === "complete" && riskValid && dataValid
        ? "compatible" : options.profile?.incompativel ? "incompatible" : "pending",
      reasons,
      review: options.review,
    },
  };
}

/** The presentation must come from the server's current, owner-scoped review evaluation. */
export function canDeliverPersonalizedRecommendation(presentation?: ReportPresentation): boolean {
  return presentation?.recommendation.status === "approved" && presentation.analysisStatus === "complete"
    && !presentation.historical && !presentation.highRisk
    && presentation.recommendation.profileStatus === "compatible"
    && presentation.recommendation.professionalReview === "approved"
    && Boolean(presentation.recommendation.review?.recommendationText?.trim());
}

/** Never expose legacy text containing unverified consensus, fallback scores or trading signals. */
export function informationalReport<T extends PolicyReport & {
  signal: string; summary: string; strengths: string[]; risks: string[]; outlook: string;
}>(report: T, presentation: ReportPresentation): T & ReportPresentation {
  const verified = report.analysisQuality?.version === 1;
  return {
    ...report,
    ...presentation,
    analysisQuality: undefined,
    signal: canDeliverPersonalizedRecommendation(presentation) ? "Recomendação aprovada" : "Recomendação pendente",
    summary: verified ? report.summary : "Documento original preservado no histórico. Sua análise não foi validada por este processo de qualidade e não pode fundamentar uma recomendação.",
    strengths: verified ? report.strengths : [],
    risks: verified ? report.risks : ["Qualidade da análise original não verificada."],
    riskScore: verified && presentation.analysisStatus === "complete" ? report.riskScore : null,
    outlook: canDeliverPersonalizedRecommendation(presentation)
      ? presentation.recommendation.review!.recommendationText!
      : "Informação geral, sem recomendação individualizada aprovada. Consulte o estado da revisão profissional.",
  };
}