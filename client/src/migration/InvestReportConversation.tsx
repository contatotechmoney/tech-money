import { useState, type FormEvent } from "react";
import { GitCompareArrows, MessageCircle, ScanLine } from "lucide-react";
import { COMITE_RV, CVS } from "@shared/personas";
import { type ReportExample, type ReportSources, type ReportAgent, type ReportSourceId } from "./invest-report-example";
import LocalVoiceNote from "./LocalVoiceNote";

export const evidenceQuestion = "Qual dado sustenta este parecer?";
const reviewQuestion = "O que falta revisar?";
const dateQuestion = "De quando são os dados?";
const prompts = [evidenceQuestion, dateQuestion, reviewQuestion];

type ReplyKind = "evidence" | "review" | "dates" | "unsupported";
export type ReportQuestion = { agent: ReportAgent; question: string; kind: ReplyKind };
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600";
const input = `min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base text-foreground ${focus}`;

function classify(question: string): ReplyKind {
  const normalized = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized === "de quando sao os dados?" || /data da fonte|data dos dados|de quando/.test(normalized)) return "dates";
  if (/revis|penden|o que falta|confirmar/.test(normalized)) return "review";
  if (/evidencia|sustenta|fonte|qual dado/.test(normalized)) return "evidence";
  return "unsupported";
}

export function SourceLinks({ ids, sources }: { ids: readonly ReportSourceId[]; sources: ReportSources }) {
  if (!ids.length) return <p className="text-sm text-muted-foreground"><strong>Fonte:</strong> não incluída na demonstração. <strong>Data:</strong> indisponível.</p>;
  return <ul className="space-y-1 text-sm">
    {ids.map(id => <li key={id} className="break-words">
      <a href={`#fonte-${id}`} className="font-semibold text-emerald-800 underline underline-offset-2 dark:text-emerald-300">{sources[id].title}</a>
      {" · "}<time dateTime={sources[id].iso}>{sources[id].date}</time>
    </li>)}
  </ul>;
}

function ReviewNote({ text }: { text: string }) {
  return <p className="rounded-lg bg-amber-50 p-3 text-sm leading-5 text-amber-950 dark:bg-[#302719] dark:text-[#f8e5b9]"><strong>Falta revisar:</strong> {text}</p>;
}

function Reply({ item, example }: { item: ReportQuestion; example: ReportExample }) {
  const opinion = example.opinions[item.agent];
  const answer = item.kind === "evidence" ? opinion.evidence
    : item.kind === "dates" ? opinion.sources.length
      ? "As datas abaixo correspondem aos documentos usados neste parecer, não à data em que o relatório de exemplo foi montado."
      : "Não há fonte datada para este parecer na demonstração."
    : item.kind === "review" ? "Veja a pendência que precisa ser resolvida antes de usar este parecer."
    : "A prévia não interpreta perguntas livres sobre decisões de investimento. Abaixo estão as fontes e as pendências já cadastradas. Para testar uma resposta direta, escolha uma das perguntas sugeridas.";
  return <article className="space-y-3 rounded-xl border border-border bg-background p-3 sm:p-4">
    <p className="break-words text-sm text-muted-foreground"><strong>Você:</strong> {item.question}</p>
    <div>
      <p className="text-sm font-bold">{CVS[item.agent].nome} · resposta demonstrativa</p>
      <p className="mt-1 text-sm leading-6">{answer}</p>
    </div>
    <div className="border-t border-border pt-2">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fontes e datas fictícias</p>
      <SourceLinks ids={opinion.sources} sources={example.sources} />
    </div>
    <ReviewNote text={opinion.review} />
  </article>;
}

