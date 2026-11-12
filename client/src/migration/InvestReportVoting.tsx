import { ArrowRight, GitCompareArrows, Scale, Search, Users } from "lucide-react";
import { CVS } from "@shared/personas";
import { SourceLinks } from "./InvestReportConversation";
import type { ReportSources } from "./invest-report-example";
import { investorProfiles, reportVotingFor, voteLabels, type VotePosition } from "./invest-report-votes";
import { previewSpecialists } from "./invest-research-preview";

const voteColors: Record<VotePosition, string> = {
  prioritize: "bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100",
  wait: "bg-sky-100 text-sky-950 dark:bg-sky-950 dark:text-sky-100",
};
const columns = "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)]";

function RoundTally({ title, prioritize, total }: { title: string; prioritize: number; total: number }) {
  const wait = total - prioritize;
  return <div className="rounded-lg border border-border bg-background p-3 sm:p-4">
    <h3 className="text-sm font-semibold">{title}</h3>
    <div aria-hidden="true" className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
      <span className="bg-emerald-600 dark:bg-emerald-400" style={{ width: `${100 * prioritize / total}%` }} />
      <span className="bg-sky-600 dark:bg-sky-400" style={{ width: `${100 * wait / total}%` }} />
    </div>
    <dl className="mt-3 grid grid-cols-2 gap-2">
      {([[ "prioritize", prioritize ], [ "wait", wait ]] as const).map(([position, count]) => (
        <div key={position} className={`flex flex-wrap items-baseline gap-x-2 rounded-md px-2 py-1 ${voteColors[position]}`}>
          <dt className="text-xs font-medium">{voteLabels[position]}</dt>
          <dd className="text-lg font-bold tabular-nums">{count}</dd>
        </div>
      ))}
    </dl>
  </div>;
}

function voteRows(voting: ReturnType<typeof reportVotingFor>) {
  return previewSpecialists.map(id => {
    const first = voting.firstVotes[id];
    const revision = voting.arguments.find(argument => argument.specialist === id && argument.newVote && argument.newVote !== first);
    return { id, first, second: revision?.newVote ?? first, revision };
  });
}

function majority(total: number, prioritize: number): VotePosition {
  return prioritize > total / 2 ? "prioritize" : "wait";
}

export function reportFinalVoteLabel(ticker: string) {
  const rows = voteRows(reportVotingFor(ticker));
  return voteLabels[majority(rows.length, rows.filter(row => row.second === "prioritize").length)];
}

