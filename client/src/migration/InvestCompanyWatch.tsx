import { useState } from "react";
import { ArrowLeft, Bell, Mail } from "lucide-react";
import { Link } from "wouter";

import { previewCreditRates, type PreviewCreditEvent } from "./invest-preview-credits";
const alertExamples = [
  {
    id: "ri",
    option: "RI · Divulgação de resultado",
    source: "RI da BB Seguridade",
    sourceType: "Fonte oficial",
    status: "Revisão sugerida",
    date: "06/11/2026",
    title: "Resultado trimestral disponível para conferência",
    message: "Neste exemplo, o RI publicou um resultado trimestral. O comitê verificaria o lucro recorrente e o percentual do lucro distribuído antes de revisar o valuation.",
  },
  {
    id: "cvm",
    option: "CVM · Fato relevante",
    source: "CVM · Documentos IPE",
    sourceType: "Fonte oficial",
    status: "Revisão sugerida",
    date: "09/11/2026",
    title: "Fato relevante sobre contrato de distribuição",
    message: "O documento fictício trata de mudanças contratuais. O comitê conferiria prazos, comissões e o possível efeito sobre o risco e as premissas do relatório.",
  },
  {
    id: "press",
    option: "Imprensa · Notícia setorial",
    source: "Imprensa financeira · exemplo fictício",
    sourceType: "Em verificação",
    status: "Em verificação",
    date: "10/11/2026",
    title: "Notícia setorial sobre renegociação de comissões",
    message: "A cobertura fictícia sugere mudanças nas comissões de distribuição. Juliana buscaria confirmação em um comunicado de RI ou documento entregue à CVM antes de propor uma revisão.",
  },
] as const;

type AlertExample = (typeof alertExamples)[number];

const officialSources = [
  { name: "RI da BB Seguridade", href: "https://www.bbseguridaderi.com.br/informacoes-ao-mercado/comunicados-e-fatos-relevantes" },
  { name: "CVM · Documentos IPE", href: "https://dados.cvm.gov.br/dataset/cia_aberta-doc-ipe" },
];

const newsSources = [
  { name: "Valor Econômico", href: "https://valor.globo.com/" },
  { name: "InfoMoney", href: "https://www.infomoney.com.br/mercados/" },
  { name: "Money Times", href: "https://www.moneytimes.com.br/empresas/" },
  { name: "Reuters", href: "https://reutersagency.com/content-delivery-platforms/reuters-connect/" },
];

function AlertContent({ alert }: { alert: AlertExample }) {
  return <div className="space-y-2">
    <p className="text-xs font-medium text-muted-foreground">{alert.source} · {alert.date}</p>
    <p className="text-sm font-bold">{alert.title}</p>
    <p className="text-sm leading-relaxed">{alert.message}</p>
  </div>;
}

function WatchSourceLinks({ sources }: { sources: typeof officialSources }) {
  return <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
    {sources.map(({ name, href }) => <li key={href}>
      <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center text-sm font-semibold text-emerald-800 underline underline-offset-2 dark:text-emerald-300">{name}</a>
    </li>)}
  </ul>;
}

