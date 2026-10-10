import { useAuth } from "@clerk/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, Clock3, FlaskConical, RotateCw, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { PORTFOLIO_AGENTS, portfolioMetrics, portfolioScenario, type PortfolioDemoStudy } from "../../../shared/portfolio-simulation";

const SCENARIO_URL = "/api/investments/portfolio-simulation/scenario";
const HISTORY_URL = "/api/investments/portfolio-simulations";
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const isUuid = (value: string | null): value is string => Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
const darkPalette = "color-scheme:dark;--ps-page:#14231d;--ps-ink:#e2eee7;--ps-surface:#1b2c24;--ps-surface-raised:#20352b;--ps-subtle:#263b31;--ps-soft:#263b32;--ps-line:#354b3e;--ps-border:#486052;--ps-muted:#b5c7bb;--ps-muted-2:#a0b5a7;--ps-muted-3:#8ea797;--ps-green:#a5d8b8;--ps-green-bright:#a4d8b6;--ps-green-deep:#397d5c;--ps-green-soft:#294638;--ps-green-pale:#294638;--ps-green-wash:#263d30;--ps-amber:#e5cc8e;--ps-amber-soft:#3d3524;--ps-amber-tint:#403823;--ps-error:#f0b39f;--ps-error-soft:#402c27;--ps-error-border:#805949;--ps-rule:#62836d;--ps-rule-light:#496b54;--ps-skeleton:#304239;--ps-card:#20342a;--ps-card-translucent:rgba(32,52,42,.82)";
const themeStyles = `
.portfolio-simulation{color-scheme:light;--ps-page:#edf3ef;--ps-ink:#203b32;--ps-surface:#fbfcf8;--ps-surface-raised:#f9fbf7;--ps-subtle:#f1f6f2;--ps-soft:#e5eee8;--ps-line:#e0e9e2;--ps-border:#cbd9d0;--ps-muted:#587066;--ps-muted-2:#71877b;--ps-muted-3:#84978d;--ps-green:#28684f;--ps-green-bright:#39745d;--ps-green-deep:#216b51;--ps-green-soft:#e2eee7;--ps-green-pale:#dff0e6;--ps-green-wash:#e3f0e7;--ps-amber:#77591e;--ps-amber-soft:#fff7e7;--ps-amber-tint:#f6edd7;--ps-error:#824833;--ps-error-soft:#fff3ee;--ps-error-border:#e2b6a8;--ps-rule:#aac8b5;--ps-rule-light:#bfd5c5;--ps-skeleton:#e3ebe5;--ps-card:#fff;--ps-card-translucent:rgba(255,255,255,.7)}
.dark .portfolio-simulation{${darkPalette}}
@media(prefers-color-scheme:dark){:root:not(.light) .portfolio-simulation{${darkPalette}}}
.portfolio-simulation{background-color:var(--ps-page)!important;color:var(--ps-ink)!important}
.portfolio-simulation [class~="text-card-foreground"]{color:var(--ps-ink)!important}
.portfolio-simulation [class~="bg-[#edf3ef]"]{background-color:var(--ps-page)!important}.portfolio-simulation [class~="text-[#203b32]"]{color:var(--ps-ink)!important}
.portfolio-simulation [class~="bg-[#fbfcf8]"],.portfolio-simulation [class~="bg-[#f9fbf7]"],.portfolio-simulation [class~="bg-white"]{background-color:var(--ps-surface)!important}
.portfolio-simulation [class~="bg-[#f1f6f2]"],.portfolio-simulation [class~="bg-[#f1f7f2]"],.portfolio-simulation [class~="bg-[#f7faf6]"]{background-color:var(--ps-subtle)!important}
.portfolio-simulation [class~="bg-[#e5eee8]"]{background-color:var(--ps-soft)!important}.portfolio-simulation [class~="bg-[#e2eee7]"]{background-color:var(--ps-green-soft)!important}.portfolio-simulation [class~="bg-[#dff0e6]"]{background-color:var(--ps-green-pale)!important}.portfolio-simulation [class~="bg-[#e3f0e7]"]{background-color:var(--ps-green-wash)!important}
.portfolio-simulation [class~="bg-[#fff7e7]"]{background-color:var(--ps-amber-soft)!important}.portfolio-simulation [class~="bg-[#f6edd7]"]{background-color:var(--ps-amber-tint)!important}.portfolio-simulation [class~="bg-[#fff3ee]"],.portfolio-simulation [class~="bg-[#fff8ed]"]{background-color:var(--ps-error-soft)!important}
.portfolio-simulation [class~="bg-[#d9e3dc]"]{background-color:var(--ps-line)!important}.portfolio-simulation [class~="bg-[#dce7df]"],.portfolio-simulation [class~="bg-[#e6eee8]"],.portfolio-simulation [class~="bg-[#e3ebe5]"],.portfolio-simulation [class~="bg-[#e8efea]"]{background-color:var(--ps-skeleton)!important}.portfolio-simulation [class~="bg-white/70"]{background-color:var(--ps-card-translucent)!important}
.portfolio-simulation [class~="text-[#477363]"],.portfolio-simulation [class~="text-[#173f31]"]{color:var(--ps-green)!important}.portfolio-simulation [class~="text-[#28684f]"]{color:var(--ps-green)!important}.portfolio-simulation [class~="text-[#39745d]"]{color:var(--ps-green-bright)!important}.portfolio-simulation [class~="text-[#216b51]"]{color:var(--ps-green-deep)!important}
.portfolio-simulation [class~="text-[#77591e]"]{color:var(--ps-amber)!important}.portfolio-simulation [class~="text-[#824833]"],.portfolio-simulation [class~="text-[#795c36]"]{color:var(--ps-error)!important}
.portfolio-simulation [class~="text-[#587066]"],.portfolio-simulation [class~="text-[#647b70]"],.portfolio-simulation [class~="text-[#6a8176]"],.portfolio-simulation [class~="text-[#6b8177]"],.portfolio-simulation [class~="text-[#688075]"],.portfolio-simulation [class~="text-[#6c8176]"],.portfolio-simulation [class~="text-[#71877b]"],.portfolio-simulation [class~="text-[#789084]"],.portfolio-simulation [class~="text-[#527163]"],.portfolio-simulation [class~="text-[#425f51]"],.portfolio-simulation [class~="text-[#345847]"],.portfolio-simulation [class~="text-[#557362]"]{color:var(--ps-muted)!important}
.portfolio-simulation [class~="text-[#799185]"],.portfolio-simulation [class~="text-[#84978d]"],.portfolio-simulation [class~="text-[#809388]"],.portfolio-simulation [class~="text-[#81958a]"]{color:var(--ps-muted-3)!important}
.portfolio-simulation [class~="border-[#cbd9d0]"],.portfolio-simulation [class~="border-[#d8e5dc]"],.portfolio-simulation [class~="border-[#c6d8ce]"]{border-color:var(--ps-border)!important}
.portfolio-simulation [class~="border-[#e0e9e2]"],.portfolio-simulation [class~="border-[#e6ede7]"],.portfolio-simulation [class~="border-[#d9e3dc]"],.portfolio-simulation [class~="border-[#d4e0d7]"]{border-color:var(--ps-line)!important}
.portfolio-simulation [class~="border-[#a8c8b3]"],.portfolio-simulation [class~="border-[#7ea88d]"]{border-color:var(--ps-rule)!important}.portfolio-simulation [class~="border-[#aac8b5]"]{border-color:var(--ps-rule)!important}.portfolio-simulation [class~="border-[#e2b6a8]"],.portfolio-simulation [class~="border-[#e3c5a3]"]{border-color:var(--ps-error-border)!important}
.portfolio-simulation [class~="divide-[#e0e9e2]"]>*+*{border-color:var(--ps-line)!important}
.portfolio-simulation [class~="hover:bg-[#f1f6f2]"]:hover{background-color:var(--ps-subtle)!important}.portfolio-simulation [class~="hover:bg-[#e4efe7]"]:hover{background-color:var(--ps-green-soft)!important}
.dark .portfolio-simulation [class~="bg-[#216b51]"]{background-color:var(--ps-green-deep)!important}.dark .portfolio-simulation [class~="hover:bg-[#174f3d]"]:hover{background-color:#2c6549!important}
@media(prefers-reduced-motion:reduce){.portfolio-simulation .animate-pulse,.portfolio-simulation .animate-spin{animation:none!important}.portfolio-simulation [class*="transition-"]{transition:none!important}}
`;
type ScenarioPayload = {
  scenario: ReturnType<typeof portfolioScenario>;
  metrics: ReturnType<typeof portfolioMetrics>;
  agents: typeof PORTFOLIO_AGENTS;
  mode: "simulation";
  tokensUsed: 0;
  creditsDebited: 0;
};
type HistoryPayload = { studies: PortfolioDemoStudy[] };
const getJson = async <T,>(url: string): Promise<T> => (await apiRequest("GET", url)).json() as Promise<T>;
const statusText: Record<string, string> = { queued: "Na fila", running: "Em andamento", completed: "Concluído" };

