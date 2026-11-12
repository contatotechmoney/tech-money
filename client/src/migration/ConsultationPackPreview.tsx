import { useState } from "react";
import { InvestSandboxBilling, SandboxInvoiceLink, useInvestSandboxBilling } from "./InvestSandboxBilling";
import { BarChart3, Building2, CreditCard, Mail, Plus, ShieldCheck, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ConsultationOffer } from "@shared/invest-consultation-offers";
import { consultationCurrency as brl, consultationOffers as offers } from "@shared/invest-consultation-offers";
import { previewCreditBalance, previewCreditRates, type PreviewCreditEvent, type PreviewCreditWallet } from "./invest-preview-credits";

const resources = [
  { id: "analysis", label: "Relatórios de análise", basis: "por relatório de uma empresa" },
  { id: "voiceMinute", label: "Minutos de conversa com agentes especializados de IA", basis: "por minuto de conversa" },
  { id: "monitorCompanyMonth", label: "Empresas monitoradas por 30 dias", basis: "por empresa a cada 30 dias" },
] as const;

function UsagePreview({ wallet, onConfirm }: { wallet: PreviewCreditWallet; onConfirm: (event: PreviewCreditEvent) => void }) {
  const [units, setUnits] = useState({ analysis: 1, voiceMinute: 5, monitorCompanyMonth: 1 });
  const total = resources.reduce((sum, { id }) => sum + units[id] * previewCreditRates[id], 0);
  const remaining = previewCreditBalance(wallet) - total;

  return <section aria-labelledby="credit-usage" className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
    <div>
      <h2 id="credit-usage" className="text-lg font-bold">Simule o uso dos créditos</h2>
      <p className="mt-1 text-sm text-muted-foreground">As taxas abaixo são fictícias. Ajuste as quantidades para ver como os recursos compartilham o mesmo saldo.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {resources.map(({ id, label, basis }) => <div key={id} className="rounded-lg border border-border bg-background p-3">
        <label className="block text-sm font-semibold">{label}
          <input type="number" min={0} max={1000} step={1} value={units[id]} onChange={event => {
            const value = event.currentTarget.valueAsNumber;
            setUnits(current => ({ ...current, [id]: Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 1000) : 0 }));
          }} className="mt-2 block min-h-11 w-full rounded-lg border border-input bg-background px-3 tabular-nums" />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">{previewCreditRates[id]} créditos de teste {basis}</p>
        <p className="mt-1 text-sm font-bold tabular-nums">{units[id] * previewCreditRates[id]} créditos</p>
      </div>)}
    </div>
    <p className="text-xs text-muted-foreground">No acompanhamento, a confirmação indicará as empresas, o período e os canais de alerta, como e-mail ou WhatsApp, conforme disponibilidade.</p>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-teal-50 p-3 text-sm text-teal-950">
      <p role="status"><strong>{total} créditos de teste</strong> para este uso. {remaining < 0 ? `Faltariam ${-remaining} créditos.` : `Saldo após confirmar: ${remaining} créditos.`}</p>
      <button type="button" disabled={total === 0 || remaining < 0}
        onClick={() => onConfirm({ type: "spend", id: crypto.randomUUID(), credits: total, label: "Uso combinado de recursos" })}
        className="min-h-11 rounded-lg bg-[#245e46] px-4 text-sm font-semibold text-white hover:bg-[#184a36] disabled:opacity-50">
        Confirmar uso de teste
      </button>
    </div>
  </section>;
}

