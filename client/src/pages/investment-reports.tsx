import { Link } from "wouter";
import { ArrowRight, ChartNoAxesCombined, FileText, Loader2, RefreshCw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest } from "@/lib/queryClient";

type Report = {
  id: string;
  ticker: string;
  companyName: string;
  generatedAt: string;
  price: number;
  changePercent: number;
  signal: string;
  summary: string;
};

export default function InvestmentReports() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const reportsQuery = useQuery<{ reports: Report[]; source: string }>({
    queryKey: ["/api/investments/reports"],
    refetchOnWindowFocus: true,
  });
  const refresh = useMutation({
    mutationFn: (ticker: string) => apiRequest("POST", `/api/investments/reports/${ticker}/refresh`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/api/investments/reports"] }),
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
        <div className="flex min-h-48 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 animate-spin" />{t("loading")}</div>
      ) : reportsQuery.isError ? (
        <Card><CardContent className="p-8 text-center text-sm text-destructive">{t("reportsError")}</CardContent></Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {(reportsQuery.data?.reports || []).map((report) => (
            <Card key={report.ticker} className="border-border/80">
              <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1b4d3e] text-sm font-bold text-white">{report.ticker.slice(0, 2)}</div>
                  <div><CardTitle className="text-xl">{report.ticker}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{report.companyName}</p></div>
                </div>
                <Badge variant="outline" className={report.changePercent >= 0 ? "border-emerald-200 text-emerald-700" : "border-red-200 text-red-700"}>{formatPercent(report.changePercent)}</Badge>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">{report.summary}</p>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">{t("generatedOn")} {formatDate(report.generatedAt)}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => refresh.mutate(report.ticker)} disabled={refresh.isPending}><RefreshCw className={refresh.isPending ? "animate-spin" : ""} />{t("refreshReport")}</Button>
                    <Link href={`/investments/agents/${report.ticker}`}><Button size="sm">{t("viewReport")}<ArrowRight /></Button></Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("reportDataNotice")}</p>
    </div>
  );
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2).replace(".", ",")}%`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}