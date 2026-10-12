import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, BrainCircuit, CheckCircle2, Clock3, Mail, RefreshCw, ShieldAlert } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest } from "@/lib/queryClient";
import { trackEvent } from "@/lib/analytics";
import { ConformidadeGate } from "@/components/conformidade-gate";
import { ReportQualityNotice, type ReportQuality } from "@/components/report-quality-notice";
import { ReportDeliveryHistory } from "@/components/report-delivery-history";
import { ReportDeliverySimulationNotice } from "@/components/report-delivery-simulation-notice";
import { REAL_REPORT_DELIVERY_ENABLED } from "@shared/simulation-policy";

type Report = {
  id: string;
  ticker: string;
  companyName: string;
  generatedAt: string;
  price: number;
  changePercent: number;
  signal: string;
  summary: string;
  strengths: string[];
  risks: string[];
  riskScore: number | null;
  outlook: string;
  source: string;
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

type ReportResponse = { latest: Report; history: Report[]; source: string };
type ReportListResponse = { reports: Report[]; source?: string };

export default function InvestmentReport({ ticker }: { ticker?: string }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const asset = ticker || "BBDC3";
  const detailKey = [`/api/investments/reports/${asset}`];
  const listKey = ["/api/investments/reports"];
  const reportQuery = useQuery<ReportResponse>({
    queryKey: detailKey,
    refetchOnWindowFocus: true,
    staleTime: 0,
    refetchInterval: 30_000,
  });
  const refresh = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/investments/reports/${asset}/refresh`);
      return await response.json() as Report;
    },
    onSuccess: (freshReport) => {
      trackEvent("report_refresh_completed", { ticker: asset, location: "report_detail" });

      // Publish the exact returned presentation first; a failed refresh may intentionally return "outdated".
      queryClient.setQueryData<ReportResponse>(detailKey, (current) => ({
        latest: freshReport,
        history: current?.latest && current.latest.id !== freshReport.id
          ? [current.latest, ...(current.history ?? [])]
          : current?.history ?? [],
        source: freshReport.source ?? current?.source ?? "",
      }));
      queryClient.setQueryData<ReportListResponse>(listKey, (current) => {
        if (!current) return current;
        const exists = current.reports.some((item) => item.ticker === asset);
        return {
          ...current,
          reports: exists
            ? current.reports.map((item) => item.ticker === asset ? freshReport : item)
            : [freshReport, ...current.reports],
        };
      });
      void queryClient.invalidateQueries({ queryKey: detailKey });
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
    onError: () => {
      const markOutdated = (current: Report): Report => ({
        ...current,
        analysisStatus: "outdated",
        analysisReason: "A atualização falhou. Este documento anterior não foi atualizado; confira as datas.",
        consensusScore: null,
        riskScore: null,
        signal: "Recomendação pendente",
        recommendation: {
          status: "pending", professionalReview: "pending", profileStatus: "pending",
          reasons: ["Atualização frustrada; revisão do consultor pendente."],
        },
      });
      queryClient.setQueryData<ReportResponse>(detailKey, (current) => current
        ? { ...current, latest: markOutdated(current.latest) } : current);
      queryClient.setQueryData<ReportListResponse>(listKey, (current) => current
        ? { ...current, reports: current.reports.map((entry) => entry.ticker === asset ? markOutdated(entry) : entry) } : current);
    },
  });
  const report = reportQuery.data?.latest;
  const quality = report ? toQuality(report) : null;
  const isApproved = report?.recommendation?.status === "approved";
  const isRejected = report?.recommendation?.status === "rejected";
  const hasInformativeAnalysis = (quality?.analysisStatus === "complete" || quality?.analysisStatus === "partial") && !quality.historical;

  return (
    <div className="space-y-6">
      <Link href="/investments/agents" className="inline-flex items-center px-0 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t("backToAgents")}
      </Link>
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1b4d3e] text-sm font-bold text-white">{asset.slice(0, 2)}</div>
          <div>
            <p className="text-sm text-muted-foreground">{t("generatedByAgents")}</p>
            <h1 className="text-3xl font-bold tracking-tight">{report?.companyName || asset}</h1>
          </div>
        </div>
      </div>
      {reportQuery.isLoading ? (
        <div className="space-y-4" aria-label={t("loading")}>
          <div className="h-24 animate-pulse rounded-xl bg-muted/60" />
          <div className="h-48 animate-pulse rounded-xl bg-muted/60" />
        </div>
      ) : reportQuery.isError || !report ? (
        <Card><CardContent className="space-y-3 p-8 text-center text-sm text-destructive">
          <p>{t("reportsError")}</p>
          <Button variant="outline" onClick={() => reportQuery.refetch()}>Tentar novamente</Button>
        </CardContent></Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Cotação registrada no documento" value={currency.format(report.price)} detail={`Variação informativa: ${formatPercent(report.changePercent)}`} />
            <MetricCard
              label="Status da recomendação"
              value={isApproved ? "Recomendação aprovada" : isRejected ? "Rejeitada" : "Pendente"}
              detail={isApproved ? "Revisada por consultor" : isRejected ? "Não disponível para entrega" : "Aguardando revisão profissional"}
            />
            <Card><CardContent className="flex h-full flex-col justify-center p-5">
              <p className="text-sm text-muted-foreground">{t("dataSource")}</p>
              <p className="mt-2 font-semibold">{report.source || reportQuery.data?.source || "Não informado"}</p>
              <p className="mt-1 text-xs text-muted-foreground">Documento: {formatDate(report.generatedAt)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Dados de mercado: {quality?.marketDataAt ? formatDate(quality.marketDataAt) : "Não informado"}</p>
            </CardContent></Card>
          </div>
          {quality && <ReportQualityNotice quality={quality} source={report.source || reportQuery.data?.source} generatedAt={report.generatedAt} />}
          <ConformidadeGate ticker={asset} />
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-primary" />{t("reportAnalysis")}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{report.companyName}</p></div>
              <Button variant="outline" disabled title="Use o fluxo de simulação em Agentes ou Relatórios.">
                Análise real desabilitada
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {refresh.isError && (
                <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  Não foi possível atualizar o relatório. O documento exibido pode estar desatualizado. Tente novamente.
                </p>
              )}
              {refresh.isSuccess && refresh.data?.analysisStatus === "outdated" && (
                <p role="alert" className="rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-950">
                  A atualização não produziu dados atuais. O relatório abaixo está marcado como desatualizado; consulte a data dos dados de mercado antes de utilizá-lo.
                </p>
              )}
              {hasInformativeAnalysis ? (
                <>
                  <p className="rounded-lg bg-muted/30 p-4 text-sm leading-6">{report.summary}</p>
                  <div className="grid gap-5 md:grid-cols-2">
                    <InsightList icon={<CheckCircle2 className="h-4 w-4 text-sky-700" />} title={t("reportStrengths")} items={report.strengths} />
                    <InsightList icon={<ShieldAlert className="h-4 w-4 text-amber-700" />} title={t("reportRisks")} items={report.risks} />
                  </div>
                  <div className="border-t pt-5">
                    <p className="text-sm font-semibold">{isApproved ? "Recomendação aprovada" : "Recomendação profissional"}</p>
                    {isApproved ? (
                      <>
                        <p className="mt-2 text-xs font-semibold text-emerald-800">Recomendação aprovada</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{report.recommendation?.review?.recommendationText || report.outlook}</p>
                      </>
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {isRejected
                          ? "Esta recomendação foi rejeitada pelo consultor. O texto de recomendação não está disponível para o cliente."
                          : "O texto de recomendação permanece oculto até a revisão profissional. A análise acima é informativa e não constitui aconselhamento personalizado."}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  {quality?.analysisReason || "Não há conteúdo suficiente para apresentar conclusões."} Este conteúdo é apenas informativo; não há sinal financeiro nem pontuação de consenso.
                </p>
              )}
                <p className="border-t pt-4 text-xs leading-5 text-muted-foreground">
                 {isApproved
                   ? "A recomendação foi revisada por consultor. A entrega só fica disponível após aprovação e permanece sujeita ao consentimento e aos controles aplicáveis."
                   : "Informações gerais, não aconselhamento personalizado. A recomendação não está aprovada para divulgação."}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-primary" />{t("reportHistory")}</CardTitle></CardHeader>
            <CardContent>
              {(reportQuery.data?.history ?? []).length === 0 ? (
                <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Não há documentos anteriores disponíveis.</p>
              ) : (
                <div className="space-y-3">
                  {(reportQuery.data?.history ?? []).map((entry) => {
                    const historicalQuality = {
                      ...toQuality(entry),
                      historical: true,
                      recommendation: {
                        ...toQuality(entry).recommendation,
                        status: "pending" as const,
                        professionalReview: "pending" as const,
                        review: undefined,
                      },
                    };
                    return (
                      <div key={entry.id} className="space-y-3 rounded-lg border px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold">Documento histórico · {formatDate(entry.generatedAt)}</span>
                          <Badge variant="outline">{historicalQuality.analysisStatus === "complete" ? "Análise completa à época" : statusLabel(historicalQuality.analysisStatus)}</Badge>
                        </div>
                        <ReportQualityNotice quality={historicalQuality} source={entry.source} generatedAt={entry.generatedAt} compact />
                        <p className="text-xs text-muted-foreground">Documento histórico; não representa informação atual nem recomendação aprovada.</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
      <ReportDeliveryCard ticker={asset} enabled={!!isApproved} />
    </div>
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

export function ReportDeliveryCard({ ticker, enabled }: { ticker: string; enabled: boolean }) {
  // This phase never offers real sends, including for previously approved advice.
  const deliveryEnabled = enabled && REAL_REPORT_DELIVERY_ENABLED;
  const [email, setEmail] = useState("");
  const queryClient = useQueryClient();
  const startDelivery = useMutation({
    mutationFn: async () => {
      if (!REAL_REPORT_DELIVERY_ENABLED) throw new Error("REAL_REPORT_DELIVERY_DISABLED");
      const idempotencyKey = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${ticker}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const response = await apiRequest("POST", `/api/investments/reports/${encodeURIComponent(ticker)}/delivery`, {
        channel: "email",
        contact: email.trim(),
        idempotencyKey,
      });
      return await response.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["/api/investments/report-deliveries", ticker],
      });
    },
  });

  return (
    <Card className={deliveryEnabled ? "border-emerald-300" : "border-dashed"}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4 text-primary" /> Entrega do relatório</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!deliveryEnabled ? (
          <ReportDeliverySimulationNotice />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Envie a recomendação aprovada ao cliente por e-mail. A confirmação será acompanhada nesta tela.</p>
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); startDelivery.mutate(); }}>
              <label className="sr-only" htmlFor="delivery-email">E-mail de contato do cliente</label>
              <input
                id="delivery-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="E-mail de contato"
                className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button type="submit" disabled={!email.trim() || startDelivery.isPending}>
                {startDelivery.isPending ? "Solicitando..." : "Enviar relatório"}
              </Button>
            </form>
            {startDelivery.isError && <p role="alert" className="text-sm text-destructive">Não foi possível iniciar a entrega. Verifique o contato e tente novamente.</p>}
          </>
        )}
        <ReportDeliveryHistory ticker={ticker} />
      </CardContent>
    </Card>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-xl font-bold">{value}</p>{detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}</CardContent></Card>;
}

function InsightList({ icon, title, items }: { icon: ReactNode; title: string; items: string[] }) {
  return <div><p className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</p><ul className="mt-3 space-y-2">{items.map((item, index) => <li key={`${index}-${item}`} className="text-sm leading-5 text-muted-foreground">{item}</li>)}</ul></div>;
}

function statusLabel(status: ReportQuality["analysisStatus"]) {
  return {
    complete: "Análise completa",
    partial: "Análise parcial",
    unavailable: "Análise indisponível",
    outdated: "Análise desatualizada",
  }[status];
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2).replace(".", ",")}%`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });