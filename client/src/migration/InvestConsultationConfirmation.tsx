import { useState } from "react";
import { ArrowLeft, Check, FileText } from "lucide-react";
import { Link } from "wouter";
import { b3EquityPath, type ListedEquity } from "./b3-equity-selection";
import { previewCreditRates, type PreviewCreditEvent } from "./invest-preview-credits";

export default function InvestConsultationConfirmation({ company, balance, onConfirm, onStartDemo }: {
  company: ListedEquity;
  balance: number;
  onConfirm: (event: PreviewCreditEvent) => void;
  onStartDemo?: () => void;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [confirmedBalance, setConfirmedBalance] = useState<number>();
  const cost = previewCreditRates.analysis;
  const projectedBalance = confirmedBalance ?? balance - cost;
  const back = onStartDemo ? "/investments/inicio" : b3EquityPath;

  function confirm() {
    if (balance < cost || confirmedBalance !== undefined) return;
    onConfirm({ id, type: "spend", credits: cost, label: `Análise de ${company.ticker}` });
    setConfirmedBalance(balance - cost);
    onStartDemo?.();
  }

  return <section aria-labelledby="confirm-consultation" className="mx-auto max-w-2xl space-y-4">
    <Link href={back} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-teal-900 underline">
      <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Trocar empresa
    </Link>
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <header className="bg-[#163c30] p-5 text-white sm:p-6">
        <p className="text-xs font-semibold text-[#bce1ce]">Comitê de renda variável · {company.ticker}</p>
        <h1 id="confirm-consultation" className="mt-1 text-2xl font-bold tracking-tight">{company.name}</h1>
        <p className="mt-2 text-sm text-[#e5f3eb]">O relatório inclui os pareceres dos nove especialistas e a síntese de Rafael.</p>
      </header>
      <div className="space-y-4 p-4 sm:p-5">
        <div>
          <h2 className="flex items-center gap-2 font-bold"><FileText aria-hidden="true" className="h-4 w-4 text-emerald-700" /> Confira os créditos da análise</h2>
          <p className="mt-1 text-sm text-muted-foreground">O consumo mostrado aqui usa uma taxa de exemplo.</p>
        </div>
        <dl className="grid grid-cols-3 gap-2">
          {([
            ["Saldo de teste", confirmedBalance === undefined ? balance : confirmedBalance + cost],
            ["Usa nesta análise", cost],
            ["Saldo após confirmar", projectedBalance < 0 ? null : projectedBalance],
          ] as const).map(([label, amount]) => <div key={label} className="min-w-0 rounded-lg border border-border bg-background p-2 sm:p-3">
            <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums">{amount ?? "—"} {amount !== null && <span className="block text-xs font-normal sm:inline">créditos</span>}</dd>
          </div>)}
        </dl>
        {confirmedBalance !== undefined ? <p role="status" className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-950">
          <Check aria-hidden="true" className="h-4 w-4 shrink-0" /> Confirmação simulada. Saldo de teste: {confirmedBalance} créditos.
        </p> : projectedBalance < 0 ? <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Faltam {-projectedBalance} créditos no saldo de teste.</p>
          : <button type="button" onClick={confirm} className="min-h-11 rounded-lg bg-[#245e46] px-4 text-sm font-semibold text-white hover:bg-[#184a36]">
            {onStartDemo ? "Confirmar créditos e simular pesquisa" : "Simular confirmação"}
          </button>}
        <Link href="/investments/credits" className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-900 underline">Ver planos e recarregar créditos</Link>
      </div>
    </div>
  </section>;
}