export default function InvestCompanyWatch({ following, setFollowing, balance, onConfirm }: {
  following: boolean;
  setFollowing: (value: boolean) => void;
  balance: number;
  onConfirm: (event: PreviewCreditEvent) => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [orderId, setOrderId] = useState("");
  const cost = previewCreditRates.monitorCompanyMonth;
  const remaining = balance - cost;
  const [selected, setSelected] = useState<AlertExample["id"]>("ri");
  const [simulateEmail, setSimulateEmail] = useState(true);
  const [result, setResult] = useState<{ alert: AlertExample; email: boolean }>();

  function toggleFollowing() {
    if (following) {
      setFollowing(false);
      setResult(undefined);
      return;
    }
    setOrderId(crypto.randomUUID());
    setReviewing(true);
  }

  function confirmFollowing() {
    if (remaining < 0 || !reviewing) return;
    onConfirm({ id: orderId, type: "spend", credits: cost, label: "Acompanhamento de BBSE3 por 30 dias" });
    setFollowing(true);
    setReviewing(false);
  }

  function simulate() {
    if (!following) return;
    const alert = alertExamples.find(item => item.id === selected);
    if (alert) setResult({ alert, email: simulateEmail });
  }

  return <div className="mx-auto max-w-5xl space-y-4">
    <Link href="/investments/inicio" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline">
      <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Voltar ao início do Invest
    </Link>

    <section aria-labelledby="company-watch-title" className="rounded-2xl border border-[#285345] bg-[#12372c] p-5 text-white sm:p-7">
      <p className="text-sm font-semibold text-[#b4dccb]">Acompanhamento simulado · BBSE3</p>
      <h1 id="company-watch-title" className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">BB Seguridade</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#e0f1e9]">Veja como uma divulgação do RI, um documento da CVM ou uma notícia poderia gerar um alerta no Invest.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={toggleFollowing} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${following ? "border border-white/50 text-white hover:bg-white/10" : "bg-[#d9f2e5] text-[#12372c] hover:bg-white"}`}>
          <Bell aria-hidden="true" className="h-4 w-4" /> {following ? "Deixar de acompanhar" : "Acompanhar empresa"}
        </button>
        <p role="status" className="text-sm text-[#d8eee3]">{following ? "Acompanhamento ativo na prévia" : "Acompanhamento desativado"}</p>
      </div>
    </section>

    {reviewing && <section aria-labelledby="watch-credit-review" className="space-y-2 rounded-xl border border-border bg-card p-4">
      <h2 id="watch-credit-review" className="font-bold">Conferir acompanhamento de BBSE3</h2>
      <p className="text-sm">Período de teste de 30 dias · {cost} créditos · Alerta no Invest e prévia opcional de e-mail.</p>
      <p className="text-sm" role="status">{remaining < 0 ? `Faltam ${-remaining} créditos de teste.` : `Saldo de teste após confirmar: ${remaining} créditos.`}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={remaining < 0} onClick={confirmFollowing}
          className="min-h-11 rounded-lg bg-[#245e46] px-4 text-sm font-semibold text-white disabled:opacity-50">
          Confirmar acompanhamento de teste
        </button>
        <button type="button" onClick={() => setReviewing(false)} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">Voltar</button>
        {remaining < 0 && <Link href="/investments/credits" className="inline-flex min-h-11 items-center text-sm underline">Adicionar créditos de teste</Link>}
      </div>
    </section>}

    <section aria-labelledby="simulate-watch-title" className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 id="simulate-watch-title" className="text-lg font-bold">Simular alerta</h2>
      <p className="mt-1 text-sm text-muted-foreground">Os eventos são fictícios. O e-mail é exibido nesta tela como prévia.</p>
      <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-60">
          <label htmlFor="watch-event" className="text-sm font-semibold">Evento de exemplo</label>
          <select id="watch-event" value={selected} onChange={event => setSelected(event.target.value as AlertExample["id"])}
            className="mt-1 block min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
            {alertExamples.map(alert => <option key={alert.id} value={alert.id}>{alert.option}</option>)}
          </select>
        </div>
        <button type="button" disabled={!following} onClick={simulate} className="min-h-11 rounded-lg bg-[#245e46] px-4 text-sm font-semibold text-white hover:bg-[#194b36] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50">
          Simular alerta
        </button>
      </div>
      <label className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={simulateEmail} onChange={event => setSimulateEmail(event.target.checked)} className="h-4 w-4 accent-emerald-700" />
        Incluir prévia de e-mail
      </label>
      {result && <>
        <p role="status" className="mt-1 text-sm font-medium text-muted-foreground">{result.email ? "Alerta simulado no Invest e na prévia do e-mail." : "Alerta simulado no Invest."}</p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <section aria-labelledby="in-app-watch-alert" className="rounded-lg border border-border bg-background p-3 sm:p-4">
            <h3 id="in-app-watch-alert" className="flex items-center gap-2 text-sm font-bold"><Bell aria-hidden="true" className="h-4 w-4 text-emerald-700 dark:text-emerald-300" /> Alerta no Invest</h3>
            <div className="my-3 flex flex-wrap gap-1.5 text-xs font-semibold">
              <span className="rounded-md bg-muted px-2 py-1">{result.alert.sourceType}</span>
              {result.alert.status !== result.alert.sourceType && <span className="rounded-md bg-amber-100 px-2 py-1 text-amber-950 dark:bg-amber-950 dark:text-amber-100">{result.alert.status}</span>}
            </div>
            <AlertContent alert={result.alert} />
          </section>
          {result.email && <section aria-labelledby="email-watch-alert" className="rounded-lg border border-border bg-background p-3 sm:p-4">
            <h3 id="email-watch-alert" className="flex items-center gap-2 text-sm font-bold"><Mail aria-hidden="true" className="h-4 w-4 text-emerald-700 dark:text-emerald-300" /> Prévia do e-mail</h3>
            <p className="my-3 rounded-md bg-muted px-2 py-1.5 text-sm"><strong>Assunto</strong> · [Simulação] BBSE3 · {result.alert.status}</p>
            <AlertContent alert={result.alert} />
          </section>}
        </div>
      </>}
    </section>

    <section aria-labelledby="watch-sources-title" className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 id="watch-sources-title" className="text-lg font-bold">Fontes previstas para o acompanhamento</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-background p-3">
          <h3 className="text-sm font-bold">Fontes oficiais</h3>
          <p className="mt-1 text-sm text-muted-foreground">Resultados, comunicados e fatos relevantes para conferir as premissas do relatório.</p>
          <WatchSourceLinks sources={officialSources} />
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          <h3 className="text-sm font-bold">Imprensa financeira</h3>
          <p className="mt-1 text-sm text-muted-foreground">Fontes candidatas, conforme acesso permitido. Juliana levaria as notícias relevantes para verificação.</p>
          <WatchSourceLinks sources={newsSources} />
        </div>
      </div>
    </section>
  </div>;
}
