import * as React from "react";
import { AlertTriangle, CircleHelp, Clock3, Database, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ReportPresentation } from "@shared/report-quality";

export type ReportQuality = ReportPresentation;

const statusLabels: Record<ReportQuality["analysisStatus"], string> = {
  complete: "Análise completa",
  partial: "Análise parcial",
  unavailable: "Análise indisponível",
  outdated: "Análise desatualizada",
};

const statusStyles: Record<ReportQuality["analysisStatus"], string> = {
  complete: "border-sky-200 bg-sky-50 text-sky-900",
  partial: "border-amber-200 bg-amber-50 text-amber-950",
  unavailable: "border-rose-200 bg-rose-50 text-rose-950",
  outdated: "border-orange-200 bg-orange-50 text-orange-950",
};

export function ReportQualityNotice({
  quality,
  source,
  generatedAt,
  compact = false,
}: {
  quality?: ReportQuality | null;
  source?: string | null;
  generatedAt?: string | null;
  compact?: boolean;
}) {
  const status = quality?.analysisStatus ?? "unavailable";
  const reason = quality?.analysisReason?.trim() || "Não há informação suficiente para confirmar a cobertura desta análise.";
  const marketDate = quality?.marketDataAt ? formatDate(quality.marketDataAt) : "Não informado";
  const documentDate = generatedAt ? formatDate(generatedAt) : "Não informado";
  const profileStatus = quality?.recommendation?.profileStatus ?? "pending";
  const recommendationStatus = quality?.recommendation?.status ?? "pending";
  const review = quality?.recommendation?.review;
  const reviewLabel = recommendationStatus === "approved"
    ? "Recomendação aprovada por consultor"
    : recommendationStatus === "rejected"
      ? "Recomendação rejeitada por consultor"
      : "Recomendação pendente de revisão profissional";
  const recommendationReasons = quality?.recommendation?.reasons ?? [];
  const profileText = profileStatus === "compatible"
    ? "Perfil indicado como compatível — isso não equivale a aprovação ou recomendação."
    : profileStatus === "incompatible"
      ? "Há indicação de incompatibilidade com o perfil. Não interprete este documento como recomendação."
      : "Adequação ao perfil ainda não confirmada.";

  return (
    <Card className={`border ${statusStyles[status]}`} role="note" aria-label={`Qualidade do relatório: ${statusLabels[status]}`}>
      <CardContent className={compact ? "space-y-2 p-4" : "space-y-3 p-5"}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={statusStyles[status]}>
            {status === "partial" || status === "unavailable" || status === "outdated"
              ? <AlertTriangle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              : <CircleHelp className="mr-1 h-3.5 w-3.5" aria-hidden="true" />}
            {statusLabels[status]}
          </Badge>
          <Badge
            variant="outline"
            className={recommendationStatus === "approved"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : recommendationStatus === "rejected"
                ? "border-rose-300 bg-rose-50 text-rose-900"
                : "border-amber-300 bg-amber-50 text-amber-950"}
          >
            {recommendationStatus === "approved" ? "Recomendação aprovada" : recommendationStatus === "rejected" ? "Recomendação rejeitada" : "Revisão pendente"}
          </Badge>
          {quality && quality.expectedAgents > 0 && (
            <span className="text-xs">
              Cobertura: {quality.availableAgents} de {quality.expectedAgents} agentes
            </span>
          )}
          {quality?.historical && <Badge variant="outline">Documento histórico</Badge>}
          {quality?.highRisk && (
            <Badge variant="outline" className="border-rose-300 text-rose-900">
              <ShieldAlert className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Risco elevado
            </Badge>
          )}
        </div>
        <p className="text-sm leading-5">{reason}</p>
        <div className="grid gap-x-5 gap-y-1 text-xs sm:grid-cols-2">
          <p className="flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Data do documento: {documentDate}
          </p>
          <p className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Data dos dados de mercado: {marketDate}
          </p>
          {source && <p className="sm:col-span-2">Fonte: {source}</p>}
          {quality?.fundamentalsPeriod && <p>Período dos fundamentos: {quality.fundamentalsPeriod}</p>}
        </div>
        {review && (
          <div className="rounded-md border border-current/15 bg-background/40 p-3 text-xs leading-5">
            <p>Revisor: {review.reviewerId}</p>
            <p>Data da revisão: {formatDate(review.reviewedAt)}</p>
            <p>Versão do relatório: {review.reportVersion}</p>
            <p>Motivo: {review.reason}</p>
          </div>
        )}
        {!compact && (
          <div className="border-t border-current/15 pt-3">
            <p className="text-sm font-semibold">{reviewLabel}</p>
            <p className="mt-1 text-xs leading-5">{profileText}</p>
            {recommendationReasons.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-xs">
                {recommendationReasons.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
              </ul>
            )}
            {status !== "complete" && (
              <p className="mt-2 text-xs font-medium">
                {status === "partial"
                  ? "Conteúdo parcial: apenas informações disponíveis; não há sinal financeiro nem pontuação de consenso."
                  : "Este conteúdo não deve ser usado como análise atual ou orientação de investimento."}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ReportQualitySummary({ quality }: { quality?: ReportQuality | null }) {
  const status = quality?.analysisStatus ?? "unavailable";
  return (
    <p className="mt-2 text-xs leading-5 text-muted-foreground">
      {statusLabels[status]} · {quality?.recommendation?.status === "approved" ? "recomendação aprovada por consultor" : quality?.recommendation?.status === "rejected" ? "recomendação rejeitada por consultor" : "recomendação pendente de revisão profissional"}
      {quality?.historical ? " · documento histórico, não atual" : ""}
      {quality?.highRisk ? " · risco elevado identificado" : ""}
    </p>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}