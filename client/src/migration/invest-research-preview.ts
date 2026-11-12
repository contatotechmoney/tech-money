import { COMITE_RV } from "@shared/personas";

export const previewCompanies = [
  { ticker: "EXEMP3", name: "Empresa Exemplo S.A.", reportDate: "26/10/2026", reportIso: "2026-10-26" },
  { ticker: "HORIZ3", name: "Indústria Horizonte S.A.", reportDate: "06/11/2026", reportIso: "2026-11-06" },
] as const;
export type PreviewCompany = (typeof previewCompanies)[number];
export const previewSpecialists = COMITE_RV.filter(id => id !== "rafael");
export const previewResearchPhases = [
  { id: "sources", label: "Coleta de fontes", activity: "Separando os documentos fictícios da empresa.", done: "Fontes de exemplo coletadas", intervalMs: 1_200 },
  { id: "opinions", label: "Pareceres dos especialistas", activity: "Preparando os pareceres fictícios do comitê.", done: "Pareceres de exemplo concluídos", intervalMs: 900 },
  { id: "synthesis", label: "Síntese do Rafael", activity: "Reunindo os pontos em comum e as pendências de revisão.", done: "Síntese de exemplo pronta", intervalMs: 2_500 },
] as const;
export type PreviewResearchPhase = (typeof previewResearchPhases)[number]["id"] | "ready";

export type PreviewRun = {
  id: string;
  company: PreviewCompany;
  phase: PreviewResearchPhase;
  completedInPhase: number;
};
export const previewReportPath = "/investments/reports/previa";
export const internalEquityBudgetPath = "/investments/gestao/orcamento";
export const previewCompanyWatchPath = "/investments/acompanhar/bbse3";
export const formatPreviewUsd = (micros: number) => new Intl.NumberFormat("pt-BR", {
  style: "currency", currency: "USD", minimumFractionDigits: 6, maximumFractionDigits: 6,
}).format(micros / 1e6);
const equityBrl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatEquityBrl = (cents: number) => equityBrl.format(cents / 100);
