import { Target } from "lucide-react";
import { formatBRL } from "@/lib/investment-api";
import { entryPriceBandsFor } from "./invest-report-entry-bands";

const reviewTriggers = {
  example: {
    earnings: "O próximo resultado e as notas explicativas separam ganhos recorrentes de itens pontuais. Se isso mudar a projeção de lucro por ação, o comitê recalcula as faixas.",
    multiple: "Uma mudança na participação dos maiores clientes na receita ou em um contrato relevante leva o comitê a revisar o múltiplo assumido.",
  },
  horizon: {
    earnings: "O próximo demonstrativo separa o efeito das perdas de produção, dos preços e da composição das vendas sobre a margem. Se isso mudar a projeção de lucro por ação, o comitê recalcula as faixas.",
    multiple: "Uma mudança na participação dos maiores distribuidores na receita ou em um contrato relevante leva o comitê a revisar o múltiplo assumido.",
  },
};

export default function InvestReportEntryStrategy({ ticker }: { ticker: string }) {
  const entry = entryPriceBandsFor(ticker);
  if (!entry) return null;

  const { baseFloor, bands } = entry;
  const triggers = ticker === "HORIZ3" ? reviewTriggers.horizon : reviewTriggers.example;

  return <section id="estrategia-de-entrada" aria-labelledby="entry-title" className="scroll-mt-20 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
    <div className="flex items-center gap-2">
      <Target aria-hidden="true" className="h-5 w-5 shrink-0 text-emerald-800 dark:text-emerald-300" />
      <h2 id="entry-title" className="text-xl font-bold">Estratégia de entrada</h2>
    </div>
    <p className="mt-1 text-sm text-muted-foreground">Faixas fictícias para reavaliação, condicionadas à confirmação das premissas.</p>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 rounded-lg border border-border bg-background px-3 py-2 text-sm">
      <p className="min-w-0">A simulação aplica a margem de segurança de cada perfil ao piso do cenário base, de <strong>{formatBRL(baseFloor / 100)} por ação</strong>.</p>
      <a href="#valuation" className="inline-flex min-h-11 items-center font-semibold text-emerald-800 underline underline-offset-2 dark:text-emerald-300">Ver premissas do valuation</a>
    </div>
    <ul className="mt-4 grid gap-3 lg:grid-cols-3">
      {bands.map(({ profile, minimum, maximum, rationale, low, high }) => (
        <li key={profile} className="min-w-0 rounded-lg border border-border bg-background p-3 sm:p-4">
          <h3 className="text-sm font-bold">{profile}</h3>
          <p className="mt-1 text-lg font-bold tabular-nums text-emerald-900 dark:text-emerald-200">{formatBRL(low / 100)} a {formatBRL(high / 100)}</p>
          <p className="mt-1 text-xs font-semibold tabular-nums text-muted-foreground">Margem de segurança de {minimum}% a {maximum}%</p>
          <p className="mt-3 border-t border-border pt-2 text-sm leading-relaxed">{rationale}</p>
        </li>
      ))}
    </ul>
    <div className="mt-4 border-t border-border pt-3">
      <h3 className="text-base font-bold">O que faria o comitê rever as faixas</h3>
      <ul className="mt-2 grid gap-2 text-sm leading-relaxed sm:grid-cols-2">
        <li className="rounded-lg bg-muted px-3 py-2"><strong>Revisão do lucro projetado.</strong> {triggers.earnings}</li>
        <li className="rounded-lg bg-muted px-3 py-2"><strong>Revisão do múltiplo.</strong> {triggers.multiple}</li>
      </ul>
      <a href="#rever-veredito" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800 underline underline-offset-2 dark:text-emerald-300">Ver condições de revisão do veredito</a>
    </div>
  </section>;
}