export function InvestReportConversation({ agent, setAgent, replies, addReply, example }: {
  example: ReportExample;
  agent: ReportAgent;
  setAgent: (agent: ReportAgent) => void;
  replies: ReportQuestion[];
  addReply: (item: ReportQuestion) => void;
}) {
  const [draft, setDraft] = useState("");
  function ask(question: string) {
    const clean = question.trim();
    if (!clean) return;
    addReply({ agent, question: clean, kind: classify(clean) });
    setDraft("");
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ask(draft);
  }
  return <section id="conversa-relatorio" aria-labelledby="report-conversation-title" className="scroll-mt-20 space-y-4 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
    <div>
      <div className="flex items-center gap-2">
        <MessageCircle aria-hidden="true" className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
        <h2 id="report-conversation-title" tabIndex={-1} className="text-xl font-bold">Converse sobre este relatório</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">As respostas usam apenas o conteúdo fictício deste relatório. Nenhuma pergunta é enviada a um serviço de IA.</p>
    </div>
    <label className="block text-sm font-semibold">
      Agente para perguntar
      <select className={`mt-1 block max-w-sm ${input}`} value={agent} onChange={event => setAgent(event.target.value as ReportAgent)}>
        {COMITE_RV.map(id => <option key={id} value={id}>{CVS[id].nome} · {CVS[id].papel}</option>)}
      </select>
    </label>
    <div className="flex flex-wrap gap-2" aria-label="Perguntas sugeridas">
      {prompts.map(prompt => <button key={prompt} type="button" className={`min-h-11 rounded-lg border border-border bg-background px-3 text-left text-sm font-semibold hover:bg-muted ${focus}`} onClick={() => ask(prompt)}>{prompt}</button>)}
    </div>
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label className="min-w-[min(100%,16rem)] flex-1 text-sm font-semibold">Sua pergunta
        <input required maxLength={280} value={draft} onChange={event => setDraft(event.target.value)} className={`mt-1 block ${input}`} placeholder="Ex.: qual é a fonte desse parecer?" />
      </label>
      <button type="submit" className={`min-h-11 rounded-lg bg-[#245e46] px-4 text-sm font-semibold text-white ${focus}`}>Perguntar na prévia</button>
    </form>
    {replies.length > 0 && <div role="log" aria-label="Respostas da prévia" className="space-y-3">
      {replies.map((item, index) => <Reply key={index} item={item} example={example} />)}
    </div>}
    <details className="rounded-lg border border-border p-3">
      <summary className="cursor-pointer text-sm font-semibold">Gravar um rascunho de voz</summary>
      <LocalVoiceNote />
    </details>
  </section>;
}

export function InvestReportComparison({ example }: { example: ReportExample }) {
  const [first, setFirst] = useState<ReportAgent>("carlos");
  const [second, setSecond] = useState<ReportAgent>("juliana");
  const [pair, setPair] = useState<readonly [ReportAgent, ReportAgent]>(["carlos", "juliana"]);
  const [a, b] = pair.map(id => example.opinions[id]);
  const overlap = a.topic && a.topic === b.topic;
  return <section id="comparar-pareceres" aria-labelledby="report-compare-title" className="scroll-mt-20 space-y-4 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
    <div>
      <div className="flex items-center gap-2"><GitCompareArrows aria-hidden="true" className="h-5 w-5 text-emerald-700 dark:text-emerald-300" /><h2 id="report-compare-title" className="text-xl font-bold">Compare dois pareceres</h2></div>
      <p className="mt-1 text-sm text-muted-foreground">Veja o que cada agente observou, quais fontes usou e o que precisa ser checado.</p>
    </div>
    <form onSubmit={event => { event.preventDefault(); if (first !== second) setPair([first, second]); }} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      {([
        ["Primeiro parecer", first, second, setFirst],
        ["Segundo parecer", second, first, setSecond],
      ] as const).map(([label, current, other, change]) => <label key={label} className="block text-sm font-semibold">
        {label}
        <select className={`mt-1 block ${input}`} value={current} onChange={event => change(event.target.value as ReportAgent)}>
          {COMITE_RV.map(id => <option key={id} value={id} disabled={id === other}>{CVS[id].nome}</option>)}
        </select>
      </label>)}
      <button type="submit" className={`min-h-11 rounded-lg bg-[#245e46] px-4 text-sm font-semibold text-white ${focus}`}>Comparar pareceres</button>
    </form>
    <div aria-live="polite" className="space-y-3">
      <div className="flex gap-2 rounded-lg bg-muted p-3 text-sm leading-5">
        <ScanLine aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        {overlap ? <p><strong>Ponto em comum:</strong> {a.topic === "melhora-operacional" ? "Os dois registram melhora operacional, mas a contribuição de cada fator ainda precisa ser conferida." : "Os dois identificam a concentração de clientes como ponto de atenção."}</p>
          : <p><strong>Perspectivas diferentes:</strong> os pareceres tratam de aspectos distintos. Isso não indica concordância nem contradição.</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {pair.map(id => {
          const opinion = example.opinions[id];
          return <article key={id} className="min-w-0 space-y-3 rounded-xl border border-border bg-background p-3">
            <div><h3 className="font-bold">{CVS[id].nome}</h3><p className="text-xs text-muted-foreground">{CVS[id].papel}</p></div>
            <p className="text-sm leading-5">{opinion.finding}</p>
            <div><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fontes e datas fictícias</p><SourceLinks ids={opinion.sources} sources={example.sources} /></div>
            <ReviewNote text={opinion.review} />
          </article>;
        })}
      </div>
    </div>
  </section>;
}