export default function ConsultationPackPreview({ wallet, onConfirm, customerPilot = false }: {
  customerPilot?: boolean;
  wallet: PreviewCreditWallet;
  onConfirm: (event: PreviewCreditEvent) => void;
}) {
  const billing = useInvestSandboxBilling(!customerPilot);
  const sandboxEnabled = billing.state.data?.enabled === true;
  const [order, setOrder] = useState<Extract<PreviewCreditEvent, { type: "load" }>>();

  function reviewPayment(offer: ConsultationOffer) {
    if (billing.processing) return;
    billing.resetPayment();
    setOrder({ id: crypto.randomUUID(), type: "load", offer });
  }

  return <section aria-labelledby="pack-heading" className="space-y-5">
    <header>
      <p className="text-xs font-semibold uppercase tracking-widest text-teal-800">Propostas comerciais · prévia sem cobrança</p>
      <h1 id="pack-heading" className="mt-2 text-3xl font-bold tracking-tight">Créditos &amp; Planos</h1>
      <p className="mt-2 text-sm text-slate-600">Use o mesmo saldo para análises, conversas com agentes especializados de IA e acompanhamento de empresas.</p>
    </header>
    <section aria-labelledby="preview-balance" className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-teal-950 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="preview-balance" className="flex items-center gap-2 font-semibold"><Wallet aria-hidden="true" className="h-5 w-5" /> Saldo de teste</h2>
        <button type="button" onClick={() => reviewPayment(offers[0])}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#245e46] px-3 text-sm font-semibold text-white">
          <Plus aria-hidden="true" className="h-4 w-4" /> Adicionar créditos
        </button>
      </div>
      <div role="status" className="mt-2">
        <p className="text-2xl font-bold">{previewCreditBalance(wallet)} créditos de teste</p>
        <p className="mt-1 text-sm">{wallet.prepaid} avulsos · {wallet.monthly} na franquia mensal</p>
        {wallet.notice && <p className="mt-2 text-sm">{wallet.notice}</p>}
      </div>
    </section>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {offers.map(offer => <article key={offer.id} className="flex flex-col overflow-hidden rounded-xl border border-teal-200 bg-white shadow-sm">
        <div className={offer.id === "avulso" ? "bg-teal-950 p-4 text-white" : "bg-slate-50 p-4 text-slate-900"}>
          <BarChart3 aria-hidden="true" className="mb-2 h-5 w-5" />
          <h2 className="text-lg font-bold">{offer.name}</h2>
          <p className="mt-1 text-sm">{offer.id === "avulso" ? "Saldo pré-pago" : "Franquia mensal de créditos"}</p>
          <p className="mt-3 text-2xl font-bold tabular-nums">{brl(offer.price)} <span className="text-xs font-normal">{offer.period}</span></p>
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <p className="text-sm text-slate-700">{offer.id === "avulso"
            ? "Adicione créditos conforme precisar."
            : offer.id === "essencial" ? "Para acompanhar empresas e fazer análises regularmente."
              : "Mais saldo mensal para combinar análises, conversas e monitoramento."}</p>
          <p className="text-xs text-slate-600"><strong>{offer.sampleCredits} créditos</strong> na simulação. Franquia comercial em estudo.</p>
          <button type="button" onClick={() => reviewPayment(offer)}
            className="mt-auto min-h-11 rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-50">
            {offer.id === "avulso" ? "Simular recarga" : `Simular ${offer.name}`}
          </button>
        </div>
      </article>)}
      <article className="flex flex-col overflow-hidden rounded-xl border border-teal-200 bg-white shadow-sm">
        <div className="bg-[#163c30] p-4 text-white">
          <Building2 aria-hidden="true" className="mb-2 h-5 w-5" />
          <h2 className="text-lg font-bold">Enterprise</h2>
          <p className="mt-1 text-sm text-[#d8eee3]">Para empresas e equipes</p>
          <p className="mt-3 text-2xl font-bold">Sob consulta</p>
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <p className="text-sm text-slate-700">Converse sobre o tamanho da equipe, a franquia de créditos e os recursos mais usados pela sua empresa.</p>
          <a href="mailto:contato@techmoney.com.br?subject=Plano%20Enterprise"
            className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-50">
            <Mail aria-hidden="true" className="h-4 w-4" /> Solicitar conversa
          </a>
          <p className="text-xs text-slate-600">Abre um e-mail para você enviar à Tech Money.</p>
        </div>
      </article>
    </div>
    <UsagePreview wallet={wallet} onConfirm={onConfirm} />
    <InvestSandboxBilling billing={billing} />
    {wallet.entries.length > 0 && <details className="rounded-lg border bg-white p-4 text-sm">
      <summary className="cursor-pointer font-semibold">Histórico da simulação</summary>
      <ul className="mt-3 space-y-2">{wallet.entries.slice().reverse().map(entry =>
        <li key={entry.id} className="border-b pb-2">{entry.type === "load"
          ? `${entry.offer.name} · ${entry.offer.sampleCredits} créditos adicionados`
          : `${entry.label} · ${entry.credits} créditos usados`}</li>
      )}</ul>
    </details>}
    <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      O saldo de teste reinicia ao recarregar. Valores, franquias e consumo comerciais estão em validação.
    </p>
    <Dialog open={!!order} onOpenChange={open => { if (!open) setOrder(undefined); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-xl">
        <DialogTitle className="flex items-center gap-2"><CreditCard aria-hidden="true" className="h-5 w-5 text-teal-800" /> Revisar pagamento de teste</DialogTitle>
        <DialogDescription>{sandboxEnabled ? "Você pode testar a fatura do Asaas com um cartão de teste ou conferir o fluxo na simulação local." : "Exemplo de checkout com cartão. A cobrança é fictícia."}</DialogDescription>
        {order && <>
          <dl className="grid gap-2 rounded-lg border border-border bg-muted p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><dt>Escolha</dt><dd className="font-semibold">{order.offer.name}</dd></div>
            <div className="flex flex-wrap justify-between gap-2"><dt>Créditos no exemplo</dt><dd className="font-semibold">{order.offer.sampleCredits}</dd></div>
            <div className="flex flex-wrap justify-between gap-2"><dt>Preço em estudo</dt><dd className="font-semibold">{brl(order.offer.price)} · {order.offer.period}</dd></div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => {
              onConfirm(order);
              setOrder(undefined);
            }} className="min-h-11 rounded-lg bg-[#245e46] px-4 text-sm font-semibold text-white">Simular pagamento com cartão</button>
            {sandboxEnabled && <button type="button" disabled={billing.processing}
              onClick={() => void billing.startOrder({ id: order.id, offer: order.offer.id })}
              className="min-h-11 rounded-lg border border-teal-700 px-4 text-sm font-semibold disabled:opacity-50">
              {billing.processing ? "Consultando…" : "Gerar fatura de teste do Asaas"}
            </button>}
            <button type="button" onClick={() => setOrder(undefined)} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">Voltar</button>
          </div>
          {sandboxEnabled && billing.feedback && <p role="status" className="text-sm">{billing.feedback}</p>}
          {sandboxEnabled && <SandboxInvoiceLink href={billing.invoice} />}
        </>}
      </DialogContent>
    </Dialog>
  </section>;
}
