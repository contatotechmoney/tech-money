import { Calculator } from "lucide-react";
import { formatBRL } from "@/lib/investment-api";
import { SourceLinks } from "./InvestReportConversation";
import type { ReportSources } from "./invest-report-example";
import { fairValueRangeCents, valuationScenariosFor } from "./invest-report-valuation";

const multiple = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export default function InvestReportValuation({ ticker, sources }: { ticker: string; sources: ReportSources }) {
  return <section id="valuation" aria-labelledby="valuation-title" className="scroll-mt-20 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
    <div className="flex items-center gap-2">
      <Calculator aria-hidden="true" className="h-5 w-5 shrink-0 text-emerald-800 dark:text-emerald-300" />
      <h2 id="valuation-title" className="text-xl font-bold">Valuation</h2>
    </div>
    <p className="mt-1 text-sm text-muted-foreground">Faixas ilustrativas em reais por ação, com lucro e múltiplos fictícios.</p>
    <div className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-sm">
      <p className="font-semibold">Método do múltiplo preço/lucro (P/L)</p>
      <p className="mt-1 text-muted-foreground">Valor justo por ação = lucro por ação (LPA) projetado para 12 meses × múltiplo P/L assumido.</p>
    </div>
    <ul className="mt-4 grid gap-3 lg:grid-cols-3">
      {valuationScenariosFor(ticker).map(scenario => {
        const [minimum, maximum] = scenario.multiples;
        const earningsPerShare = scenario.projectedEarningsPerShareCents / 100;
        const [low, high] = fairValueRangeCents(scenario);
        return <li key={scenario.name} className={`flex min-w-0 flex-col rounded-lg border bg-background p-3 sm:p-4 ${scenario.name === "Base" ? "border-emerald-600/60" : "border-border"}`}>
          <h3 className="text-sm font-bold">{scenario.name}</h3>
          <p className="mt-2 text-xs font-semibold text-muted-foreground">Faixa de valor justo por ação</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-emerald-900 dark:text-emerald-200">{formatBRL(low / 100)} a {formatBRL(high / 100)}</p>
          <dl className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
            <div className="flex flex-wrap justify-between gap-x-2 gap-y-1">
              <dt className="text-muted-foreground">LPA projetado</dt>
              <dd className="font-semibold tabular-nums">{formatBRL(earningsPerShare)}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-2 gap-y-1">
              <dt className="text-muted-foreground">Faixa de P/L assumida</dt>
              <dd className="font-semibold tabular-nums">{multiple.format(minimum)}× a {multiple.format(maximum)}×</dd>
            </div>
          </dl>
          <p className="mt-3 border-t border-border pt-3 text-sm leading-relaxed">{scenario.assumption}</p>
        </li>;
      })}
    </ul>
    <div className="mt-3 border-t border-border pt-2">
      <p className="mb-1 text-xs font-semibold text-muted-foreground">Fontes fictícias de contexto</p>
      <SourceLinks ids={["demonstrativo", "comunicado"]} sources={sources} />
    </div>
  </section>;
}
