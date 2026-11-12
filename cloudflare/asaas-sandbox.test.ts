import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { sandboxBilling, sandboxBillingWebhook, sandboxInvoiceUrl } from "./asaas-sandbox";
import { migrationPortal } from "./portal";
import { consultationOffers } from "../shared/invest-consultation-offers";
import { initialPreviewCreditWallet, previewCreditBalance, reducePreviewCreditWallet } from "../client/src/migration/invest-preview-credits";

const origin = "https://billing-test.techmoney.workers.dev";
const billingPath = "/api/investments/billing/sandbox";
const env = {
  INVEST_PORTAL_MODE: "billing-sandbox",
  INVEST_MIGRATION_ORIGIN: origin,
  INVEST_ASAAS_SANDBOX_API_KEY: "dummy-key",
  INVEST_ASAAS_SANDBOX_WEBHOOK_TOKEN: "dummy-webhook-token-for-local-testing",
  INVEST_ASAAS_SANDBOX_CUSTOMER: "cus_synthetic",
  INVEST_ASAAS_SANDBOX_DATABASE: { connectionString: "unused-by-tests" },
};
const account = "518093d0-1749-4c38-b1d6-8534a70ce809";
const otherAccount = "2c85fa58-48dc-49f4-9f09-9e405fd4d827";
const topUpId = "fa302677-5a9f-437d-b67d-96ec6394029a";
const planId = "ed4d1aae-4ea3-4acd-b69a-0e20756107d1";
const uncertainId = "501518b5-c0e8-490a-a7a9-61c3d7f6872a";
const asaasBase = "https://api-sandbox.asaas.com/v3";
const paymentUrl = "https://sandbox.asaas.com/i/test_invoice";
const subscriptionInvoiceUrl = "https://sandbox.asaas.com/i/plan_invoice";

function order(id: string, offer: string, headerOrigin = origin) {
  return new Request(origin + billingPath, { method: "POST", headers: { "Content-Type": "application/json", Origin: headerOrigin },
    body: JSON.stringify({ id, offer }) });
}

function webhook(id: string, event: string, token = env.INVEST_ASAAS_SANDBOX_WEBHOOK_TOKEN) {
  return new Request(origin + "/api/migration/asaas-sandbox/webhook", {
    method: "POST", headers: { "Content-Type": "application/json", "asaas-access-token": token },
    body: JSON.stringify({ event, payment: { id, status: "CONFIRMED", value: 299.90 } }),
  });
}

test("production, unauthorized identities and wrong origins cannot access sandbox payments", async () => {
  const db = async () => { throw new Error("should not connect"); };
  const base = { verify: async () => ({ subject: account }), binding: async () => ({ bound: true, originalOwnerPreserved: true }), db, sandboxDb: db };
  const prod = { ...env, INVEST_PORTAL_MODE: "owner-production" };
  assert.equal((await migrationPortal(order(topUpId, "avulso"), prod, base)).status, 423);
  const wrongKey = { ...env, INVEST_ASAAS_SANDBOX_API_KEY: "$aact_prod_dummy-fixture" };
  assert.equal((await migrationPortal(order(topUpId, "avulso"), wrongKey, base)).status, 423);
  assert.equal((await sandboxBillingWebhook(webhook("pay_test", "PAYMENT_CONFIRMED"), wrongKey, db)).status, 404);
  assert.equal((await migrationPortal(order(topUpId, "avulso", "https://example.org"), env, base)).status, 403);
  assert.equal((await migrationPortal(order(topUpId, "avulso"), env, { ...base, verify: async () => null })).status, 401);
  assert.equal((await migrationPortal(order(topUpId, "avulso"), env, { ...base, binding: async () => ({ bound: false }) })).status, 403);
  assert.equal((await sandboxBillingWebhook(webhook("pay_test", "PAYMENT_CONFIRMED"), prod, db)).status, 404);
  assert.equal((await sandboxBillingWebhook(webhook("pay_test", "PAYMENT_CONFIRMED", "incorrect"), env, db)).status, 401);
  assert.equal(sandboxInvoiceUrl("https://asaas.com/i/test_invoice"), null);
  assert.equal(sandboxInvoiceUrl("https://sandbox.asaas.com@elsewhere.example/i/test_invoice"), null);
});

