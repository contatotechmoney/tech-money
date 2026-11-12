export const initialPreviewPrepaidCredits = 100;

export const previewCreditRates = {
  analysis: 20,
  voiceMinute: 2,
  monitorCompanyMonth: 30,
} as const;

export type PreviewCreditQuantities = Record<keyof typeof previewCreditRates, number>;

export type PreviewCreditUsage =
  | { kind: "analysis"; ticker: string }
  | { kind: "voice"; minutes: number; ticker: string }
  | { kind: "monitor" }
  | { kind: "combined"; units: PreviewCreditQuantities };

export function combinedPreviewCreditCost(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const { analysis, voiceMinute, monitorCompanyMonth } = input as Record<string, unknown>;
  if (typeof analysis !== "number" || typeof voiceMinute !== "number" || typeof monitorCompanyMonth !== "number") return null;
  const units = { analysis, voiceMinute, monitorCompanyMonth };
  if (Object.values(units).some(value => !Number.isSafeInteger(value) || value < 0 || value > 1000)) return null;
  const credits = analysis * previewCreditRates.analysis + voiceMinute * previewCreditRates.voiceMinute
    + monitorCompanyMonth * previewCreditRates.monitorCompanyMonth;
  return credits ? { units, credits } : null;
}
