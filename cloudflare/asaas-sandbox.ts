import { timingSafeEqual } from "node:crypto";
import type { Client } from "pg";
import { z } from "zod";
import { consultationOffers } from "../shared/invest-consultation-offers";
import { combinedPreviewCreditCost } from "../shared/invest-preview-credit-policy";
import { withDatabase } from "./supabase-auth/store.mjs";

const apiBase = "https://api-sandbox.asaas.com/v3";
const paymentId = /^pay_[a-z\d_]+$/i;
const subscriptionId = /^sub_[a-z\d_]+$/i;
const checkoutInput = z.object({ id: z.string().uuid(), offer: z.string().max(20) }).strict();
const usageInput = z.object({ id: z.string().uuid(), units: z.unknown() }).strict();
const webhookInput = z.object({ event: z.string(), payment: z.object({ id: z.string().regex(paymentId) }) });
const settlementEvents = new Set([
  "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_REFUNDED", "PAYMENT_REFUND_IN_PROGRESS",
  "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE",
]);
const revokedStatuses = new Set(["REFUNDED", "REFUND_IN_PROGRESS", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE"]);

type SandboxEnv = {
  INVEST_PORTAL_MODE?: string;
  INVEST_MIGRATION_ORIGIN?: string;
  INVEST_ASAAS_SANDBOX_API_KEY?: string;
  INVEST_ASAAS_SANDBOX_WEBHOOK_TOKEN?: string;
  INVEST_ASAAS_SANDBOX_CUSTOMER?: string;
  INVEST_ASAAS_SANDBOX_DATABASE?: { connectionString: string };
};
type Config = { apiKey: string; webhookToken: string; customer: string; origin: string };
type SandboxDb = typeof sandboxDatabase;
type Order = {
  id: string;
  account_id: string;
  offer_id: string;
  monthly: boolean;
  amount_cents: number;
  customer_id: string;
  provider_id: string | null;
  invoice_url: string | null;
  state: "creating" | "pending" | "confirmed" | "revoked" | "failed" | "review";
};

export class SandboxBillingError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}

export function sandboxDatabase(env: SandboxEnv, action: Parameters<typeof withDatabase>[1]) {
  const connectionString = env.INVEST_ASAAS_SANDBOX_DATABASE?.connectionString;
  if (!connectionString) throw new Error("Asaas Sandbox database is not configured");
  return withDatabase({ connectionString }, action);
}

function config(request: Request, env: SandboxEnv): Config | null {
  const { INVEST_ASAAS_SANDBOX_API_KEY: apiKey, INVEST_ASAAS_SANDBOX_WEBHOOK_TOKEN: webhookToken,
    INVEST_ASAAS_SANDBOX_CUSTOMER: customer, INVEST_MIGRATION_ORIGIN: origin } = env;
  if (env.INVEST_PORTAL_MODE !== "billing-sandbox" || !apiKey || apiKey.trim().startsWith("$aact_prod_") || !webhookToken ||
      !env.INVEST_ASAAS_SANDBOX_DATABASE?.connectionString || !customer || !/^cus_[a-z\d_]+$/i.test(customer) || !origin) return null;
  const url = new URL(request.url);
  if (url.protocol !== "https:" || url.origin !== origin || !url.hostname.endsWith(".workers.dev")) return null;
  return { apiKey, webhookToken, customer, origin };
}

async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader || !/^application\/json(?:;|$)/i.test(request.headers.get("Content-Type") ?? "")) {
    throw new SandboxBillingError("INVALID_SANDBOX_REQUEST", 400);
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let data = "";
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new SandboxBillingError("SANDBOX_REQUEST_TOO_LARGE", 413);
      data += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(data + decoder.decode());
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof SandboxBillingError) throw error;
    throw new SandboxBillingError("INVALID_SANDBOX_REQUEST", 400);
  }
}

class ProviderError extends Error {
  constructor(public readonly status: number) { super("Asaas Sandbox request failed"); }
}

