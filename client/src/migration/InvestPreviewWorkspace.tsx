import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, BookOpen, BrainCircuit, BriefcaseBusiness, ChartNoAxesCombined, Settings, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { formatBRL } from "@/lib/investment-api";
import { PORTFOLIO_DEMO_VERSION, portfolioMetrics, presentPortfolioStudy } from "@shared/portfolio-simulation";
import { archivedReportHref, demoProfileKey, readDemoProfile, readReportTheme, reportThemeKey, writePreference } from "./invest-preview-session";
import { previewCompanies, previewCompanyWatchPath, previewReportPath, type PreviewRun } from "./invest-research-preview";
import { equityConfirmationPath } from "./b3-equity-selection";
import { investorProfiles } from "./invest-report-votes";

const surface = "rounded-2xl border border-border bg-card p-4 text-card-foreground sm:p-5";
const action = "inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700";
const primary = `${action} bg-[#245e46] text-white hover:bg-[#194b36]`;
const secondary = `${action} border border-border bg-background hover:bg-muted`;

function PageHeader({ title, description, icon: Icon, children }: {
  title: string; description: string; icon: typeof BookOpen; children?: ReactNode;
}) {
  return <header className="rounded-2xl border border-[#285345] bg-[#12372c] p-5 text-white sm:p-7">
    <div className="mb-3 inline-flex rounded-lg bg-white/10 p-2"><Icon aria-hidden="true" className="h-5 w-5 text-[#c7eddb]" /></div>
    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#d9eee4]">{description}</p>
    {children && <div className="mt-4 flex flex-wrap gap-2">{children}</div>}
  </header>;
}

export function InvestReportLibrary({ run, archive, studies = false }: {
  run?: PreviewRun; archive: PreviewRun[]; studies?: boolean;
}) {
  return <div className="mx-auto max-w-5xl space-y-4">
    <PageHeader title={studies ? "Estudos e simulações" : "Relatórios de investimentos"} icon={BookOpen}
      description="Consulte os relatórios fictícios concluídos neste navegador ou inicie um estudo para acompanhar o trabalho do comitê.">
      {run && run.phase !== "ready" && <Link href={previewReportPath} className={`${action} bg-white text-[#12372c]`}>Acompanhar pesquisa de {run.company.ticker} <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>}
    </PageHeader>
    <section aria-labelledby="library-title" className={surface}>
      <h2 id="library-title" className="text-xl font-bold">Estudos de empresa</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {previewCompanies.map(company => {
          const finished = archive.some(item => item.company.ticker === company.ticker);
          return <li key={company.ticker} className="flex min-w-0 flex-col rounded-xl border border-border bg-background p-4">
            <p className="text-xs font-semibold text-muted-foreground">{company.ticker} · {finished ? "Concluído" : "Disponível para simular"}</p>
            <h3 className="mt-1 text-base font-bold">{company.name}</h3>
            <p className="mb-3 mt-1 text-sm text-muted-foreground">{finished ? `Relatório de exemplo de ${company.reportDate} · revisão pendente.` : "Nove pareceres, duas rodadas e síntese do Rafael."}</p>
            <Link href={finished ? archivedReportHref(company.ticker) : `${equityConfirmationPath}?ticker=${company.ticker}&demo=1`} className={`${primary} mt-auto self-start`}>
              {finished ? "Abrir relatório" : "Conferir orçamento"} <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </li>;
        })}
      </ul>
    </section>
    <section className={surface}>
      <h2 className="text-lg font-bold">Comitê de Carteira Completa</h2>
      <p className="mt-1 text-sm text-muted-foreground">Compare seis leituras sobre uma carteira de exemplo, da alocação à síntese da Denise.</p>
      <Link href="/investments/portfolio/simulation" className={`${secondary} mt-3`}>Simular estudo da carteira</Link>
    </section>
  </div>;
}

