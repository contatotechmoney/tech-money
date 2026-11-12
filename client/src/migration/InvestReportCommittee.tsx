import { useState } from "react";
import { Check, ChevronDown, ClipboardCheck, GitCompareArrows, MessageCircle } from "lucide-react";
import { CVS } from "@shared/personas";
import { SourceLinks } from "./InvestReportConversation";
import type { ReportAgent, ReportExample } from "./invest-report-example";
import { previewSpecialists } from "./invest-research-preview";

const synthesisSections = [
  { key: "agreement", label: "Onde concordam", icon: Check, color: "text-emerald-800 dark:text-emerald-300" },
  { key: "divergence", label: "Onde divergem", icon: GitCompareArrows, color: "text-sky-800 dark:text-sky-300" },
  { key: "review", label: "O que falta revisar", icon: ClipboardCheck, color: "text-amber-800 dark:text-amber-300" },
] as const;

export function RafaelSynthesis({ example, expanded = false }: { example: ReportExample; expanded?: boolean }) {
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

export function OpinionDisclosure({ id, example }: {
  id: ReportAgent;
  example: ReportExample;
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
        <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Concluído</span>
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
    </div>
  </details>;
}

export function CommitteePortrait({ id, className = "", eager = false }: {
  id: ReportAgent; className?: string; eager?: boolean;
}) {
  return <img src={`/comites/personas_fotos/relatorio/${id}.webp`} alt="" width={320} height={569}
    loading={eager ? "eager" : "lazy"} decoding="async" className={`object-cover object-[center_30%] ${className}`} />;
}

export function InvestReportCommittee({ example, onAsk }: {
  example: ReportExample; onAsk: (id: ReportAgent) => void;
}) {
  const [specialist, setSpecialist] = useState<Exclude<ReportAgent, "rafael">>(previewSpecialists[0]);
  const opinion = example.opinions[specialist];
  return <section id="pareceres-comite" aria-labelledby="opinions-title" className="scroll-mt-24 rounded-2xl border border-border bg-card p-4 sm:p-5">
    <h2 id="opinions-title" className="text-xl font-bold">Mesa do comitê</h2>
    <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="flex items-center gap-3 rounded-xl bg-[#163c30] p-3 text-white lg:flex-col lg:items-start lg:p-4">
        <CommitteePortrait id="rafael" className="h-20 w-20 shrink-0 rounded-lg lg:h-32 lg:w-full" />
        <div>
          <p className="text-lg font-bold">Rafael</p>
          <p className="text-xs font-semibold text-[#c5e9d7]">Líder do comitê · Moderador</p>
          <p className="mt-1 text-sm leading-snug text-[#e1eee7]">Conduz o debate, medeia divergências e apresenta a conclusão da equipe.</p>
        </div>
      </div>
      <div className="min-w-0 rounded-xl border border-border bg-background p-3 sm:p-4">
        <h3 className="text-sm font-semibold">Os nove especialistas</h3>
        <p className="mt-1 text-xs text-muted-foreground">Selecione um agente para abrir seu parecer.</p>
        <div role="group" aria-label="Especialistas do comitê" className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-3 xl:grid-cols-5">
          {previewSpecialists.map(id => <button key={id} type="button" aria-pressed={specialist === id} onClick={() => setSpecialist(id)}
            className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border p-1.5 text-xs font-semibold motion-safe:transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 ${specialist === id ? "border-emerald-600 bg-emerald-50 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100" : "border-transparent hover:bg-muted"}`}>
            <CommitteePortrait id={id} className="h-10 w-10 rounded-full" />
            {CVS[id].nome}
          </button>)}
        </div>
      </div>
    </div>
    <div key={specialist} aria-live="polite" className="mt-3 rounded-xl border border-border bg-background p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
      <p className="text-xs font-medium text-muted-foreground">{CVS[specialist].papel}</p>
      <h3 className="mt-1 font-bold">Parecer de {CVS[specialist].nome}</h3>
      <p className="my-2 text-sm leading-relaxed">{opinion.finding}</p>
      <SourceLinks ids={opinion.sources} sources={example.sources} />
      <button type="button" onClick={() => onAsk(specialist)} className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-800 underline dark:text-emerald-300">
        <MessageCircle aria-hidden="true" className="h-4 w-4" /> Perguntar a {CVS[specialist].nome}
      </button>
    </div>
  </section>;
}
