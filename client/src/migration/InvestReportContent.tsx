import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ChevronDown, ClipboardCheck, Database, LayoutDashboard, MessageCircle, TrendingUp, UsersRound } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import InvestCommitteeEvidence, { InvestVerdictHypotheses } from "./InvestCommitteeEvidence";
import InvestReportCalendar from "./InvestReportCalendar";
import { CommitteePortrait, InvestReportCommittee, RafaelSynthesis } from "./InvestReportCommittee";
import { InvestReportComparison, InvestReportConversation, evidenceQuestion, type ReportQuestion } from "./InvestReportConversation";
import InvestReportEntryStrategy from "./InvestReportEntryStrategy";
import InvestReportGuidedDialogue from "./InvestReportGuidedDialogue";
import InvestReportRisks from "./InvestReportRisks";
import InvestReportValuation from "./InvestReportValuation";
import InvestReportVoting, { InvestReportProfiles, InvestVerdictReview, reportFinalVoteLabel } from "./InvestReportVoting";
import type { ReportAgent, ReportExample } from "./invest-report-example";
import { reportVotingFor, type investorProfiles } from "./invest-report-votes";
import type { PreviewCompany } from "./invest-research-preview";

import type { ConfirmPreviewCredit } from "./invest-preview-credits";

const PriceHistory = lazy(() => import("./InvestReportPriceHistory"));
const sections = [
  { id: "resumo-executivo", label: "Visão geral", icon: LayoutDashboard, anchors: [] },
  { id: "comite", label: "Comitê", icon: UsersRound, anchors: ["pareceres-comite", "sintese-rafael", "rodadas-votacao", "comparar-pareceres"] },
  { id: "cenarios", label: "Cenários", icon: TrendingUp, anchors: ["valuation", "estrategia-de-entrada", "historico-de-precos", "indicacao-por-perfil"] },
  { id: "fontes-relatorio", label: "Fontes", icon: Database, anchors: ["mapa-de-evidencias"] },
  { id: "revisao", label: "Revisão", icon: ClipboardCheck, anchors: ["testar-premissa", "riscos-consolidados", "rever-veredito", "calendario-de-eventos"] },
];
const conversationAnchor = "conversa-relatorio";
const currentAnchor = () => window.location.hash.slice(1);
const answerButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#245e46] px-4 text-sm font-semibold text-white hover:bg-[#184a36] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600";

function sectionFor(anchor: string) {
  if (anchor.startsWith("fonte-")) return "fontes-relatorio";
  if (anchor.startsWith("debate-")) return "comite";
  return sections.find(section => section.id === anchor || section.anchors.includes(anchor))?.id ?? sections[0].id;
}

function showAnchor(anchor: string) {
  const target = document.getElementById(anchor);
  if (!target) return;
  if (target instanceof HTMLDetailsElement) target.open = true;
  let disclosure = target.parentElement?.closest("details");
  while (disclosure) {
    disclosure.open = true;
    disclosure = disclosure.parentElement?.closest("details");
  }
  target.scrollIntoView({ block: "start" });
}

