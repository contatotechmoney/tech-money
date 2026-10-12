export type AnalysisStatus = "complete" | "partial" | "unavailable" | "outdated";

/** Only new, audited pipeline runs receive this metadata. Legacy documents stay untouched. */
export type AnalysisQuality = {
  version: 1;
  status: Exclude<AnalysisStatus, "outdated">;
  reason: string;
  availableAgents: number;
  expectedAgents: number;
  missingAgents: string[];
  consensusScore: number | null;
  highRisk: boolean;
  marketDataAt: string | null;
  fundamentalsPeriod: string | null;
};

export type ReportPresentation = {
  analysisStatus: AnalysisStatus;
  analysisReason: string;
  availableAgents: number;
  expectedAgents: number;
  consensusScore: number | null;
  highRisk: boolean;
  marketDataAt: string | null;
  fundamentalsPeriod: string | null;
  historical: boolean;
  recommendation: {
    status: "pending" | "approved" | "rejected";
    professionalReview: "pending" | "approved" | "rejected";
    profileStatus: "compatible" | "pending" | "incompatible";
    reasons: string[];
    review?: ProfessionalReview;
  };
};

export type ProfessionalReview = {
  id: string;
  reviewerId: string;
  clientId: string;
  reportId: string;
  reportVersion: string;
  profileVersion: string;
  decision: "approved" | "rejected";
  reason: string;
  recommendationText: string | null;
  reviewedAt: string;
};

export const ANALYSIS_LABELS: Record<AnalysisStatus, string> = {
  complete: "Análise completa",
  partial: "Análise parcial",
  unavailable: "Análise indisponível",
  outdated: "Análise desatualizada",
};