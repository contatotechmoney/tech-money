import { useReducer, useState } from "react";
import { BarChart3, Check, ShieldCheck, Wallet } from "lucide-react";

const offers = [
  { id: "avulso", name: "Pacote avulso", size: 5, price: 2990, period: "pagamento único" },
  { id: "pro20", name: "Profissional 20", size: 20, price: 10990, period: "por mês" },
  { id: "pro50", name: "Profissional 50", size: 50, price: 24990, period: "por mês" },
] as const;
type Offer = typeof offers[number];
type Event = { orderId: string; offer: Offer };
type Balance = { prepaid: number; monthly: number; entries: Event[]; notice: string };
const empty: Balance = { prepaid: 0, monthly: 0, entries: [], notice: "" };

// Local demonstration only. A repeated confirmation for the same order grants nothing.
function confirmSimulatedOrder(state: Balance, event: Event): Balance {
  if (state.entries.some(entry => entry.orderId === event.orderId)) {
    return { ...state, notice: "Confirmação já processada. O saldo de teste não mudou." };
  }
  const prepaid = event.offer.id === "avulso";
  return {
    prepaid: state.prepaid + (prepaid ? event.offer.size : 0),
    monthly: prepaid ? state.monthly : event.offer.size,
    entries: [...state.entries, event],
    notice: prepaid ? "5 consultas avulsas adicionadas ao saldo de teste." :
      `Franquia de teste atualizada para ${event.offer.size} consultas mensais. O saldo avulso foi preservado.`,
  };
}
const brl = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const percent = (ratio: number) => new Intl.NumberFormat("pt-BR", {
  style: "percent", maximumFractionDigits: 1,
}).format(ratio);

// Public Stripe BR domestic card rate, used only as a scenario. No payment integration.
const cardFee = (cents: number) => Math.round(cents * 399 / 10000) + 39;
const aiCeilingUsd = 0.010317;
const scenarioBrlPerUsd = 6;

function DeliveryCostScenario({ offer }: { offer: Offer }) {
  const { price, size: packSize } = offer;
  const fee = cardFee(price);
  const [fixed, setFixed] = useState("180");
  const [volume, setVolume] = useState("200");
  const [extra, setExtra] = useState("0");
  const ai = aiCeilingUsd * scenarioBrlPerUsd * 100;
  const valid = [fixed, volume, extra].every(value => value.trim() && Number.isFinite(Number(value))) &&
    Number(fixed) >= 0 && Number(extra) >= 0 && Number.isInteger(Number(volume)) && Number(volume) > 0;
  const delivery = valid ? ai + Number(extra) * 100 + Number(fixed) * 100 / Number(volume) : null;
  const total = delivery === null ? null : delivery + fee / packSize;
  const contribution = total === null ? null : price - total * packSize;
  const capacity = price * 0.30 / packSize - fee / packSize - ai - Number(extra) * 100;
  const minimumVolume = valid && capacity > 0 ? Math.ceil(Number(fixed) * 100 / capacity) : null;
  return <section aria-labelledby="delivery-scenario" className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
    <div>
      <h2 id="delivery-scenario" className="text-xl font-bold">Custo total por consulta</h2>
      <p className="mt-2 text-sm text-slate-600">Simulação interna. Substitua os valores de exemplo pelos custos e pelo volume do Invest. O cálculo de {offer.name} supõe que o cliente usa as {packSize} consultas incluídas.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {([
        ["Infraestrutura e dados fixos (R$/mês)", fixed, setFixed, "0.01", "0"],
        ["Consultas entregues por mês", volume, setVolume, "1", "1"],
        ["Outros custos variáveis (R$/consulta)", extra, setExtra, "0.01", "0"],
      ] as const).map(([label, value, change, step, min]) => <label key={label} className="block text-sm font-medium">
        {label}
        <input type="number" min={min} step={step} value={value} onChange={event => change(event.target.value)}
          className="mt-1 block w-full rounded border px-3 py-2" />
      </label>)}
    </div>
    <p className="text-xs leading-relaxed text-slate-600">Inclua dados por chamada, suporte e revisão no custo variável, se houver. O exemplo de R$ 180/mês é uma referência de infraestrutura, não uma fatura. A IA usa o teto de US$ 0,010317 do modelo padrão e câmbio hipotético de R$ 6,00/US$. O pagamento usa a tarifa pública de cartão nacional.</p>
    {total === null || contribution === null ? <p role="alert" className="text-sm text-red-700">Informe custos não negativos e um volume mensal inteiro maior que zero.</p> :
      <div role="status" className="rounded-lg bg-teal-50 p-4 text-sm text-teal-950">
        <p><strong>{brl(total)} por consulta</strong> · IA, outros custos variáveis, custos fixos rateados e pagamento.</p>
        <p className="mt-1"><strong>{brl(contribution)} de sobra por pagamento ({percent(contribution / price)})</strong>, antes de impostos e estornos.</p>
        <p className="mt-1">{minimumVolume === null ? "Com esses custos por consulta, não é possível atingir 70% de margem neste preço." : minimumVolume > 0 ? `Para atingir 70% neste cenário, são necessárias ao menos ${minimumVolume.toLocaleString("pt-BR")} consultas entregues por mês.` : "Sem custos fixos informados, este cenário já alcança 70% de margem."}</p>
      </div>}
  </section>;
}

