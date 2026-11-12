import type { ConsultationOffer } from "@shared/invest-consultation-offers";
import { initialPreviewPrepaidCredits, type PreviewCreditUsage } from "@shared/invest-preview-credit-policy";
export { previewCreditRates } from "@shared/invest-preview-credit-policy";

export type PreviewCreditEvent = { id: string; recordedAt?: string } & (
  | { type: "load"; offer: ConsultationOffer }
  | { type: "spend"; credits: number; label: string; usage: PreviewCreditUsage }
);

export type PreviewCreditWallet = {
  prepaid: number;
  monthly: number;
  entries: PreviewCreditEvent[];
  notice: string;
};

export const initialPreviewCreditWallet: PreviewCreditWallet = {
  prepaid: initialPreviewPrepaidCredits,
  monthly: 0,
  entries: [],
  notice: "",
};

export type ConfirmPreviewCredit = (event: PreviewCreditEvent) => Promise<PreviewCreditWallet>;

export function previewCreditBalance(wallet: PreviewCreditWallet) {
  return wallet.prepaid + wallet.monthly;
}

export function reducePreviewCreditWallet(wallet: PreviewCreditWallet, event: PreviewCreditEvent): PreviewCreditWallet {
  if (wallet.entries.some(entry => entry.id === event.id)) {
    return { ...wallet, notice: "Esta simulação já foi registrada." };
  }

  if (event.type === "load") {
    const prepaid = event.offer.id === "avulso";
    const credits = event.offer.sampleCredits;
    return {
      prepaid: wallet.prepaid + (prepaid ? credits : 0),
      monthly: prepaid ? wallet.monthly : credits,
      entries: [...wallet.entries, event],
      notice: prepaid ? `${credits} créditos avulsos de teste adicionados.`
        : `Franquia mensal de teste atualizada para ${credits} créditos.`,
    };
  }

  if (!Number.isSafeInteger(event.credits) || event.credits <= 0 || event.credits > previewCreditBalance(wallet)) {
    return { ...wallet, notice: "O saldo de teste é insuficiente para este uso." };
  }
  const fromMonthly = Math.min(wallet.monthly, event.credits);
  return {
    prepaid: wallet.prepaid - (event.credits - fromMonthly),
    monthly: wallet.monthly - fromMonthly,
    entries: [...wallet.entries, event],
    notice: `${event.credits} créditos usados na simulação.`,
  };
}
