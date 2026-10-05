import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Clock3, FileCheck2, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";

type Assignment = { clientId: string };
type Review = {
  id: string;
  reviewerId: string;
  clientId: string;
  reportId: string;
  reportVersion: string;
  profileVersion: string | null;
  decision: "approved" | "rejected";
  reason: string;
  recommendationText?: string;
  reviewedAt: string;
};
type ReviewReport = {
  id: string;
  ticker?: string;
  companyName?: string;
  generatedAt?: string;
  reportVersion: string;
  profileVersion: string | null;
  profile: Record<string, unknown> | null;
  reviews: Review[];
  summary?: string;
  strengths?: string[];
  risks?: string[];
  outlook?: string;
  [field: string]: unknown;
};
type Question = { id: string; pergunta: string; opcoes: string[] };
type ReportsResponse = { reports: ReviewReport[]; questionnaire: Question[] };

export default function InvestmentReview() {
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedReport, setSelectedReport] = useState("");
  const access = useQuery<{ assignments: Assignment[] }>({
    queryKey: ["/api/investments/review-access"],
    staleTime: 0,
    queryFn: async () => (await apiRequest("GET", "/api/investments/review-access")).json(),
    refetchOnWindowFocus: true,
  });
  const assignments = access.data?.assignments ?? [];
  const activeClient = assignments.find(({ clientId }) => clientId === selectedClient)?.clientId ?? assignments[0]?.clientId;
  const reports = useQuery<ReportsResponse>({
    queryKey: ["/api/investments/review-clients", activeClient, "reports"],
    staleTime: 0,
    queryFn: async () => (await apiRequest("GET", `/api/investments/review-clients/${encodeURIComponent(activeClient!)}/reports`)).json(),
    enabled: !!activeClient,
    refetchOnWindowFocus: true,
  });
  const reportList = reports.data?.reports ?? [];
  const report = reportList.find((item) => item.id === selectedReport) ?? reportList[0];

  return (
    <main className="space-y-6" aria-labelledby="review-heading">
      <header className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <ShieldCheck className="h-4 w-4" /> Área do consultor
          </p>
          <h1 id="review-heading" className="text-3xl font-bold tracking-tight">Revisão profissional</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Avalie o relatório e as respostas do perfil antes de aprovar ou rejeitar uma recomendação.
          </p>
        </div>
        <Button variant="outline" onClick={() => { void access.refetch(); if (activeClient) void reports.refetch(); }}>
          <RefreshCw className="mr-2 h-4 w-4" /> Atualizar dados
        </Button>
      </header>

      {access.isLoading ? (
        <div className="space-y-4" aria-label="Carregando atribuições">
          <div className="h-20 animate-pulse rounded-lg bg-muted/60" />
          <div className="h-56 animate-pulse rounded-lg bg-muted/60" />
        </div>
      ) : access.isError ? (
        <Card><CardContent className="space-y-3 p-6" role="alert">
          <p className="font-medium text-destructive">Não foi possível carregar suas atribuições de revisão.</p>
          <Button variant="outline" onClick={() => void access.refetch()}>Tentar novamente</Button>
        </CardContent></Card>
      ) : assignments.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <div className="rounded-full bg-muted p-3"><UserRound className="h-5 w-5 text-muted-foreground" /></div>
            <h2 className="text-lg font-semibold">Nenhuma revisão atribuída</h2>
            <p className="max-w-md text-sm text-muted-foreground">Quando houver clientes explicitamente atribuídos a você, os relatórios disponíveis aparecerão aqui.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <section aria-labelledby="client-heading" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="client-heading" className="text-sm font-semibold">Clientes atribuídos</h2>
              <span className="text-xs text-muted-foreground">{assignments.length} {assignments.length === 1 ? "atribuição" : "atribuições"}</span>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Selecionar cliente atribuído">
              {assignments.map(({ clientId }) => (
                <Button
                  key={clientId}
                  type="button"
                  size="sm"
                  variant={clientId === activeClient ? "default" : "outline"}
                  aria-pressed={clientId === activeClient}
                  onClick={() => { setSelectedClient(clientId); setSelectedReport(""); }}
                >
                  <UserRound className="mr-2 h-4 w-4" /> {clientId}
                </Button>
              ))}
            </div>
          </section>

          {reports.isLoading ? (
            <div className="h-56 animate-pulse rounded-lg bg-muted/60" aria-label="Carregando relatórios" />
          ) : reports.isError ? (
            <Card><CardContent className="space-y-3 p-6" role="alert">
              <p className="text-sm text-destructive">Não foi possível carregar os relatórios deste cliente atribuído. O acesso pode ter sido revogado.</p>
              <Button variant="outline" onClick={() => void reports.refetch()}>Tentar novamente</Button>
            </CardContent></Card>
          ) : reportList.length === 0 ? (
            <Card className="border-dashed"><CardContent className="p-8 text-center text-sm text-muted-foreground">Este cliente não possui relatórios disponíveis para revisão.</CardContent></Card>
          ) : (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Selecionar relatório">
                {reportList.map((item) => (
                  <Button key={item.id} variant={item.id === report?.id ? "secondary" : "outline"} size="sm" onClick={() => setSelectedReport(item.id)} aria-pressed={item.id === report?.id}>
                    <FileCheck2 className="mr-2 h-4 w-4" /> {item.ticker || item.companyName || `Relatório ${item.id}`}
                  </Button>
                ))}
              </div>
              {report && <ReviewReportPanel key={`${activeClient}-${report.id}-${report.reportVersion}-${report.profileVersion}`} clientId={activeClient!} report={report} questionnaire={reports.data?.questionnaire ?? []} />}
            </>
          )}
        </>
      )}
    </main>
  );
}

