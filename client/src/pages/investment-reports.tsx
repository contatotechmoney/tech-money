import { Link } from "wouter";
import { ArrowRight, ChartNoAxesCombined, RefreshCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { trackEvent } from "@/lib/analytics";
import { apiRequest } from "@/lib/queryClient";
import { ReportQualityNotice, ReportQualitySummary, type ReportQuality } from "@/components/report-quality-notice";

type Report = {
  id: string;
  ticker: string;
  companyName: string;
  generatedAt: string;
  price: number;
  changePercent: number;
  signal: string;
  summary: string;
  source?: string;
  analysisStatus?: ReportQuality["analysisStatus"];
  analysisReason?: string;
  availableAgents?: number;
  expectedAgents?: number;
  consensusScore?: number | null;
  highRisk?: boolean;
  marketDataAt?: string | null;
  fundamentalsPeriod?: string | null;
  historical?: boolean;
  recommendation?: ReportQuality["recommendation"];
};
type ReportListResponse = { reports: Report[]; source: string };

export default function InvestmentReports() {
  const { t } = useLanguage();
  const reportsQuery = useQuery<{ reports: Report[]; source: string }>({
    queryKey: ["/api/investments/reports"],
    refetchOnWindowFocus: true,
    staleTime: 0,
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary"><ChartNoAxesCombined className="h-3.5 w-3.5" />{t("investmentArea")}</div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t("reportsTitle")}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t("reportsDescription")}</p>
        </div>
        <Badge variant="outline">{t("generatedByAgents")}</Badge>
      </div>

      {reportsQuery.isLoading ? (
        <div className="grid gap-5 md:grid-cols-2" aria-label={t("loading")}>
          {[0, 1].map((item) => <div key={item} className="space-y-4 rounded-xl border p-6"><div className="h-12 w-40 animate-pulse rounded-lg bg-muted/60" /><div className="h-36 animate-pulse rounded-lg bg-muted/60" /></div>)}
        </div>
      ) : reportsQuery.isError ? (
        <Card><CardContent className="space-y-3 p-8 text-center text-sm text-destructive"><p>{t("reportsError")}</p><Button variant="outline" onClick={() => reportsQuery.refetch()}>Tentar novamente</Button></CardContent></Card>
      ) : (reportsQuery.data?.reports || []).length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Ainda não há relatórios disponíveis.</CardContent></Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {(reportsQuery.data?.reports || []).map((report) => (
            <ReportListCard
              key={report.ticker}
              report={report}

            />
          ))}
        </div>
      )}
      {reportsQuery.isSuccess && (
        <p className="text-xs leading-5 text-muted-foreground">
          Os relatórios são informações gerais, não aconselhamento personalizado. Toda recomendação permanece pendente de revisão profissional; adequação ao perfil não significa aprovação.
        </p>
      )}
    </div>
  );
}

function ReportListCard({ report }: { report: Report }) {
  const { t } = useLanguage();
  const quality = toQuality(report);
  const hasFullAnalysis = quality.analysisStatus === "complete" && !quality.historical;
  return (
    <Card className="border-border/80">
              <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1b4d3e] text-sm font-bold text-white">{report.ticker.slice(0, 2)}</div>
                  <div><CardTitle className="text-xl">{report.ticker}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{report.companyName}</p></div>
                </div>
              </CardHeader>
              <CardContent>
                <ReportQualityNotice quality={quality} source={report.source} generatedAt={report.generatedAt} compact />
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {hasFullAnalysis ? report.summary : quality.analysisReason || "Conteúdo limitado; não há conclusão financeira disponível."}
                </p>
                <ReportQualitySummary quality={quality} />
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">Documento: {formatDate(report.generatedAt)} · Variação informativa da cotação: {formatPercent(report.changePercent)}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild><Link href="/investments/agents">Solicitar análise</Link></Button>
                    <Button asChild size="sm"><Link href={`/investments/agents/${report.ticker}`}>{t("viewReport")}<ArrowRight /></Link></Button>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Recomendação pendente de revisão profissional. Não há envio ou publicação aprovado.</p>
              </CardContent>
    </Card>
  );
}

function toQuality(report: Report): ReportQuality {
  return {
    analysisStatus: report.analysisStatus ?? "unavailable",
    analysisReason: report.analysisReason ?? "A cobertura desta análise ainda não foi confirmada.",
    availableAgents: report.availableAgents ?? 0,
    expectedAgents: report.expectedAgents ?? 0,
    consensusScore: report.consensusScore ?? null,
    highRisk: report.highRisk ?? false,
    marketDataAt: report.marketDataAt ?? null,
    fundamentalsPeriod: report.fundamentalsPeriod ?? null,
    historical: report.historical ?? false,
    recommendation: report.recommendation ?? {
      status: "pending",
      professionalReview: "pending",
      profileStatus: "pending",
      reasons: [],
    },
  };
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2).replace(".", ",")}%`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}