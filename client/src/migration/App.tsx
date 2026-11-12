import { lazy, Suspense, useEffect, useReducer, useState } from "react";
import { Link, Route, Switch, Redirect, useLocation, useSearch } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import InvestmentLayout from "@/components/investment-layout";
import Agents from "@/pages/ai-agents";
import Reports from "@/pages/investment-reports";
import Report from "@/pages/investment-report";
import Portfolio from "@/pages/investment-portfolio";
import PortfolioSimulation from "@/pages/portfolio-simulation";
import Suitability from "@/pages/suitability";
import B3Import from "./B3Import";
import PortfolioDiagnosis from "./PortfolioDiagnosis";
import B3Connection from "./B3Connection";
import ConsultationPackPreview from "./ConsultationPackPreview";
import InvestHome from "./InvestHome";
import InvestEquitySelection from "./InvestEquitySelection";
import InvestConsultationConfirmation from "./InvestConsultationConfirmation";
import { b3EquityPath, equityConfirmationPath, listedEquities } from "./b3-equity-selection";
import InvestCompanyWatch from "./InvestCompanyWatch";
import InvestAgentShowcase from "./InvestAgentShowcase";
import InvestReportPreview from "./InvestReportPreview";
import { InvestPreviewPortfolio, InvestPreviewProfile, InvestPreviewSettings, InvestReportLibrary } from "./InvestPreviewWorkspace";
import { archivedReportHref, localInvestPreview, readDemoProfile, readPreviewArchive, savePreviewArchive } from "./invest-preview-session";
import { investorProfiles } from "./invest-report-votes";
import { reportExampleFor } from "./invest-report-example";
import { internalEquityBudgetPath, previewCompanies, previewCompanyWatchPath, previewReportPath, previewResearchPhases, previewSpecialists, type PreviewCompany, type PreviewRun } from "./invest-research-preview";
import { MigrationAuthProvider, useAuth } from "./auth";
import { initialPreviewCreditWallet, previewCreditBalance, reducePreviewCreditWallet, type PreviewCreditEvent } from "./invest-preview-credits";

const finalPortal = window.location.hostname === "invest.techmoney.com.br";
const overviewPath = "/investments/inicio";
const EquityBudgetPage = lazy(() => import("./EquityBudget"));

function ConsultationRoute({ start, balance, onConfirm }: {
  start: (company: PreviewCompany) => void;
  balance: number;
  onConfirm: (event: PreviewCreditEvent) => void;
}) {
  const search = new URLSearchParams(useSearch());
  const ticker = search.get("ticker")?.toUpperCase() ?? "";
  const company = !finalPortal && search.get("demo") === "1"
    ? previewCompanies.find(item => item.ticker === ticker) : undefined;
  const asset = company ?? listedEquities.find(item => item.ticker === ticker);
  return asset ? <InvestConsultationConfirmation key={asset.ticker} company={asset} balance={balance} onConfirm={onConfirm}
    onStartDemo={company ? () => start(company) : undefined} />
    : <Redirect to={b3EquityPath} />;
}

function ManagementBudgetRoute({ legacy = false }: { legacy?: boolean }) {
  const rawSearch = useSearch();
  const search = new URLSearchParams(rawSearch);
  const ticker = search.get("ticker")?.toUpperCase() ?? "";
  const { canViewInternalCosts } = useAuth();
  if (legacy && !finalPortal && search.get("demo") === "1") return <Redirect to={`${equityConfirmationPath}?${rawSearch}`} />;
  if (!canViewInternalCosts) return <Redirect to={b3EquityPath} />;
  if (legacy) return <Redirect to={`${internalEquityBudgetPath}${rawSearch ? `?${rawSearch}` : ""}`} />;
  const validTicker = /^[A-Z0-9]{1,12}$/.test(ticker) ? ticker : "";
  return <Suspense fallback={<p role="status">Carregando área de gestão…</p>}>
    <EquityBudgetPage key={validTicker} initialTicker={validTicker} />
  </Suspense>;
}

function SignedPortal() {
  const { userId, customerPilot } = useAuth();
  return <Portal key={`${customerPilot}:${userId ?? "anonymous"}`} />;
}

