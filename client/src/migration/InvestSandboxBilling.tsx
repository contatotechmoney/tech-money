import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { consultationOffers as offers, type ConsultationOffer } from "@shared/invest-consultation-offers";
import type { ConfirmPreviewCredit, PreviewCreditWallet } from "./invest-preview-credits";

const path = "/api/investments/billing/sandbox";
const queryKey = [path] as const;
const statusLabels = {
  creating: "Preparando fatura",
  pending: "Aguardando pagamento de teste",
  confirmed: "Pagamento registrado",
  revoked: "Pagamento revertido",
  failed: "Falha ao criar fatura",
  review: "Aguardando conferência no Asaas",
};

type SandboxOrder = {
  id: string;
  offer: ConsultationOffer["id"];
  state: keyof typeof statusLabels;
  invoiceUrl: string | null;
};

type SandboxState = {
  enabled: boolean;
  orders?: SandboxOrder[];
  confirmedPrepaid?: number;
  confirmedMonthly?: number;
  wallet?: PreviewCreditWallet;
};

type SandboxAction = { id: string; offer: ConsultationOffer["id"] };

export function useInvestSandboxBilling(enabled = true) {
  const queryClient = useQueryClient();
  const state = useQuery({
    queryKey,
    enabled,
    queryFn: async ({ signal }): Promise<SandboxState> => {
      const response = await fetch(path, { cache: "no-store", signal });
      if (response.status === 404) return { enabled: false };
      if (!response.ok) throw new Error("Não foi possível consultar o Asaas Sandbox.");
      return response.json();
    },
    retry: false,
  });
  const [processing, setProcessing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [invoice, setInvoice] = useState<string | null>(null);

  async function startOrder(action: SandboxAction) {
    setProcessing(true);
    setFeedback("");
    setInvoice(null);
    try {
      const response = await fetch(path, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.error === "SANDBOX_SUBSCRIPTION_EXISTS") throw new Error("Já existe uma assinatura de teste. Consulte a fatura abaixo.");
        if (result.error === "SANDBOX_TOP_UP_PENDING") throw new Error("Já existe uma recarga de teste em aberto. Consulte a fatura abaixo.");
        throw new Error("Não foi possível consultar a fatura de teste.");
      }
      setInvoice(result.invoiceUrl);
      setFeedback(statusLabels[result.state as SandboxOrder["state"]] ?? "Consulte o histórico de teste.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "O Asaas Sandbox está indisponível.");
    } finally {
      await state.refetch();
      setProcessing(false);
    }
  }

  function resetPayment() {
    setFeedback("");
    setInvoice(null);
  }

  const spend: ConfirmPreviewCredit = async event => {
    if (!state.data?.wallet || event.type !== "spend" || event.usage.kind !== "combined") {
      throw new Error("O saldo de teste do Asaas está indisponível.");
    }
    const response = await fetch(`${path}/usage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: event.id, units: event.usage.units }),
    });
    const result: { wallet?: PreviewCreditWallet; error?: string } = await response.json();
    if (response.ok && result.wallet) {
      const wallet = result.wallet;
      await queryClient.cancelQueries({ queryKey, exact: true });
      queryClient.setQueryData<SandboxState>(queryKey, current => current && { ...current, wallet });
      return wallet;
    }
    if (result.error === "INSUFFICIENT_CREDITS") {
      await state.refetch();
      throw new Error("O saldo confirmado no Asaas é insuficiente para este uso.");
    }
    if (result.error === "CREDIT_EVENT_CONFLICT") throw new Error("Esta confirmação já foi registrada com outras quantidades.");
    throw new Error("Não foi possível registrar o uso. Tente novamente para verificar a mesma operação.");
  };

  return { state, processing, feedback, invoice, startOrder, resetPayment, spend };
}

export function SandboxInvoiceLink({ href }: { href: string | null }) {
  if (!href || !/^https:\/\/sandbox\.asaas\.com\/i\/[a-z\d_-]+\/?$/i.test(href)) return null;
  return <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-800 underline">
    Abrir fatura de teste do Asaas
  </a>;
}

export function InvestSandboxBilling({ billing }: { billing: ReturnType<typeof useInvestSandboxBilling> }) {
  const { state, processing, feedback, invoice, startOrder } = billing;
  const data = state.data;
  if (!data?.enabled) return null;

  return <section aria-labelledby="asaas-sandbox" className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="asaas-sandbox" className="text-lg font-bold">Pagamentos no Asaas Sandbox</h2>
      <button type="button" disabled={state.isFetching || processing} onClick={() => void state.refetch()}
        className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-50">
        Atualizar pagamentos de teste
      </button>
    </div>
    <p className="text-sm text-muted-foreground">Use um cartão de teste na fatura do Asaas. Depois da confirmação, os créditos entram no saldo desta tela.</p>
    <p className="text-sm">Créditos confirmados pelo Asaas no teste: <strong>{data.confirmedPrepaid ?? 0} avulsos · {data.confirmedMonthly ?? 0} mensais</strong></p>
    {state.isError && <p role="alert" className="text-sm">A consulta falhou. Use “Atualizar pagamentos de teste” para tentar novamente.</p>}
    {feedback && <p role="status" className="text-sm">{feedback}</p>}
    <SandboxInvoiceLink href={invoice} />
    <ul className="divide-y text-sm">
      {data.orders?.map(order => <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span>{offers.find(offer => offer.id === order.offer)?.name ?? order.offer} · {statusLabels[order.state]}</span>
        {order.invoiceUrl ? <SandboxInvoiceLink href={order.invoiceUrl} /> : ["creating", "pending", "review"].includes(order.state) &&
          <button type="button" disabled={processing} onClick={() => void startOrder({ id: order.id, offer: order.offer })}
            className="min-h-11 rounded-lg border border-border px-3 font-semibold disabled:opacity-50">Consultar fatura</button>}
      </li>)}
    </ul>
  </section>;
}