export default function InvestReportVoting({ ticker, sources }: { ticker: string; sources: ReportSources }) {
  const voting = reportVotingFor(ticker);
  const rows = voteRows(voting);
  const firstPrioritize = rows.filter(row => row.first === "prioritize").length;
  const secondPrioritize = rows.filter(row => row.second === "prioritize").length;
  const firstMajority = majority(rows.length, firstPrioritize);
  const secondMajority = majority(rows.length, secondPrioritize);
  const revisedAgents = rows.filter(row => row.revision).map(row => CVS[row.id].nome);
  const changedNames = new Intl.ListFormat("pt-BR").format(revisedAgents);
  const accepted = voting.arguments.filter(argument => argument.decision === "accepted").length;
  const refuted = voting.arguments.length - accepted;

  return <section id="rodadas-votacao" aria-labelledby="rounds-title" className="scroll-mt-20 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
    <div className="flex items-center gap-2">
      <GitCompareArrows aria-hidden="true" className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" />
      <h2 id="rounds-title" className="text-xl font-bold">Duas rodadas de votação</h2>
    </div>
    <p className="mt-1 text-sm text-muted-foreground">Votação fictícia sobre a evidência do estudo.</p>
    <p className="mt-3 text-base font-semibold">{voting.question}</p>
    <div className="mt-3 grid gap-3">
      <RoundTally title="1ª rodada · Parecer inicial" prioritize={firstPrioritize} total={rows.length} />
      <section aria-labelledby="debate-title" className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/30 sm:p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 id="debate-title" className="flex items-center gap-2 text-base font-bold">
            <Scale aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-800 dark:text-amber-300" /> Advogado do diabo
          </h3>
          <p className="text-xs font-medium tabular-nums text-muted-foreground">{accepted} {accepted === 1 ? "aceito" : "aceitos"} · {refuted} {refuted === 1 ? "refutado" : "refutados"}</p>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Rafael conduz esta etapa. Os especialistas confrontam os argumentos com as fontes antes de votar de novo.</p>
        <div className={`mt-3 grid gap-2 ${voting.arguments.length === 2 ? "md:grid-cols-2" : "xl:grid-cols-3"}`}>
          {voting.arguments.map(argument => {
            const isAccepted = argument.decision === "accepted";
            const first = voting.firstVotes[argument.specialist];
            const second = argument.newVote ?? first;
            const changed = first !== second;
            return <article key={argument.id} id={`debate-${argument.id}`} aria-labelledby={`argumento-${argument.id}`}
              className="flex min-w-0 scroll-mt-20 flex-col rounded-lg border border-border bg-card p-3 target:ring-2 target:ring-amber-600">
              <p className={`self-start rounded-md px-2 py-0.5 text-xs font-semibold ${isAccepted ? voteColors.prioritize : "bg-muted text-foreground"}`}>
                {isAccepted ? "Aceito por" : "Refutado por"} {CVS[argument.specialist].nome}
              </p>
              <h4 id={`argumento-${argument.id}`} className="mt-2 text-sm font-bold">{argument.claim}</h4>
              <p className="mb-3 mt-1 text-sm leading-relaxed">{argument.response}</p>
              <div className="mt-auto border-t border-border pt-2">
                <SourceLinks ids={argument.sources} sources={sources} />
                <p className="mt-2 text-xs font-medium text-muted-foreground">
                  {changed ? <><strong className="text-foreground">Mudou de voto</strong> · {voteLabels[first]} → {voteLabels[second]}</>
                    : <><strong className="text-foreground">Manteve o voto</strong> · {voteLabels[second]}</>}
                </p>
              </div>
            </article>;
          })}
        </div>
      </section>
      <RoundTally title="2ª rodada · Após o debate" prioritize={secondPrioritize} total={rows.length} />
    </div>

    <section aria-labelledby="verdict-title" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-50">
      <h3 id="verdict-title" className="text-xs font-semibold">Veredito do Rafael</h3>
      <p className="mt-1 text-lg font-bold">{voteLabels[secondMajority]}</p>
      {firstMajority !== secondMajority && <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm font-medium">
        <span>A maioria mudou de posição</span>
        <span className="rounded bg-white/80 px-2 py-0.5 dark:bg-black/20">{voteLabels[firstMajority]}</span>
        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        <span className="sr-only">para</span>
        <span className="rounded bg-white/80 px-2 py-0.5 dark:bg-black/20">{voteLabels[secondMajority]}</span>
      </p>}
      <p className="mt-2 text-sm leading-relaxed">{voting.verdictReason}</p>
    </section>

    <h3 className="mt-5 text-base font-bold">Votos por especialista</h3>
    {revisedAgents.length > 0 && <p className="mt-1 text-sm text-muted-foreground">
      <strong className="text-foreground">{changedNames}</strong> {revisedAgents.length === 1 ? "revisou seu voto." : "revisaram seus votos."}
    </p>}
    <div aria-hidden="true" className={`mt-3 hidden gap-3 px-3 pb-2 text-xs font-semibold text-muted-foreground lg:grid ${columns}`}>
      <span>Especialista</span><span>1ª rodada</span><span>2ª rodada</span><span>Motivo da mudança</span>
    </div>
    <ul className="mt-2 grid gap-2 lg:mt-0">
      {rows.map(({ id, first, second, revision }) => <li key={id} className={`grid grid-cols-2 items-start gap-3 rounded-lg border p-3 ${columns} ${revision ? "border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30" : "border-border bg-background"}`}>
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <p className="text-sm font-semibold">{CVS[id].nome}</p>
          <p className="text-xs text-muted-foreground">{CVS[id].papel}</p>
        </div>
        {([["1ª rodada", first], ["2ª rodada", second]] as const).map(([label, position]) => <div key={label} className="min-w-0">
          <p className="mb-1 text-xs font-medium text-muted-foreground lg:sr-only">{label}</p>
          <p className={`inline-block max-w-full rounded-md px-2 py-1 text-xs font-semibold ${voteColors[position]}`}>{voteLabels[position]}</p>
        </div>)}
        <div className="col-span-2 min-w-0 text-sm lg:col-span-1">
          {revision ? <>
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">Mudou o voto</p>
            <p className="mb-2 mt-1 leading-relaxed">{revision.response}</p>
            <SourceLinks ids={revision.sources} sources={sources} />
            <a href={`#debate-${revision.id}`} className="mt-2 inline-block text-xs font-semibold text-emerald-800 underline underline-offset-2 dark:text-emerald-300">Ver argumento no debate</a>
          </> : <p className="text-xs text-muted-foreground">Manteve o voto</p>}
        </div>
      </li>)}
    </ul>
  </section>;
}