function ReviewReportPanel({ clientId, report, questionnaire }: { clientId: string; report: ReviewReport; questionnaire: Question[] }) {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [reason, setReason] = useState("");
  const [recommendationText, setRecommendationText] = useState("");
  const queryKey = ["/api/investments/review-clients", clientId, "reports"];
  const saveReview = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        `/api/investments/review-clients/${encodeURIComponent(clientId)}/reports/${encodeURIComponent(report.id)}/reviews`,
        {
          reportVersion: report.reportVersion,
          profileVersion: report.profileVersion,
          decision,
          reason: reason.trim(),
          ...(decision === "approved" ? { recommendationText: recommendationText.trim() } : {}),
        },
      );
      return response.json() as Promise<Review>;
    },
    onSuccess: () => {
      setReason("");
      setRecommendationText("");
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  const canSubmit = reason.trim().length >= 10 && (decision === "rejected" || recommendationText.trim().length >= 20);
  const errorText = saveReview.error instanceof Error
    ? saveReview.error.message.includes("409")
      ? "A versão mudou ou há um bloqueio de análise, perfil ou risco. Atualize os dados e confira as pendências antes de registrar a decisão."
      : saveReview.error.message.includes("403")
        ? "Esta atribuição não autoriza mais esta revisão. Atualize a tela ou entre em contato com a administração."
        : "Não foi possível salvar a revisão. Nenhuma aprovação foi registrada; tente novamente."
    : "";

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
      <div className="space-y-5">
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{report.companyName || report.ticker || "Relatório de investimento"}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{report.ticker || "Ativo não informado"} · Documento {report.id}</p>
              </div>
              <Badge variant="outline">Versão {report.reportVersion}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-5">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <Info label="Data do relatório" value={displayDate(report.generatedAt)} />
              <Info label="Versão do perfil" value={report.profileVersion || "Não informada"} />
            </div>
            <RawReport report={report} />
          </CardContent>
        </Card>
        <ProfileCard profile={report.profile} questionnaire={questionnaire} />
      </div>
      <aside className="space-y-5">
        <Card className="border-primary/25">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-primary" /> Registrar decisão</CardTitle>
            <p className="text-sm text-muted-foreground">A decisão fica vinculada às versões exibidas acima.</p>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (canSubmit) saveReview.mutate(); }}>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Decisão</legend>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant={decision === "approved" ? "default" : "outline"} aria-pressed={decision === "approved"} onClick={() => setDecision("approved")}><Check className="mr-2 h-4 w-4" /> Aprovar</Button>
                  <Button type="button" variant={decision === "rejected" ? "destructive" : "outline"} aria-pressed={decision === "rejected"} onClick={() => setDecision("rejected")}><AlertTriangle className="mr-2 h-4 w-4" /> Rejeitar</Button>
                </div>
              </fieldset>
              <label htmlFor="review-reason" className="block text-sm font-medium">Justificativa profissional <span className="text-destructive">*</span></label>
              <Textarea id="review-reason" value={reason} onChange={(event) => setReason(event.target.value)} required minLength={10} maxLength={4000} rows={4} placeholder="Registre os fundamentos, riscos e adequação ao perfil." />
              {decision === "approved" && (
                <>
                  <label htmlFor="recommendation-text" className="block text-sm font-medium">Recomendação escrita pelo consultor <span className="text-destructive">*</span></label>
                  <Textarea id="recommendation-text" value={recommendationText} onChange={(event) => setRecommendationText(event.target.value)} required minLength={20} maxLength={8000} rows={5} placeholder="Escreva uma orientação concreta, específica e adequada a este cliente." />
                  <p className="text-xs text-muted-foreground">A aprovação só pode ser registrada com texto profissional concreto (mínimo de 20 caracteres).</p>
                </>
              )}
              {saveReview.isError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{errorText}</p>}
              {saveReview.isSuccess && <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">Decisão registrada. A lista foi atualizada com o histórico de auditoria.</p>}
              <Button type="submit" className="w-full" disabled={!canSubmit || saveReview.isPending}>
                {saveReview.isPending ? "Salvando decisão..." : decision === "approved" ? "Registrar aprovação" : "Registrar rejeição"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Clock3 className="h-5 w-5 text-primary" /> Histórico de auditoria</CardTitle></CardHeader>
          <CardContent>
            {(report.reviews ?? []).length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Ainda não há decisões registradas para este relatório.</p>
            ) : (
              <ol className="space-y-4">
                {[...report.reviews].sort((a, b) => new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime()).map((review) => (
                  <li key={review.id} className="border-l-2 border-primary/30 pl-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={review.decision === "approved" ? "default" : "destructive"}>{review.decision === "approved" ? "Aprovada" : "Rejeitada"}</Badge>
                      <span className="text-xs text-muted-foreground">{displayDate(review.reviewedAt)}</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Consultor {review.reviewerId} · versão {review.reportVersion}</p>
                    <p className="mt-2 text-sm leading-5">{review.reason}</p>
                    {review.recommendationText && <blockquote className="mt-2 border-l border-border pl-3 text-sm text-muted-foreground">{review.recommendationText}</blockquote>}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function RawReport({ report }: { report: ReviewReport }) {
  const omit = new Set(["id", "reportVersion", "profileVersion", "profile", "reviews", "ticker", "companyName", "generatedAt"]);
  const fields = Object.entries(report).filter(([key, value]) => !omit.has(key) && value !== null && value !== undefined);
  return (
    <section aria-labelledby="raw-report-heading">
      <h3 id="raw-report-heading" className="mb-3 text-sm font-semibold">Análise original do relatório</h3>
      <dl className="space-y-3">
        {fields.map(([key, value]) => (
          <div key={key} className="rounded-md bg-muted/35 p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{fieldLabel(key)}</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm leading-6">{formatValue(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ProfileCard({ profile, questionnaire }: { profile: Record<string, unknown> | null; questionnaire: Question[] }) {
  const entries = profile ? Object.entries(profile) : [];
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="text-lg">Questionário e perfil do investidor</CardTitle>
        <p className="text-sm text-muted-foreground">Respostas e datas disponíveis para contextualizar a decisão.</p>
      </CardHeader>
      <CardContent className="p-5">
        {profile && questionnaire.length > 0 && (
          <dl className="mb-4 space-y-3">
            {questionnaire.map(question => {
              const answer = (profile.respostas as Record<string, unknown> | undefined)?.[question.id];
              const label = typeof answer === "number" ? question.opcoes[answer] : undefined;
              return <div key={question.id}><dt className="text-sm font-medium">{question.pergunta}</dt><dd className="mt-1 text-sm text-muted-foreground">{label ?? "Resposta ausente ou inválida"}</dd></div>;
            })}
          </dl>
        )}
        {entries.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Não há respostas de perfil vinculadas a esta versão do relatório.</p>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2">
            {entries.map(([key, value]) => <div key={key} className="rounded-md bg-muted/35 p-3"><dt className="text-xs font-semibold text-muted-foreground">{fieldLabel(key)}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-5">{formatValue(value)}</dd></div>)}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-muted/35 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>;
}

function fieldLabel(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Não informado";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "object") {
    if (Array.isArray(value)) return value.map((item) => formatValue(item)).join(", ");
    return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${fieldLabel(key)}: ${formatValue(item)}`).join("\n");
  }
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(text)) return displayDate(text);
  return text;
}

function displayDate(value?: string) {
  if (!value) return "Não informada";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}