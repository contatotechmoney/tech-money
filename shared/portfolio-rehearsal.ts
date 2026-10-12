import { PORTFOLIO_DEMO_VERSION } from "./portfolio-simulation";

/** Browser-only training, never a server budget, tariff or execution permission. */
export const REHEARSAL_MODELS = [
  { id: "fictional-a", label: "Modelo fictício A — demonstração", estimate: 100_000 },
  { id: "fictional-b", label: "Modelo fictício B — demonstração", estimate: 200_000 },
] as const;
export type RehearsalBudget = {
  version: 1; mode: "simulation"; executable: false;
  modelId: string; modelLabel: string; scenarioVersion: string;
  ceilingUsdMicros: number; estimatedUsdMicros: number;
  createdAt: number; expiresAt: number; sharing: string[];
};
export function prepareRehearsal(modelId: string, ceilingUsdMicros: number, now: number): RehearsalBudget {
  const model = REHEARSAL_MODELS.find(item => item.id === modelId);
  if (!model) throw new Error("MODEL_SELECTION_REQUIRED");
  if (!Number.isFinite(now) || !Number.isSafeInteger(ceilingUsdMicros) ||
      ceilingUsdMicros <= 0 || ceilingUsdMicros > 1_000_000)
    throw new Error("INVALID_CEILING");
  if (model.estimate > ceilingUsdMicros) throw new Error("BUDGET_EXCEEDED");
  return {
    version: 1, mode: "simulation", executable: false,
    modelId, modelLabel: model.label, scenarioVersion: PORTFOLIO_DEMO_VERSION,
    ceilingUsdMicros, estimatedUsdMicros: model.estimate, createdAt: now,
    expiresAt: now + 120_000,
    sharing: ["Somente a carteira fictícia da demonstração.", "Nenhum dado será compartilhado com provedores."],
  };
}
export function approveRehearsal(budget: RehearsalBudget, modelId: string, ceilingUsdMicros: number,
  now: number, confirmed: boolean): void {
  if (confirmed !== true) throw new Error("APPROVAL_REQUIRED");
  if (!Number.isFinite(now) || now < budget.createdAt || now >= budget.expiresAt)
    throw new Error("BUDGET_EXPIRED");
  const expected = prepareRehearsal(modelId, ceilingUsdMicros, budget.createdAt);
  if (JSON.stringify(budget) !== JSON.stringify(expected)) throw new Error("APPROVAL_INVALIDATED");
}