function ReportDisclosure({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  const [open, setOpen] = useState(false);
  return <details id={id} onToggle={id ? event => setOpen(event.currentTarget.open) : undefined}
    className="group scroll-mt-20 rounded-xl border border-border bg-card">
    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 [&::-webkit-details-marker]:hidden">
      {title}<ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground motion-safe:transition-transform group-open:rotate-180" />
    </summary>
    {(!id || open) && <div className="border-t border-border p-2 sm:p-3">{children}</div>}
  </details>;
}

function ReportOverview({ company, example, openConversation }: {
  company: PreviewCompany; example: ReportExample; openConversation: () => void;
}) {
  const voting = reportVotingFor(company.ticker);
  return <>
    <section aria-labelledby="veredito-do-lider" className="grid items-center gap-4 overflow-hidden rounded-2xl border border-[#2d5948] bg-[#153c2f] p-4 text-white sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-5 sm:p-5">
      <div className="flex items-center gap-3 sm:block">
        <CommitteePortrait id="rafael" eager className="h-16 w-16 shrink-0 rounded-lg sm:h-36 sm:w-full" />
        <div className="sm:hidden">
          <p className="text-lg font-bold">Rafael</p>
          <p className="text-xs font-medium text-[#bce1ce]">Líder do comitê · Moderador</p>
        </div>
      </div>
      <div className="min-w-0">
        <p className="hidden text-sm font-semibold text-[#bce1ce] sm:block">Rafael · Líder do comitê e moderador</p>
        <h2 id="veredito-do-lider" className="text-2xl font-bold tracking-tight sm:mt-1 sm:text-3xl">{reportFinalVoteLabel(company.ticker)}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#e5f3eb]">{voting.verdictReason}</p>
        <p className="mt-2 text-xs leading-relaxed text-[#bce1ce]">Rafael conduz os nove especialistas, medeia divergências e apresenta o veredito.</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
          <a href="#comite" className="inline-flex min-h-10 items-center gap-1.5 underline underline-offset-4">Ver a mesa do comitê <ArrowRight aria-hidden="true" className="h-4 w-4" /></a>
          <button type="button" onClick={openConversation} className="inline-flex min-h-10 items-center gap-1.5 underline underline-offset-4">
            <MessageCircle aria-hidden="true" className="h-4 w-4" /> Conversar com Rafael
          </button>
        </div>
      </div>
    </section>
    <section aria-labelledby="summary-title" className="rounded-xl border border-border bg-card p-4 text-card-foreground">
      <h2 id="summary-title" className="text-base font-bold">O que pesa na decisão</h2>
      <p className="mt-1 text-sm leading-relaxed">{example.summary}</p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-3">
        {([
          ["agreement", "Acordo", "#sintese-rafael"],
          ["divergence", "Divergência", "#rodadas-votacao"],
          ["review", "O que pode mudar", "#testar-premissa"],
        ] as const).map(([key, label, href]) => <div key={key} className="rounded-lg border border-border bg-background px-3 py-2">
          <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-sm font-semibold"><a href={href} className="underline-offset-4 hover:underline">{example.synthesis[key].title}</a></dd>
        </div>)}
      </dl>
    </section>
  </>;
}

export default function InvestReportContent({ company, example, theme, demoProfile, balance, onConfirm }: {
  company: PreviewCompany; example: ReportExample; theme: "light" | "dark";
  demoProfile?: (typeof investorProfiles)[number];
  balance: number; onConfirm: ConfirmPreviewCredit;
}) {
  const [anchor, setAnchor] = useState(currentAnchor);
  const [conversation, setConversation] = useState(() => currentAnchor() === conversationAnchor);
  const [conversationMode, setConversationMode] = useState<"demo" | "texto">("demo");
  const [agent, setAgent] = useState<ReportAgent>("rafael");
  const [replies, setReplies] = useState<ReportQuestion[]>([]);
  const returnFocus = useRef<HTMLElement | null>(null);
  const activeSection = sectionFor(anchor);
  const ticker = company.ticker;

  useEffect(() => {
    function updateAnchor() {
      const next = currentAnchor();
      if (next === conversationAnchor) {
        setConversationMode("demo");
        setConversation(true);
      } else setAnchor(next);
    }
    window.addEventListener("hashchange", updateAnchor);
    return () => window.removeEventListener("hashchange", updateAnchor);
  }, []);

  useEffect(() => {
    if (anchor) showAnchor(anchor);
  }, [anchor]);

  function addReply(item: ReportQuestion) {
    setReplies(items => [...items.slice(-3), item]);
  }

  function openConversation(id: ReportAgent = "rafael", includeEvidence = false) {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAgent(id);
    setConversationMode(includeEvidence ? "texto" : "demo");
    if (includeEvidence) addReply({ agent: id, question: evidenceQuestion, kind: "evidence" });
    setConversation(true);
  }

  return <>
    <nav aria-label="Seções do relatório" className="sticky top-14 z-10 grid grid-cols-5 gap-1 rounded-xl border border-border bg-card p-1.5 text-xs font-semibold shadow-sm sm:flex sm:text-sm">
      {sections.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} aria-current={activeSection === id ? "location" : undefined}
        className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-1 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 sm:px-3 ${activeSection === id ? "bg-[#245e46] text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
        <Icon aria-hidden="true" className="hidden h-4 w-4 shrink-0 sm:block" /> {label}
      </a>)}
    </nav>

    <div id="resumo-executivo" hidden={activeSection !== "resumo-executivo"} className="scroll-mt-36 space-y-3">
      <ReportOverview company={company} example={example} openConversation={() => openConversation()} />
    </div>
    <div id="comite" hidden={activeSection !== "comite"} className="scroll-mt-36 space-y-3 [&_[id]]:scroll-mt-36">
      <InvestReportCommittee example={example} onAsk={id => openConversation(id, true)} />
      <ReportDisclosure title="Síntese do Rafael">
        <section id="sintese-rafael" aria-label="Síntese do Rafael" className="scroll-mt-20 p-2">
          <RafaelSynthesis example={example} expanded />
        </section>
      </ReportDisclosure>
      <ReportDisclosure title="Duas rodadas de votação e advogado do diabo">
        <InvestReportVoting ticker={ticker} sources={example.sources} />
      </ReportDisclosure>
      <ReportDisclosure title="Comparar dois pareceres">
        <InvestReportComparison example={example} />
      </ReportDisclosure>
    </div>
    <div id="cenarios" hidden={activeSection !== "cenarios"} className="scroll-mt-36 space-y-3 [&_[id]]:scroll-mt-36">
      <ReportDisclosure title="Valuation · Premissas e faixas de valor justo">
        <InvestReportValuation ticker={ticker} sources={example.sources} />
      </ReportDisclosure>
      <ReportDisclosure title="Histórico de preços e faixas de entrada" id="historico-de-precos">
        <Suspense fallback={<p role="status" className="p-3 text-sm">Carregando gráfico de preços…</p>}>
          <PriceHistory ticker={ticker} reportIso={company.reportIso} />
        </Suspense>
      </ReportDisclosure>
      <ReportDisclosure title="Estratégia de entrada por perfil">
        <InvestReportEntryStrategy ticker={ticker} />
      </ReportDisclosure>
      <ReportDisclosure title="Leitura por perfil de investidor">
        <InvestReportProfiles ticker={ticker} demoProfile={demoProfile} />
      </ReportDisclosure>
    </div>
    <div id="fontes-relatorio" hidden={activeSection !== "fontes-relatorio"} className="scroll-mt-36 space-y-3 [&_[id]]:scroll-mt-36">
      <section aria-labelledby="sources-title" className="rounded-xl border border-border bg-card p-4 text-card-foreground">
        <h2 id="sources-title" className="text-xl font-bold">Fontes e datas</h2>
        <p className="mt-1 text-sm text-muted-foreground">Documentos fictícios usados nesta demonstração.</p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          {Object.entries(example.sources).map(([id, source]) => <li key={id} id={`fonte-${id}`} className="scroll-mt-36 rounded-lg border border-border bg-background p-3 target:ring-2 target:ring-emerald-600">
            <p className="text-sm font-semibold">{source.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{source.detail}</p>
            <time dateTime={source.iso} className="mt-1 block text-sm font-bold tabular-nums">{source.date}</time>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{source.excerpt}</p>
          </li>)}
        </ul>
      </section>
      <InvestCommitteeEvidence example={example} />
    </div>
    <div id="revisao" hidden={activeSection !== "revisao"} className="scroll-mt-36 space-y-3 [&_[id]]:scroll-mt-36">
      <InvestVerdictHypotheses ticker={ticker} />
      <ReportDisclosure title="Onde o comitê pode estar errado">
        <InvestVerdictReview ticker={ticker} sources={example.sources} />
      </ReportDisclosure>
      <ReportDisclosure title="Riscos consolidados">
        <InvestReportRisks risks={example.risks} sources={example.sources} />
      </ReportDisclosure>
      <ReportDisclosure title="Calendário de resultados e eventos">
        <InvestReportCalendar company={company} />
      </ReportDisclosure>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">Simulação com dados fictícios · créditos de teste</p>
      <button type="button" className={answerButton} onClick={() => openConversation()}>
        <MessageCircle aria-hidden="true" className="h-4 w-4" /> Abrir conversa do comitê
      </button>
    </div>
    <Sheet open={conversation} onOpenChange={setConversation}>
      <SheetContent side="right" className={`${theme === "dark" ? "dark " : ""}w-full overflow-y-auto p-4 text-foreground motion-reduce:animate-none sm:max-w-xl sm:p-5`}
        onClick={event => {
          if (event.target instanceof Element && event.target.closest('a[href^="#"]')) {
            returnFocus.current = null;
            setConversation(false);
          }
        }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (returnFocus.current) returnFocus.current.focus({ preventScroll: true });
          else showAnchor(currentAnchor());
        }}>
        <SheetTitle className="pr-8">Conversar com o comitê</SheetTitle>
        <SheetDescription className="mb-3 mt-1">{company.name} · Rafael, líder e moderador</SheetDescription>
        <div role="group" aria-label="Modo da conversa" className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1">
          {([["demo", "Conversa guiada"], ["texto", "Perguntar por texto"]] as const).map(([value, label]) =>
            <button key={value} type="button" aria-pressed={conversationMode === value} onClick={() => setConversationMode(value)}
              className={`min-h-11 rounded-md px-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 ${conversationMode === value ? "bg-[#245e46] text-white" : "text-muted-foreground hover:bg-muted"}`}>
              {label}
            </button>)}
        </div>
        {conversationMode === "demo" ? conversation && <InvestReportGuidedDialogue ticker={ticker} sources={example.sources} balance={balance} onConfirm={onConfirm} />
          : <InvestReportConversation example={example} agent={agent} setAgent={setAgent} replies={replies} addReply={addReply} />}
      </SheetContent>
    </Sheet>
  </>;
}