test("sandbox settlements isolate the wallet, renew monthly credits, and preserve prepaid credits until reversal", async (context) => {
  const firstCycle = "2026-11-12";
  const secondCycle = "2026-12-12";
  context.mock.timers.enable({ apis: ["Date"], now: new Date(firstCycle + "T15:00:00Z") });
  const database = new PGlite();
  const connect = async (_: typeof env, action: (client: PGlite) => unknown) => action(database);
  await database.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;");
  await database.exec(await readFile(new URL("../supabase/asaas-sandbox.sql", import.meta.url), "utf8"));
  const payments = new Map<string, Record<string, unknown>>();
  const payment = (id: string, value: number, status: string, extra = {}) => ({
    id, customer: env.INVEST_ASAAS_SANDBOX_CUSTOMER, billingType: "CREDIT_CARD", value, dueDate: firstCycle, status, ...extra,
  });
  let uncertain = true;
  let paymentPosts = 0;
  let subscriptionPosts = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    assert.ok(url.startsWith(asaasBase + "/"));
    assert.equal(new Headers(init?.headers).get("access_token"), env.INVEST_ASAAS_SANDBOX_API_KEY);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (init?.method === "POST" && url === asaasBase + "/payments") {
      paymentPosts += 1;
      assert.equal(body.value, 29.9);
      assert.equal(body.billingType, "CREDIT_CARD");
      assert.equal(body.customer, env.INVEST_ASAAS_SANDBOX_CUSTOMER);
      assert.equal("creditCard" in body, false);
      if (body.externalReference.endsWith(uncertainId) && uncertain) {
        uncertain = false;
        throw new Error("timeout after provider accepted order");
      }
      return Response.json({ id: "pay_test", invoiceUrl: paymentUrl });
    }
    if (init?.method === "POST" && url === asaasBase + "/subscriptions") {
      subscriptionPosts += 1;
      assert.equal(body.value, 109.9);
      assert.equal(body.cycle, "MONTHLY");
      assert.equal(body.maxPayments, 2);
      return Response.json({ id: "sub_test" });
    }
    if (url.includes("/subscriptions/sub_test/payments?")) return Response.json({
      data: [payment("pay_month", 109.9, "PENDING", { subscription: "sub_test", invoiceUrl: subscriptionInvoiceUrl })],
    });
    if (url.includes("/payments?externalReference=")) return Response.json({
      hasMore: false,
      data: [payment("pay_recovered", 29.9, "PENDING", { externalReference: `invest-sandbox:${uncertainId}`, invoiceUrl: paymentUrl })],
    });
    const record = payments.get(url.split("/").at(-1) ?? "");
    assert.ok(record);
    return Response.json(record);
  };
  const read = (accountId = account) => sandboxBilling(new Request(origin + billingPath), env, accountId, connect, fetcher);
  const start = (id: string, offer: string) => sandboxBilling(order(id, offer), env, account, connect, fetcher);
  const deliver = (id: string, event: string) => sandboxBillingWebhook(webhook(id, event), env, connect, fetcher);

  try {
    const first = await Promise.all([start(topUpId, "avulso"), start(topUpId, "avulso")]);
    assert.equal(paymentPosts, 1);
    assert.ok(first.some(result => result.invoiceUrl === paymentUrl));
    assert.equal((await read()).confirmedPrepaid, 0);
    payments.set("pay_test", payment("pay_test", 29.9, "PENDING"));
    assert.equal((await deliver("pay_test", "PAYMENT_CONFIRMED")).status, 200);
    assert.equal((await read()).confirmedPrepaid, 0);
    payments.set("pay_test", payment("pay_test", 29.9, "CONFIRMED"));
    await Promise.all([deliver("pay_test", "PAYMENT_CONFIRMED"), deliver("pay_test", "PAYMENT_RECEIVED")]);
    assert.equal((await read()).confirmedPrepaid, 100);
    assert.equal((await read(otherAccount)).confirmedPrepaid, 0);
    assert.deepEqual((await read(otherAccount)).orders, []);
    assert.equal((await start(planId, "essencial")).invoiceUrl, subscriptionInvoiceUrl);
    await start(planId, "essencial");
    assert.equal(subscriptionPosts, 1);
    payments.set("pay_month", payment("pay_month", 109.9, "RECEIVED", { subscription: "sub_test" }));
    assert.equal((await deliver("pay_month", "PAYMENT_RECEIVED")).status, 200);
    assert.equal((await read()).confirmedMonthly, 400);
    payments.set("pay_bad_value", payment("pay_bad_value", 200, "CONFIRMED", { subscription: "sub_test" }));
    await deliver("pay_bad_value", "PAYMENT_CONFIRMED");
    assert.equal((await database.query("SELECT * FROM public.invest_sandbox_billing_payments")).rows.length, 2);

    const renewal = { subscription: "sub_test", dueDate: secondCycle };
    payments.set("pay_renewal", payment("pay_renewal", 109.9, "PENDING", renewal));
    context.mock.timers.setTime(Date.parse(secondCycle + "T03:00:00Z"));
    assert.equal((await deliver("pay_renewal", "PAYMENT_CONFIRMED")).status, 200);
    assert.equal((await read()).confirmedMonthly, 0);
    assert.equal((await read()).confirmedPrepaid, 100);

    payments.set("pay_renewal", payment("pay_renewal", 109.9, "CONFIRMED", renewal));
    assert.equal((await deliver("pay_renewal", "PAYMENT_CONFIRMED")).status, 200);
    payments.set("pay_renewal", payment("pay_renewal", 109.9, "RECEIVED", renewal));
    assert.equal((await deliver("pay_renewal", "PAYMENT_RECEIVED")).status, 200);
    context.mock.timers.setTime(Date.parse(secondCycle + "T02:59:59Z"));
    assert.equal((await read()).confirmedMonthly, 400);
    context.mock.timers.setTime(Date.parse(secondCycle + "T03:00:00Z"));
    const renewed = await read();
    assert.equal(renewed.confirmedMonthly, 400);
    assert.equal(renewed.confirmedPrepaid, 100);
    assert.equal((await database.query("SELECT * FROM public.invest_sandbox_billing_payments")).rows.length, 3);

    payments.set("pay_test", payment("pay_test", 29.9, "REFUNDED"));
    assert.equal((await deliver("pay_test", "PAYMENT_REFUNDED")).status, 200);
    payments.set("pay_test", payment("pay_test", 29.9, "CONFIRMED"));
    await deliver("pay_test", "PAYMENT_CONFIRMED");
    assert.equal((await read()).confirmedPrepaid, 0);

    assert.equal((await start(uncertainId, "avulso")).state, "review");
    assert.equal((await start(uncertainId, "avulso")).invoiceUrl, paymentUrl);
    assert.equal(paymentPosts, 2);
  } finally {
    await database.close();
  }
});

test("preview shares balance across resources and uses monthly credits before prepaid credits", () => {
  const load = { id: "first", type: "load", offer: consultationOffers[1] } as const;
  let wallet = reducePreviewCreditWallet(initialPreviewCreditWallet, load);
  assert.equal(previewCreditBalance(wallet), 500);
  wallet = reducePreviewCreditWallet(wallet, load);
  assert.equal(previewCreditBalance(wallet), 500);
  wallet = reducePreviewCreditWallet(wallet, { id: "spend", type: "spend", credits: 450, label: "Combined use",
    usage: { kind: "combined", units: { analysis: 21, voiceMinute: 0, monitorCompanyMonth: 1 } } });
  assert.equal(wallet.monthly, 0);
  assert.equal(wallet.prepaid, 50);
  wallet = reducePreviewCreditWallet(wallet, { id: "denied", type: "spend", credits: 60, label: "Denied",
    usage: { kind: "combined", units: { analysis: 3, voiceMinute: 0, monitorCompanyMonth: 0 } } });
  assert.equal(wallet.prepaid, 50);
  wallet = reducePreviewCreditWallet(wallet, { id: "topup", type: "load", offer: consultationOffers[0] });
  assert.equal(wallet.prepaid, 150);
});
