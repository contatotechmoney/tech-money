import { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, BrainCircuit, FileText, Gift, Loader2, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportDeliveryDialog } from "@/components/report-delivery-dialog";
import { useLanguage } from "@/contexts/LanguageContext";

type AgentReport = {
  ticker: string;
  companyName: string;
  generatedAt: string;
  price: number;
  changePercent: number;
  signal: string;
  summary: string;
};

export default function AIAgents() {
  const { t } = useLanguage();
  const [deliveryReport, setDeliveryReport] = useState<AgentReport | null>(null);
  const reportsQuery = useQuery<{ reports: AgentReport[] }>({
    queryKey: ["/api/investments/reports"],
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

      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">{t("generatedByAgents")}</h2>
         {reportsQuery.isLoading ? (
           <div className="flex min-h-48 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 animate-spin" />{t("loading")}</div>
         ) : reportsQuery.isError ? (
           <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">{t("reportsError")}</div>
         ) : (
         <div className="grid gap-5 md:grid-cols-2">
           {reports.map((report) => (
              <Card key={report.ticker} className="h-full border-border/80 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
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
                        <span className="text-sm font-medium">{report.signal}</span>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-muted-foreground">{report.summary}</p>
                    </div>
                    <Badge variant="outline" className={`mt-4 ${report.changePercent >= 0 ? "border-emerald-200 text-emerald-700" : "border-red-200 text-red-700"}`}>{formatPercent(report.changePercent)} · {t("viewReport")}</Badge>
                  </CardContent>
                </Link>
                <div className="px-6 pb-6">
                  <Button variant="outline" className="w-full" onClick={() => setDeliveryReport(report)}>
                    <Gift className="mr-2 h-4 w-4 text-primary" />
                    {t("requestFreeAnalysis")}
                  </Button>
                </div>
              </Card>
            ))}
         </div>
         )}
      </div>
      <ReportDeliveryDialog
        report={deliveryReport}
        open={Boolean(deliveryReport)}
        onOpenChange={(open) => {
          if (!open) setDeliveryReport(null);
        }}
      />
    </div>
  );
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2).replace(".", ",")}%`;
}