function Portal() {
  const { isLoaded, isSignedIn, canViewInternalCosts, customerPilot } = useAuth();
  const previewWorkspace = localInvestPreview || customerPilot;
  const [pilotProfile, setPilotProfile] = useState<(typeof investorProfiles)[number]>();
  const [location, navigate] = useLocation();
  const [run, setRun] = useState<PreviewRun>();
  const [creditWallet, confirmCreditEvent] = useReducer(reducePreviewCreditWallet, initialPreviewCreditWallet);
  const [watchingCompany, setWatchingCompany] = useState(false);
  const balance = previewCreditBalance(creditWallet);
  const [archive, setArchive] = useState(() => customerPilot ? [] : readPreviewArchive());
  const archiveTicker = new URLSearchParams(useSearch()).get("empresa");
  const archived = archiveTicker ? archive.find(item => item.company.ticker === archiveTicker) : undefined;

  useEffect(() => {
    if (!run || run.phase === "ready") return;
    const index = previewResearchPhases.findIndex(phase => phase.id === run.phase);
    const currentPhase = previewResearchPhases[index];
    const nextPhase = previewResearchPhases[index + 1]?.id ?? "ready";
    const phaseTotal = {
      sources: Object.keys(reportExampleFor(run.company.ticker).sources).length,
      opinions: previewSpecialists.length,
      synthesis: 1,
    }[run.phase];
    const completed = run.completedInPhase + 1;
    const nextRun = completed < phaseTotal
      ? { ...run, completedInPhase: completed }
      : { ...run, phase: nextPhase, completedInPhase: 0 };
    const timer = window.setTimeout(() => setRun(current => current === run ? nextRun : current), currentPhase.intervalMs);
    return () => window.clearTimeout(timer);
  }, [run]);
  useEffect(() => {
    if (!previewWorkspace || run?.phase !== "ready") return;
    setArchive(items => [run, ...items.filter(item => item.company.ticker !== run.company.ticker)]);
  }, [run, previewWorkspace]);
  useEffect(() => { if (!customerPilot) savePreviewArchive(archive); }, [archive, customerPilot]);
  function startPreview(company: PreviewCompany) {
    if (finalPortal) return;
    setRun({ id: crypto.randomUUID(), company, phase: "sources", completedInPhase: 0 });
    navigate(previewReportPath);
  }
  const isOverview = location === overviewPath;
  const hideQuickLinks = previewWorkspace || isOverview || location === previewCompanyWatchPath || (!finalPortal && location === "/investments/agents") || location.includes("/portfolio/diagnosis") || location.endsWith("/portfolio/b3");
  if (!isLoaded) return <main className="p-8">Conferindo seu acesso…</main>;
  if (!isSignedIn && customerPilot) return <main className="mx-auto max-w-xl p-8">
    <h1 className="text-2xl font-bold">Entre no piloto do Invest</h1>
    <p className="my-4">Use o e-mail do convite para entrar na demonstração.</p>
    <a className="underline" href="/piloto/entrar">Entrar por e-mail</a>
  </main>;
  if (!isSignedIn) return <main className="mx-auto max-w-xl p-8">
    <h1 className="text-2xl font-bold">Entre com seu novo acesso</h1>
    <p className="my-4">Entre pelo link enviado ao seu e-mail autorizado. Seu histórico e vínculo exclusivo estão preservados.</p>
    <a className="underline" href="/migration/login">Receber link de acesso</a>
  </main>;

  if (!finalPortal && location === previewReportPath) {
    const selectedRun = previewWorkspace && archiveTicker ? archived : run;
    return <InvestReportPreview key={`${selectedRun?.id ?? "empty"}:${Boolean(archived)}`} run={selectedRun} archived={!!archived} previewWorkspace={previewWorkspace} customerPilot={customerPilot} demoProfile={customerPilot ? pilotProfile : readDemoProfile()} balance={balance} onConfirm={confirmCreditEvent}
      onReset={() => {
        if (archived) { navigate("/investments/reports"); return; }
        setRun(undefined);
        navigate(overviewPath);
      }} />;
  }

  return <InvestmentLayout showOverview={!finalPortal} localPreview={previewWorkspace} customerPilot={customerPilot}>
    <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm text-teal-950">
      <span><strong>{customerPilot ? "Piloto por convite" : finalPortal ? "Invest · acesso exclusivo" : "Prévia do Invest"}</strong> · Análises reais bloqueadas · Saldo demonstrativo</span>
      {!finalPortal && !customerPilot && <a href="https://invest.techmoney.com.br/investments/agents" className="underline">Abrir portal atual</a>}
    </div>
    {!hideQuickLinks && <nav aria-label="Ferramentas do Invest" className="mb-5 flex flex-wrap gap-3 text-sm font-medium">
      <Link className="rounded-lg border border-teal-300 bg-teal-50 px-4 py-2 text-teal-900" href={b3EquityPath}>Escolher ação da B3</Link>
      <a className="rounded-lg border bg-white px-4 py-2" href="/investments/portfolio/import-b3">Extratos da B3</a>
      <a className="rounded-lg border border-teal-300 bg-teal-50 px-4 py-2 text-teal-900" href="/investments/portfolio/diagnosis">Diagnóstico da carteira · sem créditos</a>
      <a className="rounded-lg border bg-white px-4 py-2" href="/investments/portfolio/b3">Conexão B3</a>
      {canViewInternalCosts && <Link className="rounded-lg border bg-white px-4 py-2" href={internalEquityBudgetPath}>Área de gestão</Link>}
    </nav>}
    <Switch>
      {!finalPortal && <Route path={overviewPath}>{() => <InvestHome hasRun={!!run} />}</Route>}
      <Route path={b3EquityPath} component={InvestEquitySelection} />
      <Route path={equityConfirmationPath}>{() => <ConsultationRoute start={startPreview}
        balance={balance} onConfirm={confirmCreditEvent} />}</Route>
      {!finalPortal && <Route path={previewCompanyWatchPath}>{() => <InvestCompanyWatch
        following={watchingCompany} setFollowing={setWatchingCompany} balance={balance} onConfirm={confirmCreditEvent} />}</Route>}
      <Route path="/investments/credits">{() => <ConsultationPackPreview customerPilot={customerPilot} wallet={creditWallet} onConfirm={confirmCreditEvent} />}</Route>
      <Route path={internalEquityBudgetPath}>{() => <ManagementBudgetRoute />}</Route>
      <Route path="/investments/agents/equity-budget">{() => <ManagementBudgetRoute legacy />}</Route>
      {!finalPortal && <Route path="/investments/agents/estudos">{() => previewWorkspace ? <InvestReportLibrary run={run} archive={archive} studies /> : <Agents />}</Route>}
      <Route path="/investments/agents/:ticker">{params => previewWorkspace
        ? <Redirect to={archive.some(item => item.company.ticker === params.ticker.toUpperCase()) ? archivedReportHref(params.ticker.toUpperCase()) : "/investments/reports"} />
        : <Report ticker={params.ticker} />}</Route>
      <Route path="/investments/agents" component={finalPortal ? Agents : InvestAgentShowcase} />
      <Route path="/investments/reports">{() => previewWorkspace ? <InvestReportLibrary run={run} archive={archive} /> : <Reports />}</Route>
      <Route path="/investments/portfolio/simulation">{() => previewWorkspace ? <InvestPreviewPortfolio key="simulation" view="simulation" /> : <PortfolioSimulation />}</Route>
      <Route path="/investments/portfolio/b3">{() => customerPilot ? <Redirect to="/investments/portfolio/import-b3" /> : <B3Connection />}</Route>
      <Route path="/investments/portfolio/diagnosis">{() => previewWorkspace ? <InvestPreviewPortfolio key="diagnosis" view="diagnosis" /> : <PortfolioDiagnosis />}</Route>
      <Route path="/investments/portfolio/import-b3">{() => <B3Import localPreview={previewWorkspace} sampleOnly={customerPilot} />}</Route>
      <Route path="/investments/portfolio">{() => previewWorkspace ? <InvestPreviewPortfolio key="overview" customerPilot={customerPilot} /> : <Portfolio />}</Route>
      <Route path="/investments/suitability">{() => previewWorkspace ? <InvestPreviewProfile pilot={customerPilot ? { profile: pilotProfile, onSelect: setPilotProfile } : undefined} /> : <Suitability />}</Route>
      {previewWorkspace && <Route path="/investments/settings" component={InvestPreviewSettings} />}
      <Route path="/investments/portfolio/pilot">{() => previewWorkspace ? <InvestPreviewPortfolio key="pilot" view="pilot" /> : <p>O piloto está preservado. A preparação e a execução real permanecem bloqueadas durante a migração.</p>}</Route>
      <Route path="/investments/:rest*"><p>Esta função ainda está em validação. Nenhuma operação real está disponível nesta prévia.</p></Route>
      <Route><Redirect to={finalPortal ? "/investments/agents" : overviewPath} /></Route>
    </Switch>
  </InvestmentLayout>;
}

export default function App() {
  return <QueryClientProvider client={queryClient}><LanguageProvider><TooltipProvider>
    <Toaster /><MigrationAuthProvider><SignedPortal /></MigrationAuthProvider>
  </TooltipProvider></LanguageProvider></QueryClientProvider>;
}
