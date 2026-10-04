import { HermesAnalysisPanel } from "@/components/hermes-analysis-panel";
import { Link } from "wouter";
import { ArrowRight, BrainCircuit, FileText, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { ReportQualityNotice, ReportQualitySummary, type ReportQuality } from "@/components/report-quality-notice";

type AgentReport = {
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

export default function AIAgents() {
  const { t } = useLanguage();
  const reportsQuery = useQuery<{ reports: AgentReport[] }>({
    queryKey: ["/api/investments/reports"],
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const reports = reportsQuery.data?.reports || [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {t("investmentArea")}
          </div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t("aiAgentsTitle")}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t("aiAgentsDescription")}</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <BrainCircuit className="h-5 w-5 text-primary" />
           <span>{reports.length} {t("generatedByAgents").toLowerCase()}</span>
        </div>
      </div>

      <HermesAnalysisPanel />

      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("generatedByAgents")}</h2>
         {reportsQuery.isLoading ? (
            <div className="grid gap-5 md:grid-cols-2" aria-label={t("loading")}>
              {[0, 1].map((item) => <div key={item} className="space-y-4 rounded-xl border p-6"><div className="h-12 w-40 animate-pulse rounded-lg bg-muted/60" /><div className="h-28 animate-pulse rounded-lg bg-muted/60" /></div>)}
            </div>
         ) : reportsQuery.isError ? (
            <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
              <p>{t("reportsError")}</p>
              <Button variant="outline" onClick={() => reportsQuery.refetch()}>Tentar novamente</Button>
            </div>
         ) : (
          reports.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Ainda não há relatórios disponíveis.</CardContent></Card>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {reports.map((report) => {
                const quality = toQuality(report);
                const hasFullAnalysis = quality.analysisStatus === "complete" && !quality.historical;
                return (
                  <Card key={report.ticker} className="h-full border-border/80 transition-all duration-300 hover:border-primary/40 hover:shadow-lg">
                    <Link href={`/investments/agents/${report.ticker}`} className="group block">
                      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1b4d3e] text-sm font-bold text-white">
                            {report.ticker.slice(0, 2)}
                          </div>
                          <div>
                            <CardTitle className="text-xl">{report.ticker}</CardTitle>
                            <p className="mt-1 text-sm text-muted-foreground">{report.companyName}</p>
                          </div>
                      </div>
                        <ArrowRight className="mt-1 h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                      </CardHeader>
                      <CardContent>
                        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-5">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">Informações de mercado</span>
                          </div>
                          <p className="mt-3 text-xs leading-5 text-muted-foreground">
                            {hasFullAnalysis ? report.summary : quality.analysisReason || "Conteúdo limitado; não há conclusão financeira disponível."}
                          </p>
                          <ReportQualitySummary quality={quality} />
                        </div>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>Variação informativa da cotação: {formatPercent(report.changePercent)}</span>
                          <span>Documento: {formatDate(report.generatedAt)}</span>
                        </div>
                      </CardContent>
                    </Link>
                    <div className="px-6 pb-6">
                      <ReportQualityNotice quality={quality} source={report.source} generatedAt={report.generatedAt} compact />
                      <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
                        A recomendação permanece pendente de revisão profissional. Não é possível solicitar o envio enquanto a revisão não estiver concluída.
                      </p>
                    </div>
                  </Card>
                );
              })}
            </div>
          )
         )}
      </div>
    </div>
  );
}

function toQuality(report: AgentReport): ReportQuality {
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