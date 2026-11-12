import { useEffect, useState, type FormEvent } from "react";
import { EQUITY_MODELS, type EquityBudget } from "@shared/equity-committee-budget";
import { Link } from "wouter";
import { formatPreviewUsd as usd, type PreviewBudget, type PreviewCompany } from "./invest-research-preview";

type ExampleRow = { agentId: string; inputTokens: number; outputTokens: number; costUsdMicros: number };
type Preview = EquityBudget & { source: string; example: ExampleRow[] };
const integer = new Intl.NumberFormat("pt-BR");

export default function EquityBudgetPage({ initialTicker = "", company, onStartPreview }: {
  initialTicker?: string; company?: PreviewCompany; onStartPreview?: (budget: PreviewBudget) => void;
}) {
  const [ticker, setTicker] = useState(initialTicker);
  const [model, setModel] = useState<string>(EQUITY_MODELS[0]);
  const [quote, setQuote] = useState<Preview>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setTicker(initialTicker);
    setQuote(undefined);
    setError("");
  }, [initialTicker]);

  useEffect(() => {
    if (!quote) return;
    const timer = setTimeout(() => {
      setQuote(undefined);
      setError("A consulta expirou. Calcule novamente para atualizar a tarifa.");
    }, Math.max(0, quote.tariff.validUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [quote]);

  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const requestedTicker = ticker.trim().toUpperCase();
    setLoading(true); setError(""); setQuote(undefined);
    try {
      const params = new URLSearchParams({ ticker: requestedTicker, model });
      const response = await fetch(`/api/investments/equity-budget?${params}`, { cache: "no-store" });
      if (!response.ok) throw Error();
      const result: Preview = await response.json();
      if (result.ticker !== requestedTicker || result.tariff.modelId !== model || result.tariff.validUntil <= Date.now()) throw Error();
      setQuote(result);
    } catch {
      setError("Não foi possível calcular o teto com a tarifa atual. Nenhuma análise foi iniciada.");
    } finally {
      setLoading(false);
    }
  }

  function startPreview() {
    if (!company || !onStartPreview || !quote || quote.ticker !== company.ticker || quote.tariff.modelId !== model) return;
    if (quote.tariff.validUntil <= Date.now()) {
      setQuote(undefined);
      setError("O orçamento expirou. Recalcule para continuar a simulação.");
      return;
    }
    onStartPreview({ ticker: quote.ticker, modelId: quote.tariff.modelId, maxUsdMicros: quote.maxUsdMicros, validUntil: quote.tariff.validUntil });
  }

  return <section className="space-y-5 rounded-xl border bg-white p-4 sm:p-6">
    <div>
      {company && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-teal-800">Etapa 2 de 4 · Orçamento da simulação</p>}
      <h1 className="text-2xl font-bold">Orçamento do comitê de renda variável</h1>
      {company && <p className="mt-2 text-sm font-semibold">{company.name} · {company.ticker} <Link href="/investments/inicio" className="ml-2 font-normal text-teal-900 underline">Trocar empresa</Link></p>}
      <p className="mt-2 text-sm text-slate-600">Calcule o teto de referência para um ativo: nove pareceres e uma síntese do Rafael.</p>
    </div>
    <form onSubmit={preview} className="flex flex-wrap items-end gap-3">
      <label className="text-sm font-medium">Código do ativo
        <input required pattern="[A-Za-z0-9]{1,12}" maxLength={12} placeholder="Ex.: BBAS3" value={ticker} readOnly={!!company} disabled={loading}
          onChange={e => { setTicker(e.target.value.toUpperCase()); setQuote(undefined); }}
          className="mt-1 block w-36 rounded border px-3 py-2" />
      </label>
      <label className="text-sm font-medium">Modelo Nous
        <select value={model} disabled={loading} onChange={e => { setModel(e.target.value); setQuote(undefined); }}
          className="mt-1 block max-w-full rounded border px-3 py-2">
          <option value={EQUITY_MODELS[0]}>DeepSeek V4.1 Flash</option>
          <option value={EQUITY_MODELS[1]}>DeepSeek V4.1 Flash (:US)</option>
        </select>
      </label>
      <button disabled={loading} className="rounded bg-teal-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {loading ? "Consultando tarifa…" : "Calcular teto sem executar"}
      </button>
    </form>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {quote && <div className="space-y-4">
      <div role="status" className="rounded-xl bg-teal-950 p-5 text-white sm:p-6">
        <p className="text-sm font-semibold text-teal-100">Teto total de referência</p>
        <p className="my-2 break-words text-3xl font-bold tabular-nums tracking-tight sm:text-5xl">{usd(quote.maxUsdMicros)}</p>
        <p className="text-sm font-medium">{quote.ticker} · {quote.maxCalls} chamadas, sem repetição</p>
        <p className="mt-1 text-sm text-teal-100">Custo de IA pela tarifa pública. Nenhuma cobrança foi feita.</p>
      </div>
      {company && onStartPreview && <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
        <p className="text-sm text-teal-950">Este valor é uma referência de custo de IA. Avançar abre apenas a pesquisa fictícia desta empresa.</p>
        <button type="button" onClick={startPreview} className="mt-3 min-h-11 rounded-lg bg-teal-800 px-4 text-sm font-semibold text-white">Confirmar orçamento e simular pesquisa</button>
      </div>}
      <details className="group rounded-lg border bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg p-4 text-sm font-semibold text-teal-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 [&::-webkit-details-marker]:hidden">
          <span>Detalhamento dos 10 agentes <span className="block text-xs font-normal text-slate-600">Nove especialistas e Rafael, o moderador</span></span>
          <span aria-hidden="true" className="shrink-0 text-lg text-teal-800"><span className="group-open:hidden">+</span><span className="hidden group-open:inline">−</span></span>
        </summary>
        <div className="overflow-x-auto border-t px-4 pb-2">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead><tr><th scope="col" className="py-2">Agente</th><th scope="col">Limite de entrada</th><th scope="col">Limite de saída</th><th scope="col">Teto por chamada</th></tr></thead>
            <tbody>{quote.agents.map(agent => <tr key={agent.id} className="border-t">
              <th scope="row" className="py-2 pr-3 font-medium">{agent.name}<span className="block text-xs font-normal text-slate-600">{agent.role}</span></th>
              <td>{integer.format(agent.inputTokens)}</td><td>{integer.format(agent.outputTokens)}</td><td className="whitespace-nowrap">{usd(agent.maxUsdMicros)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </details>
      <p className="text-sm text-slate-600">
        Por milhão de tokens: {usd(quote.tariff.inputUsdMicrosPerMillion)} na entrada e {usd(quote.tariff.outputUsdMicrosPerMillion)} na saída.
        {" "}<a className="underline" href={quote.source} target="_blank" rel="noreferrer">Catálogo público da Nous</a>.
        Não inclui dados, ferramentas ou impostos. Tarifa efetiva da conta e contagem de tokens ainda pendentes de validação.
      </p>
      <details className="rounded border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Ver exemplo de registro por chamada</summary>
        <p className="my-2 text-slate-600">Dados fictícios; nenhum token real consumido. Os registros abaixo demonstram como o Invest detalha o consumo por agente.</p>
        <div className="overflow-x-auto"><table className="w-full text-left">
          <thead><tr><th scope="col">Agente</th><th scope="col">Entrada simulada</th><th scope="col">Saída simulada</th><th scope="col">Custo simulado</th></tr></thead>
          <tbody>{quote.example.map(row => <tr key={row.agentId} className="border-t">
            <th scope="row" className="py-2 pr-3 font-medium">{quote.agents.find(agent => agent.id === row.agentId)?.name}</th>
            <td>{integer.format(row.inputTokens)}</td><td>{integer.format(row.outputTokens)}</td><td>{usd(row.costUsdMicros)}</td>
          </tr>)}</tbody>
        </table></div>
      </details>
    </div>}
    <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">Análises reais bloqueadas até aprovação explícita do valor. Esta tela não executa agentes nem debita créditos.</p>
  </section>;
}