export default function PortfolioSimulation() {
  const { userId, isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <main className="portfolio-simulation min-h-[100dvh] bg-[#edf3ef] p-6"><style>{themeStyles}</style><div className="mx-auto max-w-5xl animate-pulse space-y-4"><div className="h-8 w-56 rounded bg-[#dce7df]" /><div className="h-48 rounded-2xl bg-[#dce7df]" /></div></main>;
  if (!isSignedIn || !userId) return <main className="portfolio-simulation grid min-h-[100dvh] place-items-center bg-[#edf3ef] p-6"><style>{themeStyles}</style><Card className="max-w-lg border-[#cbd9d0] bg-[#fbfcf8]"><CardContent className="p-8"><ShieldCheck className="mb-4 h-8 w-8 text-[#28735c]" /><h1 className="text-xl font-semibold text-[#203b32]">Entre para acessar a demonstração</h1><p className="mt-2 text-sm leading-6 text-[#587066]">O histórico demonstrativo é privado à sua conta.</p></CardContent></Card></main>;
  return <SimulationBody key={userId} userId={userId} />;
}

function SimulationBody({ userId }: { userId: string }) {
  const cache = useQueryClient();
  const requestKey = useRef<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(() => {
    const requested = new URLSearchParams(window.location.search).get("study");
    return isUuid(requested) ? requested : null;
  });
  const scenario = useQuery<ScenarioPayload>({
    queryKey: ["portfolio-simulation-scenario", userId],
    queryFn: () => getJson<ScenarioPayload>(SCENARIO_URL),
    retry: false,
  });
  const historyKey = useMemo(() => ["portfolio-simulations-history", userId], [userId]);
  const history = useQuery<HistoryPayload>({
    queryKey: historyKey,
    queryFn: () => getJson<HistoryPayload>(HISTORY_URL),
    retry: false,
  });
  const selectedStudyKey = ["portfolio-simulation-study", userId, activeId];
  const detail = useQuery<PortfolioDemoStudy>({
    queryKey: selectedStudyKey,
    queryFn: () => getJson<PortfolioDemoStudy>(`${HISTORY_URL}/${activeId}`),
    enabled: Boolean(activeId),
    retry: false,
    refetchInterval: query => {
      const status = query.state.data?.status;
      return !query.state.error && (status === "queued" || status === "running") ? 1200 : false;
    },
  });
  const createStudy = useMutation({
    mutationFn: async () => {
      if (!requestKey.current) requestKey.current = crypto.randomUUID();
      const response = await apiRequest("POST", HISTORY_URL, { requestKey: requestKey.current });
      return response.json() as Promise<PortfolioDemoStudy>;
    },
    onSuccess: study => {
      requestKey.current = null;
      setActiveId(study.id);
      syncStudyUrl(study.id);
      cache.setQueryData(["portfolio-simulation-study", userId, study.id], study);
      void cache.invalidateQueries({ queryKey: historyKey });
    },
  });
  const refreshedCompletions = useRef(new Set<string>());

  useEffect(() => {
    if (activeId || !history.data?.studies.length) return;
    const first = history.data.studies[0];
    setActiveId(first.id);
    syncStudyUrl(first.id);
  }, [activeId, history.data]);

  const activeStudy = detail.isSuccess ? detail.data : undefined;
  useEffect(() => {
    if (!activeStudy || activeStudy.status !== "completed") return;
    const completionKey = `${activeStudy.id}:completed`;
    if (refreshedCompletions.current.has(completionKey)) return;
    refreshedCompletions.current.add(completionKey);
    void cache.invalidateQueries({ queryKey: historyKey });
  }, [activeStudy?.id, activeStudy?.status, cache, historyKey]);
  const selectedScenario = scenario.data;
  const hasPendingStudy = Boolean(history.data?.studies.some(study => study.status === "queued" || study.status === "running"));
  const canStart = scenario.isSuccess && history.isSuccess && !hasPendingStudy && activeStudy?.status !== "queued" && activeStudy?.status !== "running" && !createStudy.isPending;

  return (
    <main className="portfolio-simulation min-h-[100dvh] bg-[#edf3ef] text-[#203b32]">
      <style>{themeStyles}</style>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-7 sm:py-10">
        <Link href="/investments/portfolio" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[#477363] transition-colors hover:text-[#173f31]">
          <ArrowLeft className="h-4 w-4" /> Voltar à carteira
        </Link>

        <header className="relative overflow-hidden rounded-[1.7rem] border border-[#cbd9d0] bg-[#f9fbf7] p-6 shadow-[0_20px_55px_rgba(38,73,57,.08)] sm:p-10">
          <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full border-[1px] border-[#d8e5dc]" />
          <div className="pointer-events-none absolute right-8 top-8 hidden h-44 w-44 rounded-full border border-dashed border-[#c6d8ce] sm:block" />
          <div className="relative max-w-3xl">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#e2eee7] px-3 py-1.5 text-xs font-bold uppercase tracking-[.13em] text-[#28684f]"><FlaskConical className="h-3.5 w-3.5" /> Ambiente demonstrativo</span>
              <Badge variant="outline" className="border-[#d7b77a] bg-[#fff7e7] text-[#77591e]">SIMULAÇÃO · DADOS FICTÍCIOS</Badge>
            </div>
            <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[.2em] text-[#799185]">TECH MONEY INVESTIMENTOS / LAB 01</p>
            <h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-[-.04em] sm:text-5xl">Uma carteira inventada.<br /><span className="font-serif font-normal italic text-[#39745d]">Limites bem reais.</span></h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-[#587066] sm:text-base">{selectedScenario?.scenario.disclaimer ?? "Uma demonstração local de organização de proporções, sem acesso a ativos ou dados reais."}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button onClick={() => createStudy.mutate()} disabled={!canStart} className="h-11 rounded-xl bg-[#216b51] px-5 text-white hover:bg-[#174f3d]">
                {createStudy.isPending ? <RotateCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {createStudy.isPending ? "Preparando exemplo…" : "Iniciar demonstração"}
              </Button>
              <span className="text-xs leading-5 text-[#6b8177]">Só começa após esta ação. Não é análise de carteira real.</span>
            </div>
            {createStudy.isError && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-[#e2b6a8] bg-[#fff3ee] p-3 text-sm text-[#824833]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Não foi possível criar a demonstração. Tente novamente.</div>}
          </div>
          <div className="relative mt-8 grid grid-cols-3 overflow-hidden rounded-xl border border-[#d9e3dc] bg-white/70 sm:absolute sm:bottom-8 sm:right-9 sm:mt-0 sm:w-[285px]">
            <MiniMetric label="Modo" value="Simulação" />
            <MiniMetric label="Tokens" value={`${selectedScenario?.tokensUsed ?? 0}`} />
            <MiniMetric label="Créditos" value={`${selectedScenario?.creditsDebited ?? 0}`} />
          </div>
        </header>

        <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0 space-y-6">
            <Card className="overflow-hidden rounded-2xl border-[#cbd9d0] bg-[#fbfcf8] shadow-sm">
              <CardHeader className="border-b border-[#e0e9e2] px-5 py-5 sm:px-7">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#84978d]">01 / COMPOSIÇÃO DO EXEMPLO</p><CardTitle className="mt-2 text-xl tracking-tight">Valores fictícios, sem mercado</CardTitle></div>
                  {selectedScenario && <span className="font-mono text-xs text-[#6a8176]">Total · {money.format(selectedScenario.metrics.totalValue)}</span>}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {scenario.isLoading ? <SkeletonRows /> : scenario.isError || !selectedScenario ? <InlineError text="Não foi possível carregar o cenário demonstrativo." onRetry={() => scenario.refetch()} /> : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-left text-sm">
                        <thead className="bg-[#f1f6f2] text-[11px] uppercase tracking-[.1em] text-[#71877b]"><tr><th className="px-5 py-3 font-semibold sm:px-7">Posição fictícia</th><th className="px-4 py-3 font-semibold">Classe</th><th className="px-4 py-3 text-right font-semibold">Valor</th><th className="px-5 py-3 text-right font-semibold sm:px-7">Peso nominal</th></tr></thead>
                        <tbody>{selectedScenario.metrics.holdings.map(item => <tr key={item.id} className="border-t border-[#e6ede7]"><td className="px-5 py-4 font-medium sm:px-7">{item.name}</td><td className="px-4 py-4 text-[#647b70]">{item.assetClass}</td><td className="px-4 py-4 text-right font-mono tabular-nums">{money.format(item.value)}</td><td className="px-5 py-4 text-right font-mono tabular-nums sm:px-7">{percent.format(item.weightPercent)}%</td></tr>)}</tbody>
                      </table>
                    </div>
                    <div className="grid divide-y divide-[#e0e9e2] border-t border-[#e0e9e2] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                      {selectedScenario.metrics.byClass.map(group => <div key={group.assetClass} className="flex items-center justify-between gap-3 px-5 py-4 sm:block sm:px-7"><p className="text-xs font-semibold uppercase tracking-[.1em] text-[#71877b]">{group.assetClass}</p><p className="font-mono text-lg font-semibold tabular-nums">{percent.format(group.weightPercent)}%</p></div>)}
                    </div>
                    <div className="grid gap-3 border-t border-[#e0e9e2] p-5 sm:grid-cols-2 sm:px-7">
                      <div className="rounded-lg bg-[#f2f6f2] p-3"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-[#71877b]">Maior posição fictícia</p><p className="mt-1 text-sm font-semibold">{selectedScenario.metrics.largestHolding.name}</p><p className="font-mono text-xs text-[#527163]">{percent.format(selectedScenario.metrics.largestHolding.weightPercent)}%</p></div>
                      <div className="rounded-lg bg-[#f2f6f2] p-3"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-[#71877b]">Duas maiores posições</p><p className="mt-1 font-mono text-lg font-semibold">{percent.format(selectedScenario.metrics.topTwoPercent)}%</p></div>
                    </div>
                    <p className="border-t border-[#e0e9e2] px-5 py-4 text-sm leading-6 text-[#526d60] sm:px-7"><span className="mr-2 text-[10px] font-bold uppercase tracking-[.1em] text-[#81958a]">Perfil fictício</span>{selectedScenario.scenario.profile}</p>
                    <p className="border-t border-[#e0e9e2] bg-[#f7faf6] px-5 py-4 text-xs leading-5 text-[#6c8176] sm:px-7">{selectedScenario.metrics.methodology}</p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-[#cbd9d0] bg-[#fbfcf8] shadow-sm">
              <CardHeader className="px-5 pb-2 pt-5 sm:px-7"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#84978d]">02 / RODADA SIMULADA</p><CardTitle className="mt-2 text-xl tracking-tight">Seis perspectivas, sem execução de IA</CardTitle><p className="text-sm leading-6 text-[#688075]">{activeStudy?.progressMethod ?? "O andamento, quando iniciado, é ilustrativo por tempo; não representa processamento de IA."}</p></CardHeader>
              <CardContent className="space-y-3 px-5 pb-6 pt-3 sm:px-7">
                {(activeStudy?.agents ?? selectedScenario?.agents ?? PORTFOLIO_AGENTS).map((agent, index) => {
                  const state = activeStudy?.agents[index]?.status ?? "waiting";
                  return <div key={agent.id} className="flex items-start gap-3 rounded-xl border border-[#e0e9e2] bg-white p-3.5">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold ${state === "completed" ? "bg-[#dff0e6] text-[#28684f]" : state === "running" ? "bg-[#f6edd7] text-[#80632c]" : "bg-[#edf2ee] text-[#789084]"}`}>{state === "completed" ? <Check className="h-4 w-4" /> : agent.initials}</span>
                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{agent.name} <span className="font-normal text-[#6b8177]">· {agent.role}</span></p><span className="text-[10px] font-bold uppercase tracking-[.1em] text-[#789084]">{state === "completed" ? "Etapa ilustrativa" : state === "running" ? "Em andamento" : "Aguardando"}</span></div><p className="mt-1 text-xs leading-5 text-[#6b8177]">{agent.description}</p>{activeStudy?.agents[index]?.output && <p className="mt-2 border-l-2 border-[#aac8b5] pl-3 text-sm leading-6 text-[#425f51]">{activeStudy.agents[index].output}</p>}</div>
                  </div>;
                })}
              </CardContent>
            </Card>
            {activeStudy?.status === "completed" && activeStudy.synthesis && <section className="overflow-hidden rounded-2xl border border-[#a8c8b3] bg-[#e3f0e7] p-5 sm:p-7"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.13em] text-[#28684f]"><Sparkles className="h-4 w-4" /> Síntese ilustrativa · Denise</div><p className="mt-4 text-sm leading-7 text-[#345847]">{activeStudy.synthesis}</p><p className="mt-4 border-t border-[#bfd5c5] pt-3 text-xs leading-5 text-[#557362]">Não é recomendação, aprovação ou aconselhamento financeiro.</p></section>}
          </section>

          <aside className="min-w-0 space-y-5">
            <Card className="rounded-2xl border-[#cbd9d0] bg-[#fbfcf8] shadow-sm">
              <CardHeader className="px-5 pb-2 pt-5"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#84978d]">ARQUIVO PRIVADO</p><CardTitle className="mt-2 text-lg">Suas demonstrações</CardTitle></CardHeader>
              <CardContent className="space-y-2 px-5 pb-5">
                {history.isLoading ? <div className="space-y-2" role="status"><div className="h-14 animate-pulse rounded-lg bg-[#e6eee8]" /><div className="h-14 animate-pulse rounded-lg bg-[#e6eee8]" /></div> : history.isError ? <InlineError text="O histórico não está disponível." onRetry={() => history.refetch()} /> : history.data?.studies.length ? history.data.studies.map(study => <button key={study.id} type="button" onClick={() => { setActiveId(study.id); syncStudyUrl(study.id); }} className={`w-full rounded-xl border p-3 text-left transition-colors hover:bg-[#f1f6f2] ${activeId === study.id ? "border-[#7ea88d] bg-[#f1f7f2]" : "border-[#e0e9e2] bg-white"}`}><span className="flex items-center justify-between gap-2"><span className="font-semibold text-sm">Carteira fictícia</span><Badge variant="outline" className="border-[#d7b77a] bg-[#fff7e7] text-[9px] text-[#77591e]">SIMULAÇÃO</Badge></span><span className="mt-1 flex items-center justify-between text-xs text-[#6b8177]"><span>{formatDate(study.createdAt)}</span><span>{statusText[study.status]}</span></span></button>) : <div className="rounded-xl border border-dashed border-[#cbd9d0] bg-[#f7faf6] px-4 py-6 text-center"><Clock3 className="mx-auto h-5 w-5 text-[#729080]" /><p className="mt-2 text-sm font-semibold">Nenhuma demonstração ainda</p><p className="mt-1 text-xs leading-5 text-[#71877b]">Seu histórico aparecerá aqui depois que você iniciar o exemplo.</p></div>}
              </CardContent>
            </Card>
            {activeId && (detail.isLoading ? <div className="space-y-3 rounded-2xl border border-[#cbd9d0] bg-[#fbfcf8] p-5" role="status"><div className="h-4 w-32 animate-pulse rounded bg-[#dce7df]" /><div className="h-14 animate-pulse rounded bg-[#e8efea]" /><div className="h-14 animate-pulse rounded bg-[#e8efea]" /></div> : detail.isError ? <div role="alert" className="rounded-2xl border border-[#e3c5a3] bg-[#fff8ed] p-5"><p className="text-sm leading-6 text-[#795c36]">Não foi possível abrir esta demonstração agora.</p><Button variant="outline" size="sm" className="mt-3" onClick={() => detail.refetch()}><RotateCw className="h-3.5 w-3.5" /> Tentar novamente</Button></div> : null)}
          </aside>
        </div>
        <footer className="mt-8 rounded-xl border border-[#d4e0d7] bg-[#e5eee8] px-5 py-4 text-xs leading-6 text-[#5d7569]"><ShieldCheck className="mr-2 inline h-4 w-4 align-[-3px]" />Agentes de IA fictícios. Progresso ilustrativo. Não há recomendação ou aprovação; nenhuma posição real, perfil de suitability, cotação, preço ou provedor externo é consultado. Tokens: {selectedScenario?.tokensUsed ?? 0} · Créditos debitados: {selectedScenario?.creditsDebited ?? 0}.</footer>
      </div>
    </main>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="px-2 py-3 text-center"><p className="text-[9px] font-bold uppercase tracking-[.12em] text-[#809388]">{label}</p><p className="mt-1 font-mono text-xs font-semibold text-[#315b46]">{value}</p></div>;
}
function SkeletonRows() { return <div role="status" className="space-y-3 p-6"><div className="h-5 w-44 animate-pulse rounded bg-[#e3ebe5]" />{[1, 2, 3, 4].map(row => <div key={row} className="h-11 animate-pulse rounded bg-[#edf2ee]" />)}</div>; }
function InlineError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return <div role="alert" className="flex flex-col items-start gap-3 p-4 text-sm text-[#80543d]"><p>{text}</p><Button variant="outline" size="sm" onClick={onRetry}><RotateCw className="h-3.5 w-3.5" /> Tentar novamente</Button></div>;
}
function syncStudyUrl(id: string) { const url = new URL(window.location.href); url.searchParams.set("study", id); window.history.replaceState({}, "", url); }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Data indisponível" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date); }
