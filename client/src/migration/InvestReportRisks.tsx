import { ShieldAlert } from "lucide-react";
import { SourceLinks } from "./InvestReportConversation";
import type { ReportRisk, ReportSources } from "./invest-report-example";

const severityLabels: Record<ReportRisk["severity"], { label: string; color: string }> = {
  high: { label: "alta", color: "bg-rose-100 text-rose-950 dark:bg-rose-950 dark:text-rose-100" },
  medium: { label: "média", color: "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100" },
  undetermined: { label: "indeterminada", color: "bg-muted text-foreground" },
};

export default function InvestReportRisks({ risks, sources }: { risks: readonly ReportRisk[]; sources: ReportSources }) {
  return <section id="riscos-consolidados" aria-labelledby="risks-title" className="scroll-mt-20 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
    <div className="flex items-center gap-2">
      <ShieldAlert aria-hidden="true" className="h-5 w-5 shrink-0 text-amber-800 dark:text-amber-300" />
      <h2 id="risks-title" className="text-xl font-bold">Riscos consolidados</h2>
    </div>
    <p className="mt-1 text-sm text-muted-foreground">Na simulação, a gravidade considera o impacto possível. A classificação fica em aberto quando faltam dados.</p>
    <ul className="mt-4 grid gap-3 lg:grid-cols-3">
      {risks.map(risk => {
        const severity = severityLabels[risk.severity];
        return <li key={risk.title} className="flex min-w-0 flex-col rounded-lg border border-border bg-background p-3 sm:p-4">
          <p className={`self-start rounded-md px-2 py-0.5 text-xs font-semibold ${severity.color}`}>Gravidade {severity.label}</p>
          <h3 className="mt-2 text-base font-bold">{risk.title}</h3>
          <p className="mb-3 mt-1 text-sm leading-relaxed">{risk.impact}</p>
          <div className="mt-auto space-y-3 border-t border-border pt-2">
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">{risk.sources.length > 1 ? "Fontes fictícias" : "Fonte fictícia"}</p>
              <SourceLinks ids={risk.sources} sources={sources} />
            </div>
            <div className="border-t border-border pt-2">
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">O que faria reavaliar</p>
              <p className="mt-1 text-sm leading-relaxed">{risk.review}</p>
            </div>
          </div>
        </li>;
      })}
    </ul>
  </section>;
}
