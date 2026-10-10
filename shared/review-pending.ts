export type PendingReviewReason =
  | "new_report"
  | "report_changed"
  | "profile_changed"
  | "authorization_changed"
  | "profile_requires_update";

export type PendingReviewItem = {
  clientId: string;
  reportId: string;
  ticker: string;
  companyName: string;
  generatedAt: string;
  reason: PendingReviewReason;
  /** Existing safety checks remain independent of the need for a professional decision. */
  blockedReasons: string[];
};

export type PendingReviews = { total: number; items: PendingReviewItem[] };
