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
