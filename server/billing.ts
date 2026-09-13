/**
 * Billing (Stripe) — checkout, catálogo e webhook idempotente, SEM SDK.
 *
 * Chamamos a API REST do Stripe via `fetch` e verificamos a assinatura do webhook
 * com `crypto` nativo. Motivo: não adicionar dependência (nem mexer no
 * package-lock.json) e manter o código auditável (CVM 19/2021 Art. 17).
 *
 * Segredos (Replit → Secrets):
 *   STRIPE_SECRET_KEY      (obrigatório p/ cobrar)  — aceita também STRIPE_API_KEY
 *   STRIPE_WEBHOOK_SECRET  (obrigatório p/ webhook) — vem do endpoint no Stripe
 *   STRIPE_PRICE_SUB_MENSAL (opcional) — Price ID p/ assinatura (recorrência exige Price criado)
 *
 * Credit packs (pagamento único) usam price_data inline → NÃO exigem criar produto no Stripe.
 */
import { createHmac, timingSafeEqual } from "crypto";
import type { CreditStore } from "./credits";

export type Modo = "payment" | "subscription";

export interface Plano {
  id: string;
  nome: string;
  descricao: string;
  creditos: number;
  precoCentavos: number;
  modo: Modo;
}

/** Catálogo de créditos — preços em centavos de BRL. */
export const CATALOGO: Record<string, Plano> = {
  pack1: {
    id: "pack1", nome: "1 consulta", descricao: "Uma análise completa do comitê",
    creditos: 1, precoCentavos: 4900, modo: "payment",
  },
  pack5: {
    id: "pack5", nome: "Pacote 5 consultas", descricao: "5 análises — economize 18%",
    creditos: 5, precoCentavos: 19900, modo: "payment",
  },
  sub_mensal: {
    id: "sub_mensal", nome: "Assinatura mensal", descricao: "6 consultas por mês",
    creditos: 6, precoCentavos: 14900, modo: "subscription",
  },
};

const key = () => process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY || "";
const webhookSecret = () => process.env.STRIPE_WEBHOOK_SECRET || "";

export function billingConfigurado(): boolean {
  return key().length > 0;
}

/** Form-encode no formato que a API do Stripe espera (brackets). */
export function formEncode(obj: Record<string, string | number>, prefix = ""): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const kk = prefix ? `${prefix}[${k}]` : k;
    parts.push(`${encodeURIComponent(kk)}=${encodeURIComponent(String(v))}`);
  }
  return parts.join("&");
}

/** Cria a Checkout Session e devolve a URL de pagamento. */
export async function criarCheckout(opts: {
  planoId: string;
  userId: string;
  baseUrl: string;
}): Promise<{ url: string }> {
  const plano = CATALOGO[opts.planoId];
  if (!plano) throw new Error(`plano inválido: ${opts.planoId}`);
  if (!billingConfigurado()) throw new Error("Stripe não configurado (STRIPE_SECRET_KEY ausente).");

  const sucesso = `${opts.baseUrl}/credits?status=sucesso`;
  const cancelado = `${opts.baseUrl}/credits?status=cancelado`;

  const campos: Record<string, string | number> = {
    "mode": plano.modo,
    "success_url": sucesso,
    "cancel_url": cancelado,
    "client_reference_id": opts.userId,
    "metadata[userId]": opts.userId,
    "metadata[planoId]": plano.id,
    "metadata[creditos]": plano.creditos,
  };

  if (plano.modo === "subscription") {
    const priceId = process.env.STRIPE_PRICE_SUB_MENSAL || "";
    if (!priceId) {
      throw new Error(
        "Assinatura requer STRIPE_PRICE_SUB_MENSAL (crie o Price recorrente no Stripe).",
      );
    }
    campos["line_items[0][price]"] = priceId;
    campos["line_items[0][quantity]"] = 1;
  } else {
    campos["line_items[0][price_data][currency]"] = "brl";
    campos["line_items[0][price_data][product_data][name]"] = `Tech Money — ${plano.nome}`;
    campos["line_items[0][price_data][unit_amount]"] = plano.precoCentavos;
    campos["line_items[0][quantity]"] = 1;
  }

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formEncode(campos),
  });
  const data = (await res.json()) as { url?: string; error?: { message?: string } };
  if (!res.ok || !data.url) {
    throw new Error(`Stripe checkout falhou: ${data.error?.message ?? res.status}`);
  }
  return { url: data.url };
}

/**
 * Verifica a assinatura do webhook (Stripe-Signature: t=...,v1=...).
 * HMAC-SHA256 de `${t}.${payload}` com o webhook secret + tolerância anti-replay.
 */
export function verificarAssinatura(
  payload: string,
  header: string | undefined,
  secret: string,
  toleranciaSeg = 300,
  agoraSeg = Math.floor(Date.now() / 1000),
): { ok: boolean; motivo?: string } {
  if (!secret) return { ok: false, motivo: "webhook secret ausente" };
  if (!header) return { ok: false, motivo: "assinatura ausente" };
  const itens = Object.fromEntries(
    header.split(",").map((p) => p.split("=").map((s) => s.trim()) as [string, string]),
  );
  const t = Number(itens["t"]);
  const v1 = itens["v1"];
  if (!t || !v1) return { ok: false, motivo: "assinatura malformada" };
  if (Math.abs(agoraSeg - t) > toleranciaSeg) return { ok: false, motivo: "assinatura expirada" };

  const esperado = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(v1);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, motivo: "assinatura inválida" };
  }
  return { ok: true };
}

export interface EventoStripe {
  id: string;
  type: string;
  data?: { object?: Record<string, any> };
}

/**
 * Processa o evento: credita os créditos UMA vez (idempotente pelo event.id).
 * Cobre pagamento único (checkout.session.completed) e renovação (invoice.paid).
 */
export async function processarEvento(
  store: CreditStore,
  evento: EventoStripe,
): Promise<{ concedido: boolean; creditos?: number; motivo?: string }> {
  const obj = evento.data?.object ?? {};

  const creditosDe = (o: any): number => {
    const md = o?.metadata ?? {};
    return Number(md.creditos ?? 0);
  };
  const userIdDe = (o: any): string | undefined =>
    o?.metadata?.userId ?? o?.client_reference_id ?? undefined;

  if (evento.type === "checkout.session.completed") {
    const qtd = creditosDe(obj);
    const userId = userIdDe(obj);
    if (!userId || !qtd) return { concedido: false, motivo: "evento sem userId/creditos" };
    const concedido = await store.grantOnce(userId, qtd, `stripe:${evento.id}`);
    return { concedido, creditos: qtd };
  }

  if (evento.type === "invoice.paid") {
    // renovação de assinatura: os metadados vivem na subscription (subscription_details.metadata)
    const meta = obj?.subscription_details?.metadata ?? obj?.metadata ?? {};
    const qtd = Number(meta?.creditos ?? 0) || 6;
    const userId = meta?.userId;
    if (!userId) return { concedido: false, motivo: "invoice sem userId" };
    const concedido = await store.grantOnce(userId, qtd, `stripe:${evento.id}`);
    return { concedido, creditos: qtd };
  }

  return { concedido: false, motivo: `evento ignorado: ${evento.type}` };
}
