import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowRight, BookOpen, ChartNoAxesCombined, FileText, ShieldCheck, Wallet, type LucideIcon } from "lucide-react";
import { Link, useLocation } from "wouter";

import { previewBudgetPath, previewCompanies, previewReportPath } from "./invest-research-preview";

function QuickLink({ href, title, description, icon: Icon }: {
  href: string; title: string; description: string; icon: LucideIcon;
}) {
  return <Link href={href} className="group flex min-w-0 items-start gap-3 rounded-xl border border-[#dce7e1] bg-white p-4 transition-colors hover:border-[#4e8e76] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-800">
    <span className="rounded-lg bg-[#ecf5ef] p-2 text-[#245d49]"><Icon aria-hidden="true" className="h-5 w-5" /></span>
    <div className="min-w-0 flex-1">
      <h3 className="text-sm font-bold text-[#162f27]">{title}</h3>
      <p className="mt-1 text-sm leading-5 text-[#53665e]">{description}</p>
    </div>
    <ArrowRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#327759] transition-transform group-hover:translate-x-0.5" />
  </Link>;
}

export default function InvestHome({ hasRun = false }: { hasRun?: boolean }) {
  const [ticker, setTicker] = useState("");
  const [, navigate] = useLocation();

  function openBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (previewCompanies.some(company => company.ticker === ticker)) navigate(`${previewBudgetPath}?${new URLSearchParams({ ticker, demo: "1" })}`);
  }

  return <div className="space-y-5 text-[#162f27] sm:space-y-6">
    <section aria-labelledby="invest-home-title" className="relative isolate overflow-hidden rounded-2xl border border-[#214737] bg-[#102e24] p-5 text-white sm:p-7">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,#32664d_0%,transparent_62%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-36 -top-52 -z-10 h-[31rem] w-[31rem] rounded-full border border-white/10 shadow-[0_0_0_28px_#ffffff09,0_0_0_56px_#ffffff06]" />
      <div className="grid items-center gap-6 min-[940px]:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-[#d7f3df]">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#a7e3ba]" /> Tech Money Invest
          </span>
          <h1 id="invest-home-title" className="mt-4 max-w-[20ch] text-3xl font-bold leading-[1.08] tracking-tight sm:text-4xl xl:text-5xl">Entenda seus investimentos antes de decidir.</h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[#c5dbd0] sm:text-base">Escolha uma empresa, confira o orçamento e acompanhe a pesquisa até poder conversar com os agentes no relatório.</p>
        </div>
        <div className="rounded-xl border border-white/25 bg-white p-4 text-[#162f27] shadow-xl sm:p-5">
          <div className="mb-3 inline-flex rounded-lg bg-[#eaf4ee] p-2 text-[#296047]"><ChartNoAxesCombined aria-hidden="true" className="h-5 w-5" /></div>
          <h2 className="text-lg font-bold tracking-tight">Simular uma pesquisa</h2>
          <form onSubmit={openBudget} className="mt-3">
            <label htmlFor="invest-home-ticker" className="text-sm font-semibold">Empresa de exemplo</label>
            <select id="invest-home-ticker" required value={ticker} onChange={e => setTicker(e.target.value)}
              className="mt-1 block w-full min-w-0 rounded-lg border border-[#b9ccc1] bg-[#f9fcfa] px-3 py-2 text-base text-[#162f27] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-800">
              <option value="">Selecione uma empresa fictícia</option>
              {previewCompanies.map(company => <option key={company.ticker} value={company.ticker}>{company.name} · {company.ticker}</option>)}
            </select>
            <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#245e46] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#194b36]">
              Conferir orçamento <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </form>
          {hasRun && <Link href={previewReportPath} className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[#245e46] underline">Voltar à pesquisa simulada <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>}
          <p className="mt-3 text-xs leading-5 text-[#53665e]">Dados fictícios. Nenhuma consulta do seu saldo será usada.</p>
        </div>
      </div>
    </section>

    <section aria-labelledby="next-action-title">
      <h2 id="next-action-title" className="text-xl font-bold tracking-tight">Onde quer ir agora?</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <QuickLink href="/investments/portfolio/import-b3" title="Importar carteira" description="Confira o extrato da B3 antes de salvar." icon={ArrowDown} />
        <QuickLink href={previewReportPath} title="Acompanhar pesquisa" description="Veja o andamento e abra o relatório quando estiver pronto." icon={FileText} />
        <QuickLink href="/investments/credits" title="Consultas e planos" description="Veja o pacote de 5 consultas e as opções profissionais." icon={Wallet} />
      </div>
    </section>

    <section aria-labelledby="trust-title" className="rounded-xl border border-[#dce7e1] bg-white p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck aria-hidden="true" className="h-5 w-5 text-[#327759]" />
        <h2 id="trust-title" className="text-base font-bold">O que você confere antes de avançar</h2>
      </div>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        <div><dt className="font-semibold">Custo à vista</dt><dd className="mt-1 leading-5 text-[#53665e]">Uma consulta é uma análise de um ativo. A prévia do orçamento não consome saldo.</dd></div>
        <div><dt className="font-semibold">Como a análise é feita</dt><dd className="mt-1 leading-5 text-[#53665e]">Nove especialistas avaliam o ativo; Rafael sintetiza os pareceres.</dd></div>
        <div><dt className="font-semibold">Limites e fontes</dt><dd className="mt-1 leading-5 text-[#53665e]">Confira a origem e a data dos dados nos relatórios. Estudos não são recomendações personalizadas.</dd></div>
      </dl>
      <Link href="/investments/agents" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#245e46] underline underline-offset-4">
        <BookOpen aria-hidden="true" className="h-4 w-4" /> Conhecer os comitês e experimentar uma simulação
      </Link>
    </section>
  </div>;
}
