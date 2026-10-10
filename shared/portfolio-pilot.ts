/** Preparation only. These limits do not enable a provider or authorize spending. */
export const PILOT_LIMITS = Object.freeze({
  calls: 6, inputTokens: 18_000, outputTokens: 6_000,
  timeoutMs: 90_000, retries: 0, ceilingUsdMicros: 1_000_000, validityMs: 120_000,
});
export const PILOT_BLOCKERS = [
  "OWNER_ID_UNCONFIRMED", "MODEL_PRICE_UNCONFIRMED", "MARKET_DATA_UNVERIFIED",
  "EXECUTOR_NOT_CONNECTED", "DURABLE_AUDIT_NOT_READY", "REAL_EXECUTION_DISABLED",
] as const;
export type PilotStatus = {
  allowed: boolean;
  mode: "preparation";
  executable: false;
  blockers: string[];
  limits: typeof PILOT_LIMITS;
  models: { key: string; name: string; priceVersion: string }[];
};
export type PilotPosition = { id: string; ticker: string; quantity: number; revision?: string };
export type PilotBudget = {
  id: string; version: number; requestKey: string; owner: string; fingerprint: string;
  modelKey: string; priceVersion: string; positions: PilotPosition[];
  createdAt: number; expiresAt: number; maxSpendUsdMicros: number;
  estimatedMaxUsdMicros: number; limits: typeof PILOT_LIMITS;
  executable: false; sharing: string[];
};
