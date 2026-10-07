import * as React from "react";
import { useAuth } from "@clerk/react";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BookOpenCheck, Clock3, FlaskConical, Loader2, RotateCw, ShieldAlert } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type SimulationStudy = {
  id: string;
  ticker: string;
  mode: "simulation";
  status: "queued" | "running" | "completed";
  stage: string;
  createdAt: string;
  output: string | null;
  tokensUsed: 0;
  creditsDebited: 0;
  professionalReview: "not_applicable";
  recommendation: "blocked";
};

type SimulationOptions = {
  mode: "simulation";
  tickers: string[];
  tokensUsed: 0;
  creditsDebited: 0;
  realAnalysisEnabled: false;
};

const statusLabels: Record<SimulationStudy["status"], string> = {
  queued: "Na fila",
  running: "Em andamento",
  completed: "Estudo concluído",
};

export function InvestmentSimulationPanel(): React.ReactElement {
  const { userId, isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <p role="status">Confirmando sua sessão…</p>;
  if (!isSignedIn || !userId) return <p>Entre na sua conta para acessar a simulação.</p>;
  // Remount on account changes: no active ID, mutation retry or cached result crosses accounts.
  return <InvestmentSimulationBody key={userId} userId={userId} />;
}

export function InvestmentSimulationBody({ userId }: { userId: string }): React.ReactElement {
  const historyKey = ["/api/investments/simulations", userId];
  const get = async <T,>(path: string): Promise<T> => (await apiRequest("GET", path)).json();
  const cache = useQueryClient();
  const options = useQuery<SimulationOptions>({
    queryKey: ["/api/investments/simulation-options", userId],
    queryFn: () => get<SimulationOptions>("/api/investments/simulation-options"),
    retry: false,
  });
  const history = useQuery<{ studies: SimulationStudy[] }>({
    queryKey: historyKey,
    queryFn: () => get<{ studies: SimulationStudy[] }>("/api/investments/simulations"),
    enabled: options.data?.mode === "simulation",
    retry: false,
  });
  const [ticker, setTicker] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const request = useRef<{ requestKey: string; ticker: string } | null>(null);
  const completionRefresh = useRef<string | null>(null);

  useEffect(() => {
    if (!ticker && options.data?.tickers[0]) setTicker(options.data.tickers[0]);
  }, [options.data, ticker]);

  useEffect(() => {
    const pending = history.data?.studies.find(study => study.status === "queued" || study.status === "running");
    if (pending && !activeId) setActiveId(pending.id);
  }, [history.data, activeId]);

  const detail = useQuery<SimulationStudy>({
    queryKey: [`/api/investments/simulations/${activeId}`, userId],
    queryFn: () => get<SimulationStudy>(`/api/investments/simulations/${activeId}`),
    enabled: Boolean(activeId),
    retry: false,
    refetchInterval: query => {
      const status = query.state.data?.status;
      return !query.state.error && (status === "queued" || status === "running") ? 1000 : false;
    },
  });

  const submit = useMutation({
    mutationFn: async (resume?: SimulationStudy) => {
      if (resume) request.current = { requestKey: crypto.randomUUID(), ticker: resume.ticker };
      if (!request.current) request.current = { requestKey: crypto.randomUUID(), ticker };
      const response = await apiRequest("POST", "/api/investments/simulations", {
        ticker: request.current.ticker,
        requestKey: request.current.requestKey,
      });
      return await response.json() as SimulationStudy;
    },
    onSuccess: study => {
      setActiveId(study.id);
      request.current = null;
      cache.setQueryData([`/api/investments/simulations/${study.id}`, userId], study);
      void cache.invalidateQueries({ queryKey: historyKey });
    },
    onError: error => {
      // A definitive rejection did not accept this new request. Only ambiguous
      // network/server failures retain the same key for safe reconciliation.
      if (error instanceof Error && /^(400|401|403|404|409|429):/.test(error.message)) {
        request.current = null;
        void cache.invalidateQueries({ queryKey: historyKey });
      }
    },
  });

  const study = detail.data;
  useEffect(() => {
    if (study?.status === "completed" && completionRefresh.current !== study.id) {
      completionRefresh.current = study.id;
      void cache.invalidateQueries({ queryKey: historyKey });
    }
  }, [study?.id, study?.status, cache]);

  const pendingStudy = history.data?.studies.find(item => item.status === "queued" || item.status === "running");
  const busy = submit.isPending || Boolean(request.current) || Boolean(pendingStudy) || !history.isSuccess;
  const requestToRetry = request.current;

  return (
    <Card className="overflow-hidden border-[#d7dfd6] shadow-sm">
      <CardHeader className="border-b border-[#e5ebe4] bg-[#f5f8f3] pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#315b46]">
              <FlaskConical className="h-4 w-4" />
              Ambiente demonstrativo
            </div>
            <CardTitle className="flex items-center gap-2 text-xl">
              Estudo de investimento simulado
            </CardTitle>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Explore o fluxo com dados fictícios. Esta ferramenta não consulta provedores externos nem produz análise financeira real.
            </p>
          </div>
          <Badge className="w-fit shrink-0 border border-[#b96c37]/25 bg-[#fff1e4] px-3 py-1.5 text-[11px] font-bold tracking-[0.08em] text-[#8a4824] hover:bg-[#fff1e4]">
            SIMULAÇÃO — DADOS FICTÍCIOS
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Modo" value="Simulação" />
          <Metric label="Tokens de IA" value="0 utilizados" />
          <Metric label="Créditos reais" value="0 debitados" />
        </div>

        {options.isLoading ? (
          <div className="space-y-3" role="status" aria-label="Carregando configurações">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-11 animate-pulse rounded-md bg-muted/70" />
            <div className="h-10 w-48 animate-pulse rounded-md bg-muted/70" />
          </div>
        ) : options.isError ? (
          <div role="alert" className="flex flex-col gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p>Não foi possível carregar as opções do ambiente de simulação.</p>
            <Button variant="outline" onClick={() => options.refetch()}>Tentar novamente</Button>
          </div>
        ) : !options.data || options.data.mode !== "simulation" || options.data.realAnalysisEnabled ? (
          <div role="alert" className="rounded-lg border border-amber-300/70 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            A configuração recebida não confirma um ambiente exclusivamente simulado. Nenhuma solicitação está disponível.
          </div>
        ) : (
          <>
            <section className="space-y-3 rounded-lg border border-border/80 p-4 sm:p-5" aria-label="Nova simulação">
              <div>
                <h3 className="font-semibold">Iniciar uma demonstração</h3>
                <p className="mt-1 text-sm text-muted-foreground">O resultado ficará identificado como fictício e não poderá ser aprovado ou enviado.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="block flex-1 space-y-2 text-sm font-medium">
                  <span>Ativo demonstrativo</span>
                  <select
                    className="block h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={ticker}
                    onChange={event => setTicker(event.target.value)}
                    disabled={busy || options.data.tickers.length === 0}
                  >
                    {options.data.tickers.map(symbol => <option key={symbol} value={symbol}>{symbol}</option>)}
                  </select>
                </label>
                <Button
                  onClick={() => submit.mutate(undefined)}
                  disabled={!ticker || busy || options.data.tickers.length === 0}
                  className="sm:min-w-48"
                >
                  {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                  {submit.isPending ? "Enviando…" : history.isError ? "Histórico indisponível" : !history.isSuccess ? "Verificando histórico…" : pendingStudy ? "Estudo em andamento" : "Iniciar simulação"}
                </Button>
              </div>
              {!options.data.tickers.length && <p className="text-sm text-muted-foreground">Nenhum ativo de demonstração está disponível no momento.</p>}
              {submit.isError && (
                <div role="alert" className="space-y-2 rounded-md border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-950">
                  <p>{requestToRetry ? "A confirmação não foi recebida. A mesma solicitação pode ser retomada sem criar uma nova chave."
                    : "A solicitação foi recusada. Confira o histórico, aguarde o estudo atual ou tente mais tarde."}</p>
                  {requestToRetry && <Button
                    variant="outline"
                    size="sm"
                    disabled={submit.isPending || !requestToRetry}
                    onClick={() => submit.mutate(undefined)}
                  >
                    <RotateCw className="h-4 w-4" /> Confirmar a mesma solicitação
                  </Button>}
                </div>
              )}
            </section>

            {history.isLoading ? (
              <div className="space-y-3" role="status" aria-label="Carregando histórico">
                <div className="h-5 w-40 animate-pulse rounded bg-muted" />
                {[0, 1].map(item => <div key={item} className="h-16 animate-pulse rounded-lg bg-muted/60" />)}
              </div>
            ) : history.isError ? (
              <div role="alert" className="space-y-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm">
                <p>Não foi possível carregar o histórico de simulações.</p>
                <Button variant="outline" onClick={() => history.refetch()}>Recarregar histórico</Button>
              </div>
            ) : history.data?.studies.length ? (
              <section className="space-y-3" aria-label="Histórico de simulações">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-semibold">Histórico de demonstrações</h3>
                </div>
                <div className="space-y-2">
                  {history.data.studies.map(item => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => { setActiveId(item.id); submit.reset(); }}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${activeId === item.id ? "border-primary/40 bg-primary/[0.03]" : "border-border/80"}`}
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold">{item.ticker} <span className="font-normal text-muted-foreground">· {statusLabels[item.status]}</span></span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">{item.stage}</span>
                      </span>
                      <span className="shrink-0 text-right text-xs text-muted-foreground">{formatDate(item.createdAt)}<span className="mt-1 block text-primary">Abrir estudo</span></span>
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <div className="rounded-lg border border-dashed border-[#cfd9cf] bg-[#f8faf7] px-5 py-7 text-center">
                <BookOpenCheck className="mx-auto h-6 w-6 text-[#547761]" />
                <h3 className="mt-3 text-sm font-semibold">Nenhum estudo demonstrativo ainda</h3>
                <p className="mt-1 text-sm text-muted-foreground">Quando iniciar uma simulação, ela aparecerá aqui para consulta e retomada.</p>
              </div>
            )}

            {activeId && (
              <StudyResult
                study={study}
                loading={detail.isLoading}
                error={detail.isError}
                onRetry={() => detail.refetch()}
              />
            )}
          </>
        )}

        <p className="border-t border-border/70 pt-4 text-xs leading-5 text-muted-foreground">
          Conteúdo de demonstração: não é uma execução do Hermes, não é aconselhamento financeiro e não constitui recomendação aprovada. Revisão profissional não aplicável; recomendação bloqueada. Não é possível aprovar nem enviar este resultado.
        </p>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#e2e9e0] bg-[#fbfcfa] px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#315b46]">{value}</p>
    </div>
  );
}

function StudyResult({ study, loading, error, onRetry }: {
  study: SimulationStudy | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}): React.ReactElement | null {
  if (loading) {
    return <div className="space-y-3 rounded-lg border p-4" role="status"><div className="h-5 w-48 animate-pulse rounded bg-muted" /><div className="h-20 animate-pulse rounded bg-muted/60" /></div>;
  }
  if (error) {
    return (
      <div role="alert" className="space-y-3 rounded-lg border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-950">
        <p>O andamento está temporariamente indisponível. Isso não confirma falha da simulação.</p>
        <Button variant="outline" size="sm" onClick={onRetry}>Consultar novamente</Button>
      </div>
    );
  }
  if (!study) return null;

  const pending = study.status === "queued" || study.status === "running";
  return (
    <section className="space-y-4 rounded-lg border border-[#d5dfd5] bg-[#fbfcfa] p-4 sm:p-5" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#8a4824]">SIMULAÇÃO — DADOS FICTÍCIOS</p>
          <h3 className="mt-1 text-lg font-semibold">{study.ticker} · {statusLabels[study.status]}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{study.stage}</p>
        </div>
        <Badge variant="outline" className="border-[#cbd8cc] bg-white text-[#315b46]">Apenas demonstração</Badge>
      </div>

      {pending ? (
        <div className="flex items-start gap-3 rounded-md border border-[#e2e9e0] bg-white p-3 text-sm">
          {study.status === "running" ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[#315b46]" /> : <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#315b46]" />}
          <p>{study.status === "running" ? "A demonstração está em andamento. Você pode sair e retomá-la pelo histórico." : "A demonstração está aguardando processamento."}</p>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3 rounded-md border border-amber-300/70 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Estudo fictício, não é uma execução do Hermes nem uma recomendação aprovada. Sem aconselhamento financeiro; não pode ser aprovado ou enviado.</p>
          </div>
          {study.output ? (
            <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words rounded-md border border-[#e2e9e0] bg-white p-4 font-sans text-sm leading-6">{study.output}</pre>
          ) : (
            <div className="flex items-start gap-3 rounded-md border border-dashed border-[#d5dfd5] p-4 text-sm text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>O estudo foi concluído, mas não há conteúdo de demonstração disponível.</p>
            </div>
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">Tokens de IA: {study.tokensUsed} · Créditos debitados: {study.creditsDebited} · Revisão: não aplicável · Recomendação: bloqueada</p>
    </section>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}
