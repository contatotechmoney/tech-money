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
export type Ciclo = "mensal" | "anual";

export interface Plano {
  id: string;
  nome: string;
  descricao: string;
  creditos: number;
  precoMensalCentavos: number;
  precoUnicoCentavos?: number;
  modo: Modo;
  sobConsulta?: boolean;
  destaque?: boolean;
  recursos: string[];
}

/** Anual = 12 meses pagando 10 (2 meses grátis ≈ 17%). Não usar 40%: destrói o ARPU. */
export const MESES_GRATIS_ANUAL = 2;

export const CATALOGO: Record<string, Plano> = {
  avulso: {
    id: "avulso",
    nome: "Avulso",
    descricao: "Para análises pontuais",
    creditos: 5,
    precoMensalCentavos: 0,
    precoUnicoCentavos: 4990,
    modo: "payment",
    recursos: [
      "5 créditos — R$ 9,98 por análise",
      "Validade de 90 dias",
      "Todos os tipos de relatório",
    ],
  },
  essencial: {
    id: "essencial",
    nome: "Essencial",
    descricao: "Para investidores ativos",
    creditos: 15,
    precoMensalCentavos: 11990,
    modo: "subscription",
    recursos: [
      "15 créditos por mês — R$ 7,99 por análise",
      "Créditos não usados acumulam",
      "Relatórios completos do comitê",
      "Suporte por e-mail",
    ],
  },
  profissional: {
    id: "profissional",
    nome: "Profissional",
    descricao: "Para consultores e contadores",
    creditos: 45,
    precoMensalCentavos: 27990,
    modo: "subscription",
    destaque: true,
    recursos: [
      "45 créditos por mês — R$ 6,22 por análise",
      "Créditos não usados acumulam",
      "Relatórios white-label (sua marca)",
      "Suporte prioritário",
    ],
  },
  enterprise: {
    id: "enterprise",
    nome: "Enterprise",
    descricao: "Para escritórios e family offices",
    creditos: 0,
    precoMensalCentavos: 0,
    modo: "subscription",
    sobConsulta: true,
    recursos: [
      "Uso justo, sem limite fixo",
      "API de integração",
      "Múltiplos usuários",
      "Gerente de conta dedicado",
    ],
  },
};

export function precoAnualCentavos(plano: Plano): number {
  return plano.precoMensalCentavos * (12 - MESES_GRATIS_ANUAL);
}

export function mesEquivalenteCentavos(plano: Plano): number {
  return plano.precoMensalCentavos;
}

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

/** Total de créditos concedidos a cada cobrança (anual credita 12× de uma vez). */
export function creditosPorCobranca(plano: Plano, ciclo: Ciclo): number {
  if (plano.modo === "payment") return plano.creditos;
  return ciclo === "anual" ? plano.creditos * 12 : plano.creditos;
}

/** Cria a Checkout Session e devolve a URL de pagamento. */
export async function criarCheckout(opts: {
  planoId: string;
  ciclo?: Ciclo;
  userId: string;
  baseUrl: string;
}): Promise<{ url: string }> {
  const plano = CATALOGO[opts.planoId];
  if (!plano) throw new Error(`plano inválido: ${opts.planoId}`);
  if (plano.sobConsulta) {
    throw new Error("O plano Enterprise é sob consulta — fale com o time comercial.");
  }
  if (!billingConfigurado()) throw new Error("Stripe não configurado (STRIPE_SECRET_KEY ausente).");

  const ciclo: Ciclo = plano.modo === "payment" ? "mensal" : (opts.ciclo ?? "mensal");
  const creditos = creditosPorCobranca(plano, ciclo);

  const sucesso = `${opts.baseUrl}/credits?status=sucesso`;
  const cancelado = `${opts.baseUrl}/credits?status=cancelado`;

  const campos: Record<string, string | number> = {
    "mode": plano.modo,
    "success_url": sucesso,
    "cancel_url": cancelado,
    "client_reference_id": opts.userId,
    "metadata[userId]": opts.userId,
    "metadata[planoId]": plano.id,
    "metadata[ciclo]": ciclo,
    "metadata[creditos]": creditos,
  };

  if (plano.modo === "subscription") {
    // Preferir o Price criado no Stripe (env); senão, criar o preço recorrente inline.
    const envKey = `STRIPE_PRICE_${plano.id.toUpperCase()}_${ciclo.toUpperCase()}`;
    const priceId = (process.env[envKey] || "").trim();
    if (priceId) {
      campos["line_items[0][price]"] = priceId;
    } else {
      const unit =
        ciclo === "anual" ? precoAnualCentavos(plano) : plano.precoMensalCentavos;
      campos["line_items[0][price_data][currency]"] = "brl";
      campos["line_items[0][price_data][product_data][name]"] = `Tech Money — Plano ${plano.nome}`;
      campos["line_items[0][price_data][unit_amount]"] = unit;
      campos["line_items[0][price_data][recurring][interval]"] = ciclo === "anual" ? "year" : "month";
    }
    campos["line_items[0][quantity]"] = 1;
  } else {
    campos["line_items[0][price_data][currency]"] = "brl";
    campos["line_items[0][price_data][product_data][name]"] = `Tech Money — ${plano.nome}`;
    campos["line_items[0][price_data][unit_amount]"] = plano.precoUnicoCentavos ?? 0;
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
    // renovação: os metadados vivem na subscription (subscription_details.metadata)
    const meta = obj?.subscription_details?.metadata ?? obj?.metadata ?? {};
    const qtd = Number(meta?.creditos ?? 0);
    const userId = meta?.userId;
    if (!userId || !qtd) return { concedido: false, motivo: "invoice sem userId/creditos" };
    const concedido = await store.grantOnce(userId, qtd, `stripe:${evento.id}`);
    return { concedido, creditos: qtd };
  }

  return { concedido: false, motivo: `evento ignorado: ${evento.type}` };
}
