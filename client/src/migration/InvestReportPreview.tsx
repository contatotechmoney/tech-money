import { useState } from "react";
import { ArrowLeft, CalendarDays, Check, ChevronDown, ClipboardCheck, Database, FileText, GitCompareArrows, LockKeyhole, Moon, Sun } from "lucide-react";
import { Link } from "wouter";
import { COMITE_RV, CVS } from "@shared/personas";
import InvestmentLayout from "@/components/investment-layout";
import { InvestReportComparison, InvestReportConversation, SourceLinks, evidenceQuestion, type ReportQuestion } from "./InvestReportConversation";
import InvestReportVoting from "./InvestReportVoting";
import { reportExampleFor, type ReportAgent, type ReportExample } from "./invest-report-example";
import { formatPreviewUsd, previewResearchPhases, previewSpecialists, type PreviewRun } from "./invest-research-preview";

const themeKey = "tm-invest-report-theme";
type ReportTheme = "light" | "dark";
function readTheme(): ReportTheme {
  try {
    const saved = localStorage.getItem(themeKey);
    if (saved === "dark" || saved === "light") return saved;
  } catch { /* Preview also works without browser storage. */ }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const synthesisSections = [
  { key: "agreement", label: "Onde concordam", icon: Check, color: "text-emerald-800 dark:text-emerald-300" },
  { key: "divergence", label: "Onde divergem", icon: GitCompareArrows, color: "text-sky-800 dark:text-sky-300" },
  { key: "review", label: "O que falta revisar", icon: ClipboardCheck, color: "text-amber-800 dark:text-amber-300" },
] as const;

function RafaelSynthesis({ example, expanded = false }: { example: ReportExample; expanded?: boolean }) {
  return <div className="space-y-3">
    <p className="text-sm leading-relaxed">{example.opinions.rafael.finding}</p>
    <div className={`grid gap-3 ${expanded ? "lg:grid-cols-3" : ""}`}>
      {synthesisSections.map(({ key, label, icon: Icon, color }) => {
        const point = example.synthesis[key];
        return <section key={key} aria-label={label} className="min-w-0 rounded-lg border border-border bg-background p-3 sm:p-4">
          <p className={`flex items-center gap-2 text-xs font-semibold ${color}`}>
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />{label}
          </p>
          <p className="mt-2 text-sm font-bold">{point.title}</p>
          <p className="mt-1 text-sm leading-relaxed">{point.text}</p>
          <div className="mt-3 border-t border-border pt-2">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">{key === "review" ? "Fontes para conferir" : "Fontes fictícias"}</p>
            <SourceLinks ids={point.sources} sources={example.sources} />
          </div>
        </section>;
      })}
    </div>
  </div>;
}

function OpinionDisclosure({ id, example, onAsk }: {
  id: ReportAgent;
  example: ReportExample;
  onAsk?: (id: ReportAgent) => void;
}) {
  const { nome, papel } = CVS[id];
  const opinion = example.opinions[id];
  return <details className="group rounded-lg border border-border bg-background open:border-emerald-600/50">
    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{nome}</span>
        <span className="block text-xs text-muted-foreground">{papel}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {!onAsk && <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Concluído</span>}
        <ChevronDown aria-hidden="true" className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </span>
    </summary>
    <div className="space-y-2 border-t border-border p-3 text-sm leading-relaxed">
      {id === "rafael" ? <RafaelSynthesis example={example} /> : <>
        <p>{opinion.finding}</p>
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Fontes fictícias do parecer</p>
          <SourceLinks ids={opinion.sources} sources={example.sources} />
        </div>
      </>}
      {onAsk && <button type="button" onClick={() => onAsk(id)} className="inline-flex min-h-11 items-center text-left font-semibold text-emerald-800 underline dark:text-emerald-300">Perguntar a {nome} neste relatório</button>}
    </div>
  </details>;
}

function ResearchProgress({ run, example }: { run: PreviewRun; example: ReportExample }) {
  const sourceEntries = Object.entries(example.sources);
  const collected = run.phase === "sources" ? run.completedInPhase : sourceEntries.length;
  const completed = run.phase === "sources" ? 0
    : run.phase === "opinions" ? run.completedInPhase : previewSpecialists.length;

  return <div className="mt-4 grid gap-3 min-[900px]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
    <section aria-labelledby="collected-sources-title" className="min-w-0 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id="collected-sources-title" className="text-sm font-bold">Fontes fictícias coletadas</h3>
        <p className="text-xs tabular-nums text-muted-foreground">{collected} de {sourceEntries.length}</p>
      </div>
      {collected === 0 ? <p className="mt-2 text-sm text-muted-foreground">Aguardando a primeira fonte de exemplo.</p>
        : <ul className="mt-2 divide-y divide-border">
          {sourceEntries.slice(0, collected).map(([id, source]) => <li key={id} id={`fonte-${id}`} className="flex scroll-mt-20 items-start gap-2 rounded px-1 py-2 target:bg-emerald-50 target:ring-2 target:ring-emerald-600 dark:target:bg-[#17352a]">
            <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{source.title}</p>
              <p className="text-xs text-muted-foreground">{source.detail} · <time dateTime={source.iso} className="whitespace-nowrap tabular-nums">{source.date}</time></p>
            </div>
          </li>)}
        </ul>}
    </section>
    <section aria-labelledby="opinion-progress-title" className="min-w-0 rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id="opinion-progress-title" className="text-sm font-bold">Pareceres dos especialistas</h3>
        <p className="text-xs tabular-nums text-muted-foreground">{completed} de {previewSpecialists.length} concluídos</p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Abra um parecer concluído para ver o resumo e as fontes.</p>
      <ul className="mt-2 space-y-1">
        {COMITE_RV.map((id, index) => {
          const isModerator = id === "rafael";
          const done = isModerator ? run.phase === "ready" : index < completed;
          const active = isModerator ? run.phase === "synthesis" : run.phase === "opinions" && index === completed;
          if (done) return <li key={id}><OpinionDisclosure id={id} example={example} /></li>;
          return <li key={id} className="flex min-h-12 items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">{CVS[id].nome}</p>
              <p className="text-xs text-muted-foreground">{CVS[id].papel}</p>
            </div>
            <span className={`shrink-0 text-right text-xs ${active ? "font-semibold text-emerald-800 dark:text-emerald-300" : "text-muted-foreground"}`}>
              {active ? "Em andamento" : "Na fila"}
            </span>
          </li>;
        })}
      </ul>
    </section>
  </div>;
}

export default function InvestReportPreview({ run, onReset }: {
  run?: PreviewRun; onReset: () => void;
}) {
  const [theme, setTheme] = useState<ReportTheme>(readTheme);
  const [opened, setOpened] = useState(false);
  const finished = run?.phase === "ready";
  const ready = finished && opened;
  const phaseIndex = finished ? previewResearchPhases.length : previewResearchPhases.findIndex(phase => phase.id === run?.phase);
  const activePhase = previewResearchPhases[phaseIndex];
  const company = run?.company;
  const example = reportExampleFor(company?.ticker ?? "");
  const [agent, setAgent] = useState<ReportAgent>("carlos");
  const [replies, setReplies] = useState<ReportQuestion[]>([]);

  function addReply(item: ReportQuestion) {
    if (!ready) return;
    setReplies(items => [...items.slice(-3), item]);
  }

  function askAboutOpinion(id: ReportAgent) {
    if (!ready) return;
    setAgent(id);
    addReply({ agent: id, question: evidenceQuestion, kind: "evidence" });
    document.getElementById("report-conversation-title")?.focus({ preventScroll: true });
    document.getElementById("conversa-relatorio")?.scrollIntoView({ block: "start" });
  }

  function changeTheme(value: ReportTheme) {
    setTheme(value);
    try { localStorage.setItem(themeKey, value); } catch { /* Keep the in-page choice. */ }
  }

  return <div className={`${theme === "dark" ? "dark " : ""}invest-report-preview text-foreground`} style={{ colorScheme: theme }}>
    <InvestmentLayout showOverview>
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/investments/inicio" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Voltar ao início
          </Link>
          <div aria-label="Tema do relatório" role="group" className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
            {([["light", "Claro", Sun], ["dark", "Escuro", Moon]] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" aria-pressed={theme === value} onClick={() => changeTheme(value)}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 ${theme === value ? "bg-[#245e46] text-white" : "text-muted-foreground hover:bg-muted"}`}>
                <Icon aria-hidden="true" className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        <section aria-labelledby="report-title" className="overflow-hidden rounded-2xl border border-[#285345] bg-[#12372c] p-5 text-white sm:p-7">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[#e3f3eb]">Relatório demonstrativo</span>
            {ready && <span className="rounded-full bg-[#f6deab] px-3 py-1.5 text-[#533600]">Revisão pendente</span>}
          </div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-[#b4dccb]">{company ? `Renda variável · ${company.ticker}` : "Prévia de renda variável"}</p>
          <h1 id="report-title" className="mt-1 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{company?.name ?? "Pesquisa de empresa"}</h1>
          {ready && company && <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#e0f1e9]">
            <CalendarDays aria-hidden="true" className="h-4 w-4" />
            Data do relatório de exemplo: <time dateTime={company.reportIso} className="font-semibold">{company.reportDate}</time>
          </p>}
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#c9e2d7]">Empresa, documentos e pareceres fictícios. Nenhuma análise real foi executada e nenhuma consulta foi debitada.</p>
        </section>

        <section aria-labelledby="research-flow-title" className="rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
          {run && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">{opened ? "Etapa 4 de 4 · Relatório" : "Etapa 3 de 4 · Acompanhamento"}</p>}
          <h2 id="research-flow-title" className="text-lg font-bold">Andamento da pesquisa</h2>
          <p className="mt-1 text-sm text-muted-foreground">A simulação avança automaticamente. Nenhuma fonte externa é consultada e nenhum saldo é usado.</p>
          {run && <p className="mt-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
            Orçamento de referência conferido: <strong>{formatPreviewUsd(run.budget.maxUsdMicros)}</strong> · {run.budget.modelId.endsWith(":US") ? "DeepSeek V4.1 Flash (:US)" : "DeepSeek V4.1 Flash"} · 0 consultas debitadas
          </p>}
          {run && <ol aria-label="Etapas da pesquisa simulada" className="mt-4 grid gap-2 sm:grid-cols-3">
            {previewResearchPhases.map((phase, index) => {
              const current = index === phaseIndex;
              const done = index < phaseIndex;
              return <li key={phase.id} aria-current={current ? "step" : undefined}
                className={`flex min-w-0 items-start gap-2 rounded-lg border px-3 py-3 text-sm ${current ? "border-emerald-600 bg-emerald-50 text-emerald-950 dark:bg-[#17352a] dark:text-emerald-100" : "border-border bg-background"}`}>
                <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-current text-xs">
                  {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold">{phase.label}</p>
                  <p className="mt-1 text-xs leading-5">{done ? phase.done : current ? "Em andamento" : "Aguardando"}</p>
                </div>
              </li>;
            })}
          </ol>}
          <p role="status" aria-atomic="true" className="mt-3 text-sm">
            {finished ? <><strong>Relatório pronto.</strong> Os pareceres de exemplo já estão disponíveis.</>
              : activePhase ? <><strong>{activePhase.label}.</strong> {activePhase.activity}</>
              : <><strong>Antes da pesquisa.</strong> Escolha uma empresa de exemplo no início e confira o orçamento.</>}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!run && <Link href="/investments/inicio" className="inline-flex min-h-11 items-center rounded-lg bg-[#245e46] px-4 text-sm font-semibold text-white">Escolher empresa no início</Link>}
            {finished && !opened && <button type="button" onClick={() => setOpened(true)} className="min-h-11 rounded-lg bg-[#245e46] px-4 text-sm font-semibold text-white">Abrir relatório de exemplo</button>}
            {run && <button type="button" onClick={onReset} className="min-h-11 rounded-lg border border-border bg-background px-4 text-sm font-semibold">Reiniciar teste</button>}
          </div>
          {run && !opened && <ResearchProgress run={run} example={example} />}
        </section>

        {!ready && <section aria-labelledby="conversation-locked" className="flex items-start gap-3 rounded-xl border border-border bg-muted p-4">
          <LockKeyhole aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <h2 id="conversation-locked" className="font-bold">{finished ? "Abra o relatório para perguntar aos agentes" : "Perguntas disponíveis quando o relatório estiver pronto"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Depois da pesquisa, você poderá perguntar sobre as fontes e comparar os pareceres desta empresa.</p>
          </div>
        </section>}

        {ready && <>
        <nav aria-label="Atalhos do relatório" className="flex flex-wrap gap-2 text-sm font-semibold">
          {[
            ["resumo-executivo", "Resumo executivo"],
            ["sintese-rafael", "Síntese do Rafael"],
            ["rodadas-votacao", "Duas rodadas de votação"],
            ["rever-veredito", "Onde o comitê pode estar errado"],
            ["indicacao-por-perfil", "Indicação por perfil de investidor"],
            ["fontes-relatorio", "Fontes e datas"],
            ["pareceres-comite", "Pareceres do comitê"],
            ["comparar-pareceres", "Comparar dois pareceres"],
            ["conversa-relatorio", "Perguntar sobre o relatório"],
          ].map(([id, label]) => <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-3 underline-offset-4 hover:underline">{label}</a>)}
        </nav>

        <section id="resumo-executivo" aria-labelledby="summary-title" className="scroll-mt-20 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
          <div className="flex items-center gap-2"><FileText aria-hidden="true" className="h-5 w-5 text-emerald-700 dark:text-emerald-300" /><h2 id="summary-title" className="text-xl font-bold">Resumo executivo</h2></div>
          <p className="mt-3 text-base leading-relaxed">{example.summary}</p>
          <p className="mt-3 border-t border-border pt-3 text-sm leading-relaxed text-muted-foreground">Estudo fictício com revisão pendente.</p>
        </section>

        <section id="sintese-rafael" aria-labelledby="rafael-title" className="scroll-mt-20 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
          <h2 id="rafael-title" className="mb-3 text-xl font-bold">Síntese do Rafael</h2>
          <RafaelSynthesis example={example} expanded />
          <button type="button" onClick={() => askAboutOpinion("rafael")} className="mt-3 inline-flex min-h-11 items-center text-left text-sm font-semibold text-emerald-800 underline dark:text-emerald-300">Perguntar a Rafael neste relatório</button>
        </section>

        {company && <InvestReportVoting ticker={company.ticker} sources={example.sources} />}

        <section id="fontes-relatorio" aria-labelledby="sources-title" className="scroll-mt-20 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
          <div className="flex items-center gap-2"><Database aria-hidden="true" className="h-5 w-5 text-emerald-700 dark:text-emerald-300" /><h2 id="sources-title" className="text-xl font-bold">Fontes e datas</h2></div>
          <p className="mt-1 text-sm text-muted-foreground">Exemplos de como os documentos aparecerão. Nenhuma fonte externa foi consultada.</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {Object.entries(example.sources).map(([id, source]) => <li key={id} id={`fonte-${id}`} className="scroll-mt-20 rounded-lg border border-border bg-background p-3 target:ring-2 target:ring-emerald-600">
              <p className="text-sm font-semibold">{source.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{source.detail}</p>
              <time dateTime={source.iso} className="mt-1 block text-base font-bold tabular-nums">{source.date}</time>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{source.excerpt}</p>
            </li>)}
          </ul>
        </section>

        <section id="pareceres-comite" aria-labelledby="opinions-title" className="scroll-mt-20 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
          <h2 id="opinions-title" className="text-xl font-bold">Pareceres do comitê</h2>
          <p className="mt-1 text-sm text-muted-foreground">Abra o parecer de um especialista para conferir o resumo e as fontes.</p>
          <div className="mt-4 grid gap-2">
            {previewSpecialists.map(id => <OpinionDisclosure key={id} id={id} example={example} onAsk={askAboutOpinion} />)}
          </div>
        </section>

        <InvestReportComparison example={example} />
        <InvestReportConversation example={example} agent={agent} setAgent={setAgent} replies={replies} addReply={addReply} />
        </>}
      </div>
    </InvestmentLayout>
  </div>;
}