export function InvestVerdictReview({ ticker, sources }: { ticker: string; sources: ReportSources }) {
  const voting = reportVotingFor(ticker);
  return <section id="rever-veredito" aria-labelledby="review-verdict-title" className="scroll-mt-20 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 id="review-verdict-title" className="flex items-center gap-2 text-base font-bold">
        <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-800 dark:text-amber-300" /> Onde o comitê pode estar errado
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">Critérios da simulação para rever o veredito quando houver novos dados.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {voting.review.map(({ condition, evidence, effect }) => (
          <article key={condition} className="min-w-0 rounded-lg border border-border bg-card p-3 sm:p-4">
            <h4 className="text-sm font-bold leading-snug">{condition}</h4>
            <dl className="mt-3 space-y-3 text-sm leading-relaxed">
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">Dados a conferir</dt>
                <dd className="mt-1">{evidence}</dd>
              </div>
              <div className="border-t border-border pt-2">
                <dt className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Como mudaria o veredito</dt>
                <dd className="mt-1">{effect}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <div className="mt-3 border-t border-border pt-2">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">Fontes fictícias de partida</p>
        <SourceLinks ids={voting.reviewSources} sources={sources} />
      </div>
    </section>;
}

export function InvestReportProfiles({ ticker, demoProfile }: { ticker: string; demoProfile?: (typeof investorProfiles)[number] }) {
  const voting = reportVotingFor(ticker);
  return <section id="indicacao-por-perfil" aria-labelledby="investor-profiles-title" className="scroll-mt-20 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 id="investor-profiles-title" className="flex items-center gap-2 text-base font-bold">
        <Users aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-800 dark:text-emerald-300" /> Indicação por perfil de investidor
      </h3>
      <p className="mt-2 text-sm">Veredito do Rafael · <strong>{reportFinalVoteLabel(ticker)}</strong></p>
      <p className="mt-1 text-sm text-muted-foreground">Leitura de um estudo fictício. A adequação individual depende dos objetivos, do horizonte e da carteira do investidor.</p>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        {investorProfiles.map(profile => {
          const { takeaway, rationale, evidence } = voting.profiles[profile];
          return <article key={profile} className={`flex min-w-0 flex-col rounded-lg border bg-card p-3 sm:p-4 ${demoProfile === profile ? "border-emerald-600" : "border-border"}`}>
            <h4 className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{profile}{demoProfile === profile && <span className="ml-2 text-muted-foreground">· Perfil escolhido</span>}</h4>
            <p className="mt-2 text-sm font-bold">{takeaway}</p>
            <p className="mb-3 mt-1 text-sm leading-relaxed">{rationale}</p>
            <dl className="mt-auto border-t border-border pt-2 text-sm leading-relaxed">
              <dt className="text-xs font-semibold text-muted-foreground">Dados para reavaliar</dt>
              <dd className="mt-1">{evidence}</dd>
            </dl>
          </article>;
        })}
      </div>
      <a href="#rever-veredito" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-800 underline underline-offset-2 dark:text-emerald-300">
        Ver condições de revisão do veredito <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
      </a>
    </section>;
}