export function InvestPreviewProfile({ pilot }: {
  pilot?: { profile?: (typeof investorProfiles)[number]; onSelect: (value: (typeof investorProfiles)[number]) => void };
}) {
  const [localProfile, setLocalProfile] = useState(() => pilot ? undefined : readDemoProfile());
  const profile = pilot ? pilot.profile : localProfile;

  function chooseProfile(value: (typeof investorProfiles)[number]) {
    if (pilot) { pilot.onSelect(value); return; }
    setLocalProfile(value);
    writePreference(demoProfileKey, value);
  }
  const descriptions = {
    Conservador: "Prioriza estabilidade e liquidez. Na leitura do estudo, confira primeiro as perdas possíveis e a concentração de receita.",
    Moderado: "Equilibra estabilidade e retorno. Na leitura do estudo, confira a qualidade das premissas e a consistência dos resultados.",
    Arrojado: "Admite oscilações maiores. Na leitura do estudo, confira como a hipótese reage a um cenário adverso.",
  };
  return <div className="mx-auto max-w-5xl space-y-4">
    <PageHeader title="Perfil do investidor" icon={ShieldCheck}
      description={`Escolha um perfil fictício para destacar sua leitura nos relatórios de exemplo. A escolha fica ${pilot ? "na sessão de teste" : "neste navegador"}.`} />
    <div role="group" aria-label="Perfil de exemplo" className="grid gap-3 lg:grid-cols-3">
      {investorProfiles.map(item => <button key={item} type="button" aria-pressed={profile === item} className={`${surface} min-w-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 ${profile === item ? "border-emerald-600 bg-emerald-50" : "hover:bg-muted"}`}
        onClick={() => chooseProfile(item)}>
        <span className="block font-bold">{item}</span>
        <span className="mt-2 block text-sm leading-relaxed">{descriptions[item]}</span>
      </button>)}
    </div>
    <p role="status" className="text-sm text-muted-foreground">{profile ? `Perfil de exemplo selecionado: ${profile}.` : "Selecione um perfil de exemplo."}</p>
    <Link href="/investments/reports" className={primary}>Abrir relatórios de exemplo</Link>
  </div>;
}

export function InvestPreviewSettings() {
  const [theme, setTheme] = useState(readReportTheme);
  return <div className="mx-auto max-w-5xl space-y-4">
    <PageHeader title="Configurações do Invest" icon={Settings} description="Preferências da prévia neste navegador." />
    <section className={surface}>
      <h2 className="text-lg font-bold">Tema do relatório</h2>
      <div role="group" aria-label="Tema do relatório" className="mt-3 flex flex-wrap gap-2">
        {([["light", "Claro"], ["dark", "Escuro"]] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={theme === value} className={theme === value ? primary : secondary}
            onClick={() => { setTheme(value); writePreference(reportThemeKey, value); }}>{label}</button>)}
      </div>
    </section>
    <section className={surface}>
      <h2 className="text-lg font-bold">Acompanhamento de empresas</h2>
      <p className="mt-1 text-sm text-muted-foreground">Ative ou desative o acompanhamento simulado e teste os canais de alerta da BBSE3.</p>
      <Link className={`${secondary} mt-3`} href={previewCompanyWatchPath}>Abrir acompanhamento da BBSE3</Link>
    </section>
  </div>;
}

const metrics = portfolioMetrics();
const portfolioColors = ["bg-emerald-600", "bg-sky-600", "bg-amber-500"];