async function asaas(fetcher: typeof fetch, cfg: Config, path: string, body?: object) {
  const response = await fetcher(apiBase + path, {
    method: body ? "POST" : "GET",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
    headers: {
      Accept: "application/json", "Content-Type": "application/json",
      "User-Agent": "TechMoney-Invest-Sandbox", access_token: cfg.apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new ProviderError(response.status);
  return response.json();
}

export function sandboxInvoiceUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  try {
    const url = new URL(input);
    if (url.origin === "https://sandbox.asaas.com" && !url.username && !url.password &&
        !url.search && !url.hash && /^\/i\/[a-z\d_-]+\/?$/i.test(url.pathname)) return url.href;
  } catch { return null; }
  return null;
}

const dateInBrazil = () => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

async function billingWallet(client: Client, accountId: string, customer: string, date: string) {
  const { rows: [balance] } = await client.query(
    `WITH payments AS (
       SELECT p.provider_payment_id, p.due_date, p.recorded_at, p.revoked, o.credits, o.monthly
       FROM public.invest_sandbox_billing_payments p
       JOIN public.invest_sandbox_billing_orders o ON o.id=p.order_id
       WHERE o.account_id=$1 AND o.customer_id=$2
     ), cycle AS (
       SELECT provider_payment_id, due_date, CASE WHEN revoked THEN 0 ELSE credits END AS credits
       FROM payments
       WHERE monthly AND due_date <= $3::date AND $3::date < due_date + interval '1 month'
       ORDER BY due_date DESC, recorded_at DESC, provider_payment_id DESC LIMIT 1
     ), usage AS (
       SELECT id, units, monthly_payment_id, monthly_debit, prepaid_debit, recorded_at
       FROM public.invest_sandbox_credit_usage WHERE account_id=$1 AND customer_id=$2
     ), recent AS (
       SELECT * FROM usage ORDER BY recorded_at DESC, id DESC LIMIT 50
     )
     SELECT (SELECT provider_payment_id FROM cycle) AS cycle_id,
       COALESCE((SELECT credits FROM cycle), 0) AS confirmed_monthly,
       COALESCE((SELECT sum(credits) FROM payments WHERE NOT monthly AND NOT revoked), 0) AS confirmed_prepaid,
       COALESCE((SELECT sum(monthly_debit) FROM usage WHERE monthly_payment_id IN (
         SELECT provider_payment_id FROM payments WHERE monthly AND due_date=(SELECT due_date FROM cycle)
       )), 0) AS spent_monthly,
       COALESCE((SELECT sum(prepaid_debit) FROM usage), 0) AS spent_prepaid,
       COALESCE((SELECT json_agg(json_build_object(
         'id', id, 'type', 'spend', 'credits', monthly_debit + prepaid_debit, 'label', 'Uso combinado de recursos',
         'usage', json_build_object('kind', 'combined', 'units', units), 'recordedAt', recorded_at
       ) ORDER BY recorded_at, id) FROM recent), '[]'::json) AS entries`,
    [accountId, customer, date]);
  const confirmedPrepaid = Number(balance.confirmed_prepaid);
  const confirmedMonthly = Number(balance.confirmed_monthly);
  return { cycleId: balance.cycle_id as string | null, confirmedPrepaid, confirmedMonthly, wallet: {
    prepaid: Math.max(0, confirmedPrepaid - Number(balance.spent_prepaid)),
    monthly: Math.max(0, confirmedMonthly - Number(balance.spent_monthly)),
    entries: balance.entries,
    notice: "",
  } };
}

export async function sandboxCreditUsage(request: Request, env: SandboxEnv, accountId: string, connect: SandboxDb) {
  const cfg = config(request, env);
  if (!cfg) throw new SandboxBillingError("ASAAS_SANDBOX_DISABLED", 423);
  if (request.method !== "POST") throw new SandboxBillingError("METHOD_NOT_ALLOWED", 405);
  if (request.headers.get("Origin") !== cfg.origin) throw new SandboxBillingError("ORIGIN_NOT_ALLOWED", 403);
  const input = usageInput.safeParse(await readJson(request, 1024));
  const cost = input.success && combinedPreviewCreditCost(input.data.units);
  if (!input.success || !cost) throw new SandboxBillingError("INVALID_CREDIT_EVENT", 400);
  const key = [accountId, cfg.customer];
  const payload = JSON.stringify(cost.units);

  return connect(env, async client => {
    await client.query("BEGIN");
    try {
      // The same orders are updated by settlements. Lock before reading the balance to
      // serialize debits and ensure each debit sees the latest committed settlements.
      await client.query(
        "SELECT id FROM public.invest_sandbox_billing_orders WHERE account_id=$1 AND customer_id=$2 ORDER BY id FOR UPDATE", key);
      const { rows: [previous] } = await client.query(
        "SELECT units=$4::jsonb AS same FROM public.invest_sandbox_credit_usage WHERE account_id=$1 AND customer_id=$2 AND id=$3",
        [...key, input.data.id, payload]);
      const date = dateInBrazil();
      const balance = await billingWallet(client, accountId, cfg.customer, date);
      let wallet = balance.wallet;
      if (previous) {
        if (!previous.same) throw new SandboxBillingError("CREDIT_EVENT_CONFLICT", 409);
      } else {
        if (cost.credits > wallet.monthly + wallet.prepaid) throw new SandboxBillingError("INSUFFICIENT_CREDITS", 409);
        const monthlyDebit = Math.min(wallet.monthly, cost.credits);
        await client.query(
          `INSERT INTO public.invest_sandbox_credit_usage
            (account_id,customer_id,id,units,monthly_payment_id,monthly_debit,prepaid_debit)
           VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7)`,
          [...key, input.data.id, payload, monthlyDebit ? balance.cycleId : null, monthlyDebit, cost.credits - monthlyDebit]);
        wallet = (await billingWallet(client, accountId, cfg.customer, date)).wallet;
      }
      await client.query("COMMIT");
      return { wallet: { ...wallet, notice: previous ? "Este uso já foi registrado." : `${cost.credits} créditos usados na simulação.` } };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  });
}

export async function sandboxBilling(
  request: Request, env: SandboxEnv, accountId: string, connect: SandboxDb, fetcher = fetch,
) {
  const cfg = config(request, env);
  if (request.method === "GET") {
    if (!cfg) return { enabled: false };
    return connect(env, async client => {
      const { rows: orders } = await client.query(
        `SELECT id,offer_id,state,invoice_url,created_at FROM public.invest_sandbox_billing_orders
          WHERE account_id=$1 AND customer_id=$2 ORDER BY created_at DESC LIMIT 10`, [accountId, cfg.customer]);
      const { confirmedPrepaid, confirmedMonthly, wallet } = await billingWallet(client, accountId, cfg.customer, dateInBrazil());
      return { enabled: true, orders: orders.map(order => ({ id: order.id, offer: order.offer_id, state: order.state,
        invoiceUrl: order.state === "pending" ? sandboxInvoiceUrl(order.invoice_url) : null })),
        confirmedPrepaid, confirmedMonthly, wallet };
    });
  }
  if (!cfg) throw new SandboxBillingError("ASAAS_SANDBOX_DISABLED", 423);
  if (request.method !== "POST") throw new SandboxBillingError("METHOD_NOT_ALLOWED", 405);
  if (request.headers.get("Origin") !== cfg.origin) throw new SandboxBillingError("ORIGIN_NOT_ALLOWED", 403);
  const input = checkoutInput.safeParse(await readJson(request, 1024));
  const offer = input.success && consultationOffers.find(item => item.id === input.data.offer);
  if (!input.success || !offer) throw new SandboxBillingError("INVALID_SANDBOX_ORDER", 400);

  const { id } = input.data;
  const monthly = offer.id !== "avulso";
  const inserted = await connect(env, async client => (await client.query(
    `INSERT INTO public.invest_sandbox_billing_orders(id,account_id,offer_id,monthly,credits,amount_cents,customer_id)
     VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING *`,
    [id, accountId, offer.id, monthly, offer.sampleCredits, offer.price, cfg.customer])).rows[0] as Order | undefined);
  let order = inserted ?? await connect(env, async client => (await client.query(
    `SELECT * FROM public.invest_sandbox_billing_orders WHERE id=$1 AND account_id=$2 AND customer_id=$3 AND offer_id=$4`,
    [id, accountId, cfg.customer, offer.id])).rows[0] as Order | undefined);
  if (!order) throw new SandboxBillingError(monthly ? "SANDBOX_SUBSCRIPTION_EXISTS" : "SANDBOX_TOP_UP_PENDING", 409);
  if (inserted) {
    const common = {
      customer: cfg.customer, billingType: "CREDIT_CARD", value: offer.price / 100,
      description: `Tech Money Invest - teste - ${offer.name}`, externalReference: `invest-sandbox:${id}`,
    };
    try {
      const date = dateInBrazil();
      const result = monthly
        ? await asaas(fetcher, cfg, "/subscriptions", { ...common, cycle: "MONTHLY", nextDueDate: date, maxPayments: 2 })
        : await asaas(fetcher, cfg, "/payments", { ...common, dueDate: date });
      if (!result || typeof result.id !== "string" || !(monthly ? subscriptionId : paymentId).test(result.id)) {
        throw new Error("Missing sandbox provider id");
      }
      order = await connect(env, async client => (await client.query(
        `UPDATE public.invest_sandbox_billing_orders SET provider_id=$2,invoice_url=$3,state='pending'
         WHERE id=$1 AND state='creating' RETURNING *`,
        [id, result.id, monthly ? null : sandboxInvoiceUrl(result.invoiceUrl)])).rows[0]);
    } catch (error) {
      // A timeout may occur after the provider created the order. A retry must never create another.
      const state = error instanceof ProviderError && [400, 401, 403, 422].includes(error.status) ? "failed" : "review";
      await connect(env, async client => client.query(
        "UPDATE public.invest_sandbox_billing_orders SET state=$2 WHERE id=$1 AND state='creating'", [id, state]));
      return { enabled: true, id, invoiceUrl: null, state };
    }
  }
  if (order.state === "creating") {
    order = await connect(env, async client => (await client.query(
      `UPDATE public.invest_sandbox_billing_orders SET state='review'
       WHERE id=$1 AND state='creating' AND created_at < now() - interval '1 minute' RETURNING *`, [id])).rows[0]) ?? order;
  }
  if (order.state === "review" && !order.provider_id) {
    // Look up an uncertain creation by the original reference. Never issue a second POST.
    const reference = `invest-sandbox:${id}`;
    const resource = monthly ? "/subscriptions" : "/payments";
    const response = await asaas(fetcher, cfg, `${resource}?externalReference=${encodeURIComponent(reference)}&limit=2`);
    const results = response.data;
    const found = Array.isArray(results) && !response.hasMore && results.length === 1 ? results[0] : undefined;
    if (found?.externalReference === reference && found.customer === cfg.customer &&
        found.billingType === "CREDIT_CARD" && found.value === offer.price / 100 &&
        typeof found.id === "string" && (monthly ? subscriptionId : paymentId).test(found.id)) {
      order = await connect(env, async client => (await client.query(
        `UPDATE public.invest_sandbox_billing_orders SET provider_id=$2,invoice_url=$3,state='pending'
         WHERE id=$1 AND state='review' RETURNING *`,
        [id, found.id, monthly ? null : sandboxInvoiceUrl(found.invoiceUrl)])).rows[0]) ?? order;
    }
  }
  let invoiceUrl = order.state === "pending" ? sandboxInvoiceUrl(order.invoice_url) : null;
  if (order.state === "pending" && !invoiceUrl && order.provider_id) {
    if (monthly) {
      const result = await asaas(fetcher, cfg, `/subscriptions/${order.provider_id}/payments?limit=10`);
      const payment = result.data?.find((entry: { status: string; subscription: string; customer: string }) =>
        entry.status === "PENDING" && entry.subscription === order.provider_id && entry.customer === cfg.customer);
      invoiceUrl = sandboxInvoiceUrl(payment?.invoiceUrl);
    } else {
      const payment = await asaas(fetcher, cfg, `/payments/${order.provider_id}`);
      invoiceUrl = payment.customer === cfg.customer && payment.status === "PENDING" ? sandboxInvoiceUrl(payment.invoiceUrl) : null;
    }
    if (invoiceUrl) await connect(env, async client => client.query(
      "UPDATE public.invest_sandbox_billing_orders SET invoice_url=$2 WHERE id=$1 AND state='pending'", [id, invoiceUrl]));
  }
  return { enabled: true, id, invoiceUrl, state: order.state };
}

function validToken(received: string, secret: string) {
  const left = Buffer.from(received);
  const right = Buffer.from(secret);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function sandboxBillingWebhook(request: Request, env: SandboxEnv, connect: SandboxDb = sandboxDatabase, fetcher = fetch) {
  const reply = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  const cfg = config(request, env);
  if (!cfg) return reply(404);
  if (request.method !== "POST") return reply(405);
  if (!validToken(request.headers.get("asaas-access-token") ?? "", cfg.webhookToken)) return reply(401);
  try {
    const body = await readJson(request, 32_768);
    if (!body || typeof body !== "object" || !("event" in body) || typeof body.event !== "string") return reply(400);
    if (!settlementEvents.has(body.event)) return reply(200);
    const event = webhookInput.safeParse(body);
    if (!event.success) return reply(400);

    const id = event.data.payment.id;
    const payment = await asaas(fetcher, cfg, `/payments/${id}`);
    if (payment.id !== id || payment.customer !== cfg.customer || payment.billingType !== "CREDIT_CARD") return reply(200);
    const revoked = revokedStatuses.has(payment.status);
    if (!revoked && payment.status !== "RECEIVED" && payment.status !== "CONFIRMED") return reply(200);
    if (!z.string().date().safeParse(payment.dueDate).success || typeof payment.value !== "number") return reply(200);

    const relatedId = payment.subscription || id;
    if (!(payment.subscription ? subscriptionId : paymentId).test(relatedId)) return reply(200);
    // One statement applies both the immutable payment identity and the order update.
    // Replayed confirmations cannot restore credits reversed by a refund or chargeback.
    const { rowCount } = await connect(env, async client => client.query(
      `WITH matched AS (
         SELECT id, monthly FROM public.invest_sandbox_billing_orders
         WHERE provider_id=$1 AND customer_id=$2 AND amount_cents=$3 AND monthly=$4
       ), settlement AS (
         INSERT INTO public.invest_sandbox_billing_payments AS recorded(provider_payment_id,order_id,due_date,revoked)
         SELECT $5,id,$6,$7 FROM matched
         ON CONFLICT(provider_payment_id) DO UPDATE SET revoked=recorded.revoked OR EXCLUDED.revoked
           WHERE recorded.order_id=EXCLUDED.order_id
         RETURNING order_id,revoked
       )
       UPDATE public.invest_sandbox_billing_orders o
       SET state=CASE WHEN NOT o.monthly AND settlement.revoked THEN 'revoked' ELSE 'confirmed' END,
           invoice_url=NULL
       FROM settlement WHERE o.id=settlement.order_id`,
      [relatedId, cfg.customer, Math.round(payment.value * 100), Boolean(payment.subscription), id, payment.dueDate, revoked]));
    if (!rowCount && typeof payment.externalReference === "string" && payment.externalReference.startsWith("invest-sandbox:")) {
      const externalId = payment.externalReference.slice("invest-sandbox:".length);
      if (checkoutInput.shape.id.safeParse(externalId).success) {
        const { rowCount: pending } = await connect(env, async client => client.query(
          `SELECT 1 FROM public.invest_sandbox_billing_orders
           WHERE id=$1 AND customer_id=$2 AND provider_id IS NULL AND state IN ('creating','review')`, [externalId, cfg.customer]));
        if (pending) return reply(503);
      }
    }
    return reply(200);
  } catch (error) {
    return reply(error instanceof SandboxBillingError ? error.status : 503);
  }
}
