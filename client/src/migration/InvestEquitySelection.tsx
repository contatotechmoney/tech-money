import { useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { Link } from "wouter";
import { b3EquityReference, equityConfirmationPath, searchListedEquities } from "./b3-equity-selection";

export default function InvestEquitySelection() {
  const [query, setQuery] = useState("");
  const assets = searchListedEquities(query);
  return <div className="mx-auto max-w-4xl space-y-4">
    <header className="rounded-2xl bg-[#163c30] p-5 text-white sm:p-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Escolha uma ação da B3</h1>
      <p className="mt-2 text-sm leading-relaxed text-[#d8eee3]">Encontre a empresa e confira quantos créditos a análise vai usar antes de confirmar.</p>
    </header>
    <section aria-label="Lista inicial de ações" className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <label className="text-sm font-semibold" htmlFor="invest-equity-search">Buscar por nome ou código</label>
      <div className="relative mt-1">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <input id="invest-equity-search" type="search" value={query} onChange={event => setQuery(event.target.value)}
          placeholder="Ex.: Telefônica ou VIVT3" maxLength={80}
          className="min-h-11 w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700" />
      </div>
      <p role="status" className="mt-3 text-sm text-muted-foreground">{assets.length} {assets.length === 1 ? "ação" : "ações"} na lista inicial</p>
      {assets.length === 0 ? <p className="mt-2 rounded-lg bg-muted p-3 text-sm">Tente o nome da empresa ou o código de negociação.</p> :
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {assets.map(asset => <li key={asset.ticker}>
            <Link href={`${equityConfirmationPath}?ticker=${asset.ticker}`} aria-label={`Selecionar ${asset.name}, ${asset.ticker}`}
              className="flex h-full min-h-16 items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 hover:border-emerald-600 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
              <span className="min-w-0"><strong className="block text-sm">{asset.name}</strong><span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">{asset.ticker}</span></span>
              <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-800 dark:text-emerald-300" />
            </Link>
          </li>)}
        </ul>}
      <p className="mt-4 text-xs text-muted-foreground">
        Lista inicial conferida no <a href={b3EquityReference.url} className="font-semibold underline" target="_blank" rel="noreferrer">comunicado da B3 de {b3EquityReference.date}</a>.
      </p>
    </section>
  </div>;
}