export function InvestPreviewPortfolio({ view = "overview", customerPilot = false }: { view?: "overview" | "diagnosis" | "simulation" | "pilot"; customerPilot?: boolean }) {
  const [clock, setClock] = useState<{ start: number; now: number }>();
  const study = clock ? presentPortfolioStudy({ id: "preview", user_id: "preview", request_key: "preview", scenario_version: PORTFOLIO_DEMO_VERSION, created_at: new Date(clock.start) }, clock.now) : undefined;
  const running = !!study && study.status !== "completed";
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setClock(current => current && { ...current, now: Date.now() }), 500);
    return () => window.clearInterval(timer);
  }, [running]);
  const isSimulation = view === "simulation" || view === "pilot";
  const title = { overview: "Carteira de investimentos", diagnosis: "Diagnóstico da carteira", simulation: "Simulação de carteira", pilot: "Piloto do Comitê de Carteira Completa" }[view];
  return <div className="mx-auto max-w-5xl space-y-4">
    <PageHeader title={title} icon={isSimulation ? BrainCircuit : BriefcaseBusiness}
      description={isSimulation ? "Veja como os seis agentes examinam a mesma carteira fictícia. O estudo usa 0 tokens e 0 créditos." : "Explore a composição de uma carteira fictícia e confira como o Invest apresenta pesos e concentração."}>
      {!isSimulation && <Link className={`${action} bg-white text-[#12372c]`} href="/investments/portfolio/import-b3">Conferir extrato da B3</Link>}
      {view === "overview" && <Link className={`${action} border border-white/40 text-white`} href="/investments/portfolio/diagnosis">Ver diagnóstico</Link>}
      {!isSimulation && <Link className={`${action} border border-white/40 text-white`} href="/investments/portfolio/simulation">Simular comitê da carteira</Link>}
    </PageHeader>
    <section aria-labelledby="portfolio-composition" className={surface}>
      <h2 id="portfolio-composition" className="flex items-center gap-2 text-xl font-bold"><ChartNoAxesCombined aria-hidden="true" className="h-5 w-5 text-emerald-700" /> Composição de exemplo</h2>
      <dl className="mt-3 grid gap-2 sm:grid-cols-3">
        {[["Total fictício", formatBRL(metrics.totalValue)], ["Maior posição", `${metrics.largestHolding.weightPercent}%`], ["Duas maiores posições", `${metrics.topTwoPercent}%`]].map(([label, value]) =>
          <div key={label} className="rounded-lg border border-border bg-background p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-lg font-bold tabular-nums">{value}</dd></div>
        )}
      </dl>
      <div aria-hidden="true" className="mt-4 flex h-3 overflow-hidden rounded-full">
        {metrics.byClass.map((item, index) => <span key={item.assetClass} className={portfolioColors[index]} style={{ width: `${item.weightPercent}%` }} />)}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {metrics.byClass.map((item, index) => <li className="flex items-center gap-2" key={item.assetClass}><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${portfolioColors[index]}`} />{item.assetClass} <strong>{item.weightPercent}%</strong></li>)}
      </ul>
      {view === "diagnosis" && <ul className="mt-4 divide-y divide-border border-t border-border">
        {metrics.holdings.map(item => <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-sm"><span>{item.name}</span><strong>{formatBRL(item.value)} · {item.weightPercent}%</strong></li>)}
      </ul>}
    </section>
    {isSimulation && <section aria-labelledby="portfolio-preview-agents" className={surface}>
      <h2 id="portfolio-preview-agents" className="text-xl font-bold">Leituras dos seis agentes</h2>
      <button type="button" className={`${primary} mt-3 disabled:opacity-60`} disabled={running}
        onClick={() => { const now = Date.now(); setClock({ start: now, now }); }}>
        {running ? "Simulação em andamento" : study ? "Repetir simulação" : "Iniciar simulação da carteira"}
      </button>
      {study && <>
        <p role="status" className="mt-3 text-sm text-muted-foreground">{study.completedAgents} de 6 leituras prontas</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {study.agents.map(agent => <li key={agent.id} className="rounded-lg border border-border bg-background p-3">
            <p className="text-sm font-bold">{agent.name} <span className="font-normal text-muted-foreground">· {agent.role}</span></p>
            <p className="mt-1 text-sm leading-relaxed">{agent.output ?? (agent.status === "running" ? "Em andamento" : "Na fila")}</p>
          </li>)}
        </ul>
      </>}
    </section>}
    {view === "overview" && !customerPilot && <Link className={secondary} href="/investments/portfolio/b3">Ver integração com a B3</Link>}
  </div>;
}
