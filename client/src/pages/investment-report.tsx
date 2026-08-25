import { Link } from "wouter";
import { ArrowLeft, BrainCircuit, CheckCircle2, Clock3, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest } from "@/lib/queryClient";

export default function InvestmentReport({ ticker }: { ticker?: string }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const asset = ticker || "BBDC3";
  const reportQuery = useQuery<ReportResponse>({
    queryKey: [`/api/investments/reports/${asset}`],
    refetchOnWindowFocus: true,
  });
  const refresh = useMutation({
    mutationFn: () => apiRequest("POST", `/api/investments/reports/${asset}/refresh`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [`/api/investments/reports/${asset}`] });
      void queryClient.invalidateQueries({ queryKey: ["/api/investments/reports"] });
    },
  });
  const report = reportQuery.data?.latest;

  return (
    <div className="space-y-6">
      <Link href="/investments/agents">
        <Button variant="ghost" className="px-0 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("backToAgents")}
        </Button>
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
        <div className="flex min-h-64 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 animate-spin" />{t("loading")}</div>
      ) : reportQuery.isError || !report ? (
        <Card><CardContent className="p-8 text-center text-sm text-destructive">{t("reportsError")}</CardContent></Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label={t("currentQuote")} value={currency.format(report.price)} detail={formatPercent(report.changePercent)} positive={report.changePercent >= 0} />
            <MetricCard label={t("agentSignal")} value={report.signal} detail={`${t("generatedOn")} ${formatDate(report.generatedAt)}`} />
            <Card><CardContent className="flex h-full flex-col justify-center p-5"><p className="text-sm text-muted-foreground">{t("dataSource")}</p><p className="mt-2 font-semibold">{report.source}</p><p className="mt-1 text-xs text-muted-foreground">{t("updatedMarketData")}</p></CardContent></Card>
          </div>
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-primary" />{t("reportAnalysis")}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{report.companyName}</p></div>
              <Button variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}><RefreshCw className={refresh.isPending ? "animate-spin" : ""} />{t("refreshReport")}</Button>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="rounded-lg bg-muted/30 p-4 text-sm leading-6">{report.summary}</p>
              <div className="grid gap-5 md:grid-cols-2">
                <InsightList icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} title={t("reportStrengths")} items={report.strengths} />
                <InsightList icon={<ShieldAlert className="h-4 w-4 text-amber-600" />} title={t("reportRisks")} items={report.risks} />
              </div>
              <div className="border-t pt-5"><p className="text-sm font-semibold">{t("agentOutlook")}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{report.outlook}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-primary" />{t("reportHistory")}</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(reportQuery.data?.history || []).map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-muted-foreground">{formatDate(entry.generatedAt)}</span>
                    <span className="font-medium">{currency.format(entry.price)}</span>
                    <Badge variant="outline" className={entry.changePercent >= 0 ? "border-emerald-200 text-emerald-700" : "border-red-200 text-red-700"}>{formatPercent(entry.changePercent)}</Badge>
                    <span className="text-xs text-muted-foreground">{entry.signal}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

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
  outlook: string;
  source: string;
};

type ReportResponse = { latest: Report; history: Report[]; source: string };
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function MetricCard({ label, value, detail, positive }: { label: string; value: string; detail?: string; positive?: boolean }) {
  return <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-xl font-bold">{value}</p>{detail && <p className={`mt-1 text-xs ${positive === undefined ? "text-muted-foreground" : positive ? "text-emerald-700" : "text-red-700"}`}>{detail}</p>}</CardContent></Card>;
}

function InsightList({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  return <div><p className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</p><ul className="mt-3 space-y-2">{items.map((item) => <li key={item} className="text-sm leading-5 text-muted-foreground">• {item}</li>)}</ul></div>;
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2).replace(".", ",")}%`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}