export default function ConsultationPackPreview() {
  const [balance, confirm] = useReducer(confirmSimulatedOrder, empty);
  const [selected, setSelected] = useState<Offer["id"]>("avulso");
  const comparison = offers.find(offer => offer.id === selected) ?? offers[0];
  const last = balance.entries.at(-1);

  function simulate(offer: Offer) {
    confirm({ offer, orderId: crypto.randomUUID() });
  }

  return <section aria-labelledby="pack-heading" className="space-y-5">
    <header>
      <p className="text-xs font-semibold uppercase tracking-widest text-teal-800">Prévia comercial · sem cobrança</p>
      <h1 id="pack-heading" className="mt-2 text-3xl font-bold tracking-tight">Créditos &amp; Planos</h1>
      <p className="mt-2 text-sm text-slate-600">Recarregue quando precisar ou escolha uma franquia mensal para uso profissional.</p>
    </header>
    <section aria-labelledby="preview-balance" className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-teal-950 sm:p-5">
      <div className="flex items-center gap-2"><Wallet aria-hidden="true" className="h-5 w-5" /><h2 id="preview-balance" className="font-semibold">Saldo de teste</h2></div>
      <div role="status" className="mt-2">
        <p className="text-2xl font-bold">{balance.prepaid + balance.monthly} consultas de teste</p>
        <p className="mt-1 text-sm">{balance.prepaid} avulsas · {balance.monthly} na franquia profissional</p>
        {balance.notice && <p className="mt-2 text-sm">{balance.notice}</p>}
      </div>
    </section>
    <div className="grid gap-4 lg:grid-cols-3">
      {offers.map(offer => <article key={offer.id} className="flex flex-col overflow-hidden rounded-xl border border-teal-200 bg-white shadow-sm">
        <div className={offer.id === "avulso" ? "bg-teal-950 p-4 text-white" : "bg-slate-50 p-4 text-slate-900"}>
          <BarChart3 aria-hidden="true" className="mb-2 h-5 w-5" />
          <h2 className="text-lg font-bold">{offer.name}</h2>
          <p className="mt-1 text-sm">{offer.size} consultas {offer.id === "avulso" ? "de renda variável" : "por mês"}</p>
          <p className="mt-3 text-2xl font-bold tabular-nums">{brl(offer.price)}<span className="ml-1 text-xs font-normal">{offer.period}</span></p>
          <p className="mt-1 text-sm">{brl(offer.price / offer.size)} por consulta incluída</p>
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <p className="text-sm text-slate-700">{offer.id === "avulso"
            ? "Cada recarga acrescenta 5 consultas ao saldo avulso. Sem renovação automática."
            : "Proposta de assinatura. A franquia do plano fica separada das consultas compradas à parte."}</p>
          <button type="button" onClick={() => simulate(offer)}
            className="mt-auto rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-50">
            {offer.id === "avulso" ? "Simular recarga de 5" : `Simular plano de ${offer.size}`}
          </button>
        </div>
      </article>)}
    </div>
    <ul className="grid gap-2 rounded-lg border bg-white p-4 text-sm text-slate-700">
      {["Uma consulta cobre um ativo, com nove especialistas e a síntese do Rafael.",
        "Reabrir um relatório salvo não usa outra consulta.",
        "Se o relatório não for entregue, a consulta volta ao saldo.",
      ].map(rule => <li key={rule} className="flex gap-2"><Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />{rule}</li>)}
    </ul>
    {last && <details className="rounded-lg border bg-white p-4 text-sm">
      <summary className="cursor-pointer font-semibold">Histórico da simulação</summary>
      <ul className="mt-3 space-y-2">{balance.entries.slice().reverse().map(entry =>
        <li key={entry.orderId} className="border-b pb-2">{entry.offer.name} · {entry.offer.size} consultas · confirmação fictícia</li>
      )}</ul>
      <button type="button" className="mt-3 rounded border px-3 py-2" onClick={() => confirm(last)}>Repetir última confirmação de teste</button>
    </details>}
    <details className="rounded-xl border bg-white p-4">
      <summary className="cursor-pointer font-semibold">Comparar custos e margens das ofertas</summary>
      <p className="mt-3 text-sm text-slate-600">Preços profissionais propostos. Compare a margem com uso integral das consultas e a <a className="underline" href="https://stripe.com/br/pricing" target="_blank" rel="noreferrer">tarifa pública de cartão nacional</a>.</p>
      <label className="my-3 block text-sm font-medium">Oferta para simular
        <select className="mt-1 block rounded border bg-white px-3 py-2" value={selected}
          onChange={event => setSelected(event.target.value as Offer["id"])}>
          {offers.map(offer => <option key={offer.id} value={offer.id}>{offer.name}</option>)}
        </select>
      </label>
      <DeliveryCostScenario offer={comparison} />
    </details>
    <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      O saldo é fictício e reinicia ao recarregar a página. Não há pagamentos, assinaturas reais nem execução de análises.
    </p>
  </section>;
}
