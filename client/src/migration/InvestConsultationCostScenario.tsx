import { useState } from "react";
import { consultationCurrency as brl, consultationOffers as offers, type ConsultationOffer as Offer } from "@shared/invest-consultation-offers";
import { previewCreditRates } from "./invest-preview-credits";

const percent = (ratio: number) => new Intl.NumberFormat("pt-BR", {
  style: "percent", maximumFractionDigits: 1,
}).format(ratio);

const aiCeilingUsd = 0.010317;
const scenarioBrlPerUsd = 6;

function DeliveryCostScenario({ offer }: { offer: Offer }) {
  const { price, sampleCredits } = offer;
  const packSize = Math.floor(sampleCredits / previewCreditRates.analysis);
  const [fixed, setFixed] = useState("180");
  const [volume, setVolume] = useState("200");
  const [extra, setExtra] = useState("0");
  const [paymentCost, setPaymentCost] = useState("0");
  const fee = Number(paymentCost) * 100;
  const ai = aiCeilingUsd * scenarioBrlPerUsd * 100;
  const valid = [fixed, volume, extra, paymentCost].every(value => value.trim() && Number.isFinite(Number(value)) && Number(value) >= 0) &&
    Number.isInteger(Number(volume)) && Number(volume) > 0;
  const delivery = valid ? ai + Number(extra) * 100 + Number(fixed) * 100 / Number(volume) : null;
  const total = delivery === null ? null : delivery + fee / packSize;
  const contribution = total === null ? null : price - total * packSize;
  const capacity = price * 0.30 / packSize - fee / packSize - ai - Number(extra) * 100;
  const minimumVolume = valid && capacity > 0 ? Math.ceil(Number(fixed) * 100 / capacity) : null;
  return <section aria-labelledby="delivery-scenario" className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm sm:p-6">
    <div>
      <h2 id="delivery-scenario" className="text-xl font-bold">Cenário de uso exclusivo em relatórios</h2>
      <p className="mt-2 text-sm text-slate-600">O cenário de {offer.name} usa os {sampleCredits} créditos fictícios somente em análises, o equivalente a {packSize} relatórios no exemplo. Conversa e monitoramento exigem estimativas próprias.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {([
        ["Infraestrutura e dados fixos (R$/mês)", fixed, setFixed, "0.01", "0"],
        ["Consultas entregues por mês", volume, setVolume, "1", "1"],
        ["Outros custos variáveis (R$/consulta)", extra, setExtra, "0.01", "0"],
        ["Custo do pagamento (R$ por pacote)", paymentCost, setPaymentCost, "0.01", "0"],
      ] as const).map(([label, value, change, step, min]) => <label key={label} className="block text-sm font-medium">
        {label}
        <input type="number" min={min} step={step} value={value} onChange={event => change(event.target.value)}
          className="mt-1 block w-full rounded border px-3 py-2" />
      </label>)}
    </div>
    <p className="text-xs leading-relaxed text-slate-600">Inclua a tarifa contratada de pagamento e os custos de dados, suporte e revisão. O cenário usa US$ 0,010317 por análise e câmbio fictício de R$ 6,00 por dólar.</p>
    {total === null || contribution === null ? <p role="alert" className="text-sm text-red-700">Informe custos não negativos e um volume mensal inteiro maior que zero.</p> :
      <div role="status" className="rounded-lg bg-teal-50 p-4 text-sm text-teal-950">
        <p><strong>{brl(total)} por consulta</strong> · IA, outros custos variáveis, custos fixos rateados e pagamento.</p>
        <p className="mt-1"><strong>{brl(contribution)} de sobra por pagamento ({percent(contribution / price)})</strong>, antes de impostos e estornos.</p>
        <p className="mt-1">{minimumVolume === null ? "Com esses custos por consulta, não é possível atingir 70% de margem neste preço." : minimumVolume > 0 ? `Para atingir 70% neste cenário, são necessárias ao menos ${minimumVolume.toLocaleString("pt-BR")} consultas entregues por mês.` : "Sem custos fixos informados, este cenário já alcança 70% de margem."}</p>
      </div>}
  </section>;
}

export default function InvestConsultationCostScenario() {
  const [selected, setSelected] = useState<Offer["id"]>("avulso");
  const comparison = offers.find(offer => offer.id === selected) ?? offers[0];
  return <details className="rounded-xl border bg-white p-4">
      <summary className="cursor-pointer font-semibold">Comparar custos e margens das ofertas</summary>
      <p className="mt-3 text-sm text-slate-600">Valores em estudo. Simule a margem com os créditos usados integralmente em análises.</p>
      <label className="my-3 block text-sm font-medium">Oferta para simular
        <select className="mt-1 block rounded border bg-white px-3 py-2" value={selected}
          onChange={event => setSelected(event.target.value as Offer["id"])}>
          {offers.map(offer => <option key={offer.id} value={offer.id}>{offer.name}</option>)}
        </select>
      </label>
      <DeliveryCostScenario offer={comparison} />
    </details>;
}
