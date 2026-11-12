import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  initialPreviewCreditWallet, previewCreditBalance, reducePreviewCreditWallet,
  type ConfirmPreviewCredit, type PreviewCreditEvent, type PreviewCreditWallet,
} from "./invest-preview-credits";

const path = "/api/migration/customer-pilot/credits";
type WalletResponse = { wallet?: PreviewCreditWallet; error?: string };

export function usePreviewCreditWallet(persistent: boolean, userId: string | null) {
  const [local, setLocal] = useState(initialPreviewCreditWallet);
  const localRef = useRef(local);
  const submitting = useRef(false);
  const client = useQueryClient();
  const queryKey = [path, userId] as const;
  const query = useQuery({
    queryKey,
    enabled: persistent && !!userId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    async queryFn({ signal }) {
      const response = await fetch(path, { signal, cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível consultar seus créditos de teste.");
      const result: WalletResponse = await response.json();
      if (!result.wallet) throw new Error("O saldo de teste está indisponível.");
      return result.wallet;
    },
  });

  const confirm: ConfirmPreviewCredit = async event => {
    if (!persistent) {
      if (event.type === "spend" && event.credits > previewCreditBalance(localRef.current)) {
        throw new Error("O saldo de teste é insuficiente para este uso.");
      }
      const updated = reducePreviewCreditWallet(localRef.current, event);
      localRef.current = updated;
      setLocal(updated);
      return updated;
    }
    if (!userId || !query.data || submitting.current) throw new Error("Aguarde a atualização do saldo de teste.");
    submitting.current = true;
    try {
      const input = event.type === "load"
        ? { id: event.id, type: event.type, offerId: event.offer.id }
        : { id: event.id, type: event.type, usage: event.usage };
      const response = await fetch(path, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      const result: WalletResponse | null = await response.json().catch(() => null);
      if (result?.wallet) {
        await client.cancelQueries({ queryKey, exact: true });
        client.setQueryData(queryKey, result.wallet);
      }
      if (response.ok && result?.wallet) return result.wallet;
      if (result?.error === "INSUFFICIENT_CREDITS") throw new Error("O saldo de teste é insuficiente para este uso.");
      if (result?.error === "CREDIT_EVENT_CONFLICT") throw new Error("Esta confirmação já foi registrada. Abra uma nova simulação para ajustar os dados.");
      if (result?.error === "CREDIT_BALANCE_LIMIT") throw new Error("O saldo atingiu o limite da demonstração.");
      throw new Error("Não foi possível confirmar o registro. Tente novamente para verificar a mesma operação.");
    } finally {
      submitting.current = false;
    }
  };
  return { wallet: persistent ? query.data : local, confirm, failed: query.isError, reload: query.refetch };
}

export function usePreviewCreditConfirmation(onConfirm: ConfirmPreviewCredit) {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function confirm(event: PreviewCreditEvent) {
    if (inFlight.current) return null;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      return await onConfirm(event);
    } catch (cause) {
      setError(cause instanceof TypeError
        ? "Não foi possível confirmar o registro. Tente novamente para verificar a mesma operação."
        : cause instanceof Error ? cause.message : "Não foi possível confirmar o uso de teste.");
      return null;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  return { confirm, pending, error };
}
