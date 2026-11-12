import { CalendarDays } from "lucide-react";
import type { PreviewCompany } from "./invest-research-preview";

type CalendarEvent = {
  date: string;
  timing?: string;
  name: string;
  reviewTrigger: boolean;
  evidence: string;
  effect: string;
};

const exampleEvents: readonly CalendarEvent[] = [
  {
    date: "2026-11-12", timing: "Após o fechamento", name: "Notas explicativas do 3T26", reviewTrigger: true,
    evidence: "Quanto do avanço do resultado operacional veio de ganhos recorrentes e quanto veio de itens pontuais.",
    effect: "Se mais da metade do avanço vier de itens pontuais, Rafael descartaria a recorrência como explicação principal para a melhora do trimestre.",
  },
  {
    date: "2026-11-13", name: "Apresentação de resultados", reviewTrigger: false,
    evidence: "Conciliação entre os números do demonstrativo e a explicação da administração.",
    effect: "O comitê registra as explicações e confronta os dados publicados com as premissas do relatório.",
  },
  {
    date: "2026-12-02", timing: "Data estimada", name: "Atualização sobre concentração de clientes", reviewTrigger: false,
    evidence: "Participação dos maiores clientes na receita e mudanças em contratos relevantes.",
    effect: "Uma mudança sustentada na concentração ou em um contrato relevante abre a revisão do risco e do múltiplo de valuation.",
  },
  {
    date: "2027-02-18", timing: "Data estimada", name: "Resultados do 4T26", reviewTrigger: true,
    evidence: "Resultado recorrente do trimestre seguinte, comparado na mesma base.",
    effect: "Se o ganho recorrente explicar mais da metade do avanço do 3T26 e se sustentar no 4T26, Rafael passaria a priorizar a hipótese de recorrência.",
  },
];

const horizonEvents: readonly CalendarEvent[] = [
  {
    date: "2026-11-18", timing: "Após o fechamento", name: "Detalhamento da margem do 3T26", reviewTrigger: true,
    evidence: "Contribuição, em pontos percentuais, das perdas de produção, dos preços e da composição das vendas para a alta da margem.",
    effect: "Se a redução de perdas ou a composição das vendas for a maior contribuição e explicar mais da metade da alta, Rafael passaria a priorizar a explicação demonstrada.",
  },
  {
    date: "2026-11-19", name: "Apresentação de resultados", reviewTrigger: false,
    evidence: "Indicadores de perdas por unidade produzida, volume e margem por linha de produto.",
    effect: "O comitê confere se os números da apresentação fecham com a variação da margem no demonstrativo.",
  },
  {
    date: "2026-12-03", timing: "Data estimada", name: "Atualização sobre distribuição", reviewTrigger: false,
    evidence: "Fatia da receita dos principais distribuidores e mudanças em contratos.",
    effect: "Uma mudança sustentada na concentração ou em um contrato relevante abre a revisão do risco e do múltiplo de valuation.",
  },
  {
    date: "2027-02-18", timing: "Data estimada", name: "Resultados do 4T26", reviewTrigger: false,
    evidence: "Margem em base comparável e permanência dos ganhos de produção ou vendas.",
    effect: "Se os efeitos se sustentarem ou se reverterem, o comitê revê o lucro projetado e as faixas de preço.",
  },
];

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" });

export default function InvestReportCalendar({ company }: { company: PreviewCompany }) {
  const events = company.ticker === "HORIZ3" ? horizonEvents : exampleEvents;

  return <section id="calendario-de-eventos" aria-labelledby="calendar-title" className="scroll-mt-20 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
    <div className="flex items-center gap-2">
      <CalendarDays aria-hidden="true" className="h-5 w-5 shrink-0 text-emerald-800 dark:text-emerald-300" />
      <h2 id="calendar-title" className="text-xl font-bold">Calendário de resultados e eventos</h2>
    </div>
    <p className="mt-1 text-sm text-muted-foreground">{company.ticker} · Datas fictícias do relatório de <time dateTime={company.reportIso}>{company.reportDate}</time>.</p>
    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
      {events.map(event => <li key={event.date} className="min-w-0 rounded-lg border border-border bg-background p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <time dateTime={event.date} className="text-sm font-bold tabular-nums">{dateFormat.format(new Date(event.date))}</time>
          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${event.reviewTrigger ? "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100" : "bg-muted text-muted-foreground"}`}>
            {event.reviewTrigger ? "Gatilho de revisão do veredito" : "Acompanhamento"}
          </span>
        </div>
        <h3 className="mt-2 text-base font-bold">{event.name}</h3>
        {event.timing && <p className="mt-0.5 text-xs text-muted-foreground">{event.timing}</p>}
        <dl className="mt-3 space-y-2 border-t border-border pt-2 text-sm leading-relaxed">
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">Dados a acompanhar</dt>
            <dd className="mt-1">{event.evidence}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{event.reviewTrigger ? "O que mudaria o veredito" : "Como o comitê usaria os dados"}</dt>
            <dd className="mt-1">{event.effect}</dd>
          </div>
        </dl>
      </li>)}
    </ul>
    <a href="#rever-veredito" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800 underline underline-offset-2 dark:text-emerald-300">Ver condições de revisão do veredito</a>
  </section>;
}
