import { useState } from "react";
import { ArrowLeft, CalendarDays, Check, LockKeyhole, Moon, Sun } from "lucide-react";
import { Link } from "wouter";
import { COMITE_RV, CVS } from "@shared/personas";
import InvestmentLayout from "@/components/investment-layout";
import { OpinionDisclosure } from "./InvestReportCommittee";
import InvestReportContent from "./InvestReportContent";
import { readReportTheme, reportThemeKey, writePreference } from "./invest-preview-session";
import { reportExampleFor, type ReportExample } from "./invest-report-example";
import { previewResearchPhases, previewSpecialists, type PreviewRun } from "./invest-research-preview";

import type { ConfirmPreviewCredit } from "./invest-preview-credits";

import type { investorProfiles } from "./invest-report-votes";

type ReportTheme = "light" | "dark";

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
              <p className="text-xs text-muted-foreground">{isModerator ? "Líder do comitê · Moderador" : CVS[id].papel}</p>
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

export default function InvestReportPreview({ run, onReset, archived = false, previewWorkspace, customerPilot, demoProfile, balance, onConfirm }: {
  run?: PreviewRun; onReset: () => void; archived?: boolean;
  previewWorkspace: boolean; customerPilot: boolean; demoProfile?: (typeof investorProfiles)[number];
  balance: number; onConfirm: ConfirmPreviewCredit;
}) {
  const [theme, setTheme] = useState<ReportTheme>(readReportTheme);
  const [opened, setOpened] = useState(archived);
  const finished = run?.phase === "ready";
  const ready = finished && opened;
  const phaseIndex = finished ? previewResearchPhases.length : previewResearchPhases.findIndex(phase => phase.id === run?.phase);
  const activePhase = previewResearchPhases[phaseIndex];
  const company = run?.company;
  const example = reportExampleFor(company?.ticker ?? "");
  function changeTheme(value: ReportTheme) {
    setTheme(value);
    writePreference(reportThemeKey, value);
  }

  function openReport() {
    setOpened(true);
    window.requestAnimationFrame(() => {
      document.getElementById("report-title")?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    });
  }

  return <div className={`${theme === "dark" ? "dark " : ""}invest-report-preview text-foreground`} style={{ colorScheme: theme }}>
    <InvestmentLayout showOverview localPreview={previewWorkspace} customerPilot={customerPilot}>
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={archived ? "/investments/reports" : "/investments/inicio"} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" /> {archived ? "Voltar aos relatórios" : "Voltar ao início"}
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

        <section aria-labelledby="report-title" className={ready ? "flex flex-wrap items-end justify-between gap-2 border-b border-border pb-3" : "overflow-hidden rounded-2xl border border-[#285345] bg-[#12372c] p-5 text-white sm:p-7"}>
          <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className={ready ? "font-medium text-muted-foreground" : "rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-[#e3f3eb]"}>Relatório demonstrativo</span>
            {ready && <span className="rounded-full bg-[#f6deab] px-3 py-1.5 text-[#533600]">Revisão pendente</span>}
          </div>
          <p className={ready ? "mt-2 text-xs font-semibold uppercase tracking-widest text-emerald-800 dark:text-emerald-300" : "mt-4 text-xs font-semibold uppercase tracking-widest text-[#b4dccb]"}>{company ? `Renda variável · ${company.ticker}` : "Prévia de renda variável"}</p>
          <h1 id="report-title" tabIndex={-1} className={ready ? "mt-1 text-2xl font-bold leading-tight tracking-tight sm:text-3xl" : "mt-1 text-3xl font-bold leading-tight tracking-tight sm:text-4xl"}>{company?.name ?? "Pesquisa de empresa"}</h1>
          </div>
          {ready && company && <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <CalendarDays aria-hidden="true" className="h-4 w-4" />
            Data do estudo <time dateTime={company.reportIso} className="font-semibold">{company.reportDate}</time>
          </p>}
          {!ready && <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#c9e2d7]">Empresa, documentos e pareceres fictícios. O fluxo usa apenas créditos de teste.</p>}
        </section>

        {!ready && <section aria-labelledby="research-flow-title" className="rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
          {run && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">{opened ? "Etapa 4 de 4 · Relatório" : "Etapa 3 de 4 · Acompanhamento"}</p>}
          <h2 id="research-flow-title" className="text-lg font-bold">Andamento da pesquisa</h2>
          <p className="mt-1 text-sm text-muted-foreground">A simulação avança automaticamente. A coleta usa fontes de exemplo.</p>
          {run && <p className="mt-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
            Análise confirmada com créditos de teste
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
              : <><strong>Antes da pesquisa.</strong> Escolha uma empresa de exemplo no início e confira o saldo de teste.</>}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!run && <Link href="/investments/inicio" className="inline-flex min-h-11 items-center rounded-lg bg-[#245e46] px-4 text-sm font-semibold text-white">Escolher empresa no início</Link>}
            {finished && !opened && <button type="button" onClick={openReport} className="min-h-11 rounded-lg bg-[#245e46] px-4 text-sm font-semibold text-white">Abrir relatório de exemplo</button>}
            {run && <button type="button" onClick={onReset} className="min-h-11 rounded-lg border border-border bg-background px-4 text-sm font-semibold">{archived ? "Voltar aos relatórios" : "Reiniciar teste"}</button>}
          </div>
          {run && !opened && <ResearchProgress run={run} example={example} />}
        </section>}

        {!ready && <section aria-labelledby="conversation-locked" className="flex items-start gap-3 rounded-xl border border-border bg-muted p-4">
          <LockKeyhole aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <h2 id="conversation-locked" className="font-bold">{finished ? "Abra o relatório para perguntar aos agentes" : "Perguntas disponíveis quando o relatório estiver pronto"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Depois da pesquisa, você poderá perguntar sobre as fontes e comparar os pareceres desta empresa.</p>
          </div>
        </section>}

        {ready && company && <InvestReportContent company={company} example={example} theme={theme} demoProfile={demoProfile} balance={balance} onConfirm={onConfirm} />}
      </div>
    </InvestmentLayout>
  </div>;
}
