import { useState } from "react";
import { ArrowRight, GitCompareArrows, ScanLine } from "lucide-react";
import { COMITE_RV, CVS } from "@shared/personas";
import { SourceLinks } from "./InvestReportConversation";
import type { ReportExample, ReportSourceId } from "./invest-report-example";
import { reportVotingFor } from "./invest-report-votes";

type EvidenceFilter = ReportSourceId | "missing";
const filterStyle = "min-h-11 rounded-lg border border-border px-3 py-2 text-left text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700";

export default function InvestCommitteeEvidence({ example }: { example: ReportExample }) {
  const [sourceId, setSourceId] = useState<EvidenceFilter>("demonstrativo");
  const citedBy = COMITE_RV.filter(id => sourceId === "missing"
    ? example.opinions[id].sources.length === 0
    : example.opinions[id].sources.includes(sourceId));

  return <section id="mapa-de-evidencias" aria-labelledby="evidence-map-title" className="scroll-mt-20 rounded-2xl border border-border bg-card p-4 sm:p-6">
    <h2 id="evidence-map-title" className="flex items-center gap-2 text-xl font-bold">
      <ScanLine aria-hidden="true" className="h-5 w-5 text-emerald-700 dark:text-emerald-300" /> Mapa de evidências do comitê
    </h2>
    <p className="mt-1 text-sm text-muted-foreground">Escolha uma fonte e compare como cada especialista a usou. Veja também quais pareceres ainda precisam de evidência.</p>
    <div role="group" aria-label="Filtrar pareceres por fonte" className="mt-4 flex flex-wrap gap-2">
      {([["demonstrativo", "Demonstrativo"], ["comunicado", "Comunicado"], ["cotacoes", "Cotações"], ["missing", "Sem fonte associada"]] as const).map(([id, label]) =>
        <button type="button" key={id} aria-pressed={sourceId === id} onClick={() => setSourceId(id)}
          className={`${filterStyle} ${sourceId === id ? "bg-[#245e46] text-white" : "bg-background hover:bg-muted"}`}>{label}</button>
      )}
    </div>
    <div className="mt-3 space-y-3">
      {sourceId !== "missing" && <SourceLinks ids={[sourceId]} sources={example.sources} />}
      <p role="status" className="text-sm font-medium">{citedBy.length} {citedBy.length === 1 ? "parecer" : "pareceres"} {sourceId === "missing" ? "sem fonte associada neste exemplo" : "com referência a esta fonte"}</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {citedBy.map(id => <li key={id} className="rounded-lg border border-border bg-background p-3">
          <p className="text-sm font-bold">{CVS[id].nome} <span className="font-normal text-muted-foreground">· {CVS[id].papel}</span></p>
          <p className="mt-1 text-sm leading-relaxed">{sourceId === "missing" ? example.opinions[id].review : example.opinions[id].finding}</p>
        </li>)}
      </ul>
    </div>
    <a href="#comparar-pareceres" className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-emerald-800 underline dark:text-emerald-300">
      Comparar dois pareceres <ArrowRight aria-hidden="true" className="h-4 w-4" />
    </a>

  </section>;
}

export function InvestVerdictHypotheses({ ticker }: { ticker: string }) {
  const [condition, setCondition] = useState<number>();
  const reviews = reportVotingFor(ticker).review;
  const selectedReview = condition === undefined ? undefined : reviews[condition];

  return <section id="testar-premissa" aria-labelledby="hypotheses-title" className="scroll-mt-20 rounded-2xl border border-border bg-card p-4 sm:p-6">
      <h2 id="hypotheses-title" className="flex items-center gap-2 text-lg font-bold"><GitCompareArrows aria-hidden="true" className="h-4 w-4 text-emerald-700 dark:text-emerald-300" /> Testar uma premissa</h2>
      <p className="mt-1 text-sm text-muted-foreground">Simule a confirmação de uma hipótese e veja como Rafael poderia rever a conclusão.</p>
      <div role="group" aria-label="Hipóteses de revisão" className="mt-3 grid gap-2 sm:grid-cols-2">
        {reviews.map((review, index) => <button key={review.condition} type="button" aria-pressed={condition === index}
          className={`${filterStyle} ${condition === index ? "border-emerald-600 bg-muted" : "bg-background hover:bg-muted"}`}
          onClick={() => setCondition(condition === index ? undefined : index)}>{review.condition}</button>)}
      </div>
      {selectedReview && <div role="status" className="mt-3 rounded-lg border border-border bg-background p-3 text-sm leading-relaxed">
        <p><strong>Dados a conferir.</strong> {selectedReview.evidence}</p>
        <p className="mt-2"><strong>Efeito hipotético no veredito.</strong> {selectedReview.effect}</p>
      </div>}
  </section>;
}
