import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import express from "express";
import { after, describe, it, type TestContext } from "node:test";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { createServer, type Server } from "node:http";
import { registerRoutes } from "./routes";
import { closeSuitability } from "./suitability";
import {
  closeStorage,
  pool,
  PROVIDER_EVENT_MAX_PENDING,
  storage,
  type CalculatedPortfolioTransaction,
} from "./storage";

type PortfolioApiResponse = {
  items: Array<Record<string, unknown>>;
  summary: {
    realizedProfit: number;
  };
  transactions: CalculatedPortfolioTransaction[];
};

type ApiResponse<T> = {
  status: number;
  body: T;
};

after(async () => {
  await Promise.all([closeStorage(), closeSuitability()]);
});

describe("portfolio transaction API", () => {
  it("recalculates an edited sale date while preserving another ticker", async () => {
    const userId = `suitability-api-test-${randomUUID()}`;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      if (!url.includes("query1.finance.yahoo.com")) {
        return originalFetch(input, init);
      }

      return new Response(JSON.stringify({
        chart: {
          result: [{
            meta: {
              longName: "Test quote",
              regularMarketPrice: 100,
              chartPreviousClose: 100,
              fiftyTwoWeekHigh: 120,
              fiftyTwoWeekLow: 80,
              regularMarketVolume: 1_000,
              regularMarketTime: 1_755_984_000,
            },
            timestamp: [],
            indicators: { quote: [{ close: [] }] },
          }],
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    try {
      await storage.createTransaction({
        userId,
        ticker: "PETR4",
        transactionType: "buy",
        quantity: 10,
        price: 100,
        operationDate: "2026-08-01",
      });
      await storage.createTransaction({
        userId,
        ticker: "VALE3",
        transactionType: "buy",
        quantity: 8,
        price: 50,
        operationDate: "2026-08-02",
      });
      await storage.createTransaction({
        userId,
        ticker: "PETR4",
        transactionType: "buy",
        quantity: 10,
        price: 200,
        operationDate: "2026-08-03",
      });
      await storage.createTransaction({
        userId,
        ticker: "VALE3",
        transactionType: "sell",
        quantity: 3,
        price: 70,
        operationDate: "2026-08-04",
      });
      const petrSale = await storage.createTransaction({
        userId,
        ticker: "PETR4",
        transactionType: "sell",
        quantity: 10,
        price: 150,
        operationDate: "2026-08-05",
      });
      await storage.createTransaction({
        userId,
        ticker: "VALE3",
        transactionType: "buy",
        quantity: 5,
        price: 60,
        operationDate: "2026-08-06",
      });

    const { server, baseUrl } = await startAuthenticatedServer(userId);
      try {
        const before = await request<PortfolioApiResponse>(
          baseUrl,
          "/api/investments/portfolio",
        );
        assert.equal(before.status, 200);

        const updated = await request<{
          id: string;
          operationDate: string;
        }>(baseUrl, `/api/investments/portfolio/transactions/${petrSale.id}`, {
          method: "PATCH",
          body: JSON.stringify({ operationDate: "2026-08-02" }),
        });
        assert.equal(updated.status, 200);
        assert.equal(updated.body.id, petrSale.id);
        assert.equal(updated.body.operationDate, "2026-08-02");

        const after = await request<PortfolioApiResponse>(
          baseUrl,
          "/api/investments/portfolio",
        );
        assert.equal(after.status, 200);

        const petrItem = after.body.items.find((item) => item.ticker === "PETR4");
        assert.deepEqual(pickPositionFields(petrItem), {
          ticker: "PETR4",
          quantity: 10,
          averagePrice: 200,
          investedValue: 2_000,
          realizedProfit: 500,
        });
        assert.equal(after.body.summary.realizedProfit, 560);

        const updatedPetrSale = after.body.transactions.find(
          (transaction) => transaction.id === petrSale.id,
        );
        assert.equal(updatedPetrSale?.operationDate, "2026-08-02");
        assert.equal(updatedPetrSale?.realizedProfit, 500);
        assert.equal(updatedPetrSale?.quantityAfter, 0);
        assert.equal(updatedPetrSale?.averagePriceAfter, 0);

        assert.deepEqual(
          after.body.items.find((item) => item.ticker === "VALE3"),
          before.body.items.find((item) => item.ticker === "VALE3"),
        );
        assert.deepEqual(
          after.body.transactions.filter((transaction) => transaction.ticker === "VALE3"),
          before.body.transactions.filter((transaction) => transaction.ticker === "VALE3"),
        );
      } finally {
        await closeServer(server);
      }
    } finally {
      globalThis.fetch = originalFetch;
      const transactions = await storage.listTransactions(userId);

      for (const transaction of transactions) {
        await storage.deleteTransaction(userId, transaction.id);
      }
    }
  });
});

describe("suitability API", () => {
  it("stores the investor profile and flags an incompatible high-risk asset", async () => {
    const userId = `suitability-api-test-${randomUUID()}`;
    const { server, baseUrl } = await startAuthenticatedServer(userId);

    try {
      const questionario = await request<{ questoes: Array<{ id: string }> }>(
        baseUrl,
        "/api/suitability/questionario",
      );
      assert.equal(questionario.status, 200);
      assert.equal(questionario.body.questoes.length, 6);

      const incompleto = await request<{ error: string }>(baseUrl, "/api/suitability/perfil", {
        method: "POST",
        body: JSON.stringify({ respostas: { horizonte: 0 } }),
      });
      assert.equal(incompleto.status, 400);

      const respostas = Object.fromEntries(questionario.body.questoes.map((questao) => [questao.id, 0]));
      const salvo = await request<{
        perfil: { perfil: string; pontuacaoMedia: number };
      }>(baseUrl, "/api/suitability/perfil", {
        method: "POST",
        body: JSON.stringify({ respostas }),
      });
      assert.equal(salvo.status, 201);
      assert.equal(salvo.body.perfil.perfil, "CONSERVADOR");
      assert.equal(salvo.body.perfil.pontuacaoMedia, 1);

      const perfil = await request<{
        avaliado: boolean;
        perfil: { perfil: string } | null;
      }>(baseUrl, "/api/suitability/perfil");
      assert.equal(perfil.status, 200);
      assert.equal(perfil.body.avaliado, true);
      assert.equal(perfil.body.perfil?.perfil, "CONSERVADOR");

      const createReportWithRisk = (riskScore: number | null) => storage.createReport({
        userId,
        ticker: "LEVE3",
        companyName: "Metal Leve",
        price: 25,
        changePercent: 0,
        signal: "Manter",
        summary: "Relatório de teste.",
        strengths: ["Dado de teste"],
        risks: ["Risco de teste"],
        riskScore,
        outlook: "Teste de suitability.",
        source: "Teste",
        analysisQuality: {
          version: 1, status: riskScore === null ? "unavailable" : "complete",
          reason: "Dados exclusivamente sintéticos de teste.",
          availableAgents: riskScore === null ? 0 : 9, expectedAgents: 9,
          missingAgents: [], consensusScore: riskScore === null ? null : 7,
          highRisk: riskScore !== null && riskScore > 8.5,
          marketDataAt: new Date().toISOString(), fundamentalsPeriod: "2026-06-30",
        },
      });

      await createReportWithRisk(null);
      const riscoIndisponivel = await request<{
        ok: boolean;
        riscoIndisponivel: boolean;
      }>(baseUrl, "/api/suitability/conformidade/LEVE3?risco=1");
      assert.equal(riscoIndisponivel.status, 200);
      assert.equal(riscoIndisponivel.body.ok, false);
      assert.equal(riscoIndisponivel.body.riscoIndisponivel, true);

      await createReportWithRisk(1);
      const termoSemIncompatibilidade = await request<{ error: string }>(baseUrl, "/api/suitability/termo", {
        method: "POST",
        body: JSON.stringify({ ticker: "LEVE3" }),
      });
      assert.equal(termoSemIncompatibilidade.status, 409);

      await createReportWithRisk(7);
      const relatorioModerado = await request<{
        latest: { riskScore: number | null };
      }>(baseUrl, "/api/investments/reports/LEVE3");
      assert.equal(relatorioModerado.status, 200);
      assert.equal(relatorioModerado.body.latest.riskScore, 7);

      const bloqueio = await request<{
        ok: boolean;
        incompativel: boolean;
        perfilExigido: string;
        motivo: string;
        termoCienciaAssinado: boolean;
      }>(baseUrl, "/api/suitability/conformidade/LEVE3");
      assert.equal(bloqueio.status, 200);
      assert.equal(bloqueio.body.ok, false);
      assert.equal(bloqueio.body.incompativel, true);
      assert.equal(bloqueio.body.perfilExigido, "MODERADO");
      assert.match(bloqueio.body.motivo, /Art\. 6º/);
      assert.equal(bloqueio.body.termoCienciaAssinado, false);

      const termoModerado = await request<{ termo: { id: string } }>(baseUrl, "/api/suitability/termo", {
        method: "POST",
        body: JSON.stringify({ ticker: "LEVE3" }),
      });
      assert.equal(termoModerado.status, 201);
      assert.ok(termoModerado.body.termo.id);

      await createReportWithRisk(9);
      const relatorioAlto = await request<{
        latest: { riskScore: number | null };
      }>(baseUrl, "/api/investments/reports/LEVE3");
      assert.equal(relatorioAlto.status, 200);
      assert.equal(relatorioAlto.body.latest.riskScore, 9);

      const bloqueioMaisAlto = await request<{ termoCienciaAssinado: boolean }>(
        baseUrl,
        "/api/suitability/conformidade/LEVE3",
      );
      assert.equal(bloqueioMaisAlto.status, 200);
      assert.equal(bloqueioMaisAlto.body.termoCienciaAssinado, false);

      const termoAlto = await request<{ termo: { id: string } }>(baseUrl, "/api/suitability/termo", {
        method: "POST",
        body: JSON.stringify({ ticker: "LEVE3" }),
      });
      assert.equal(termoAlto.status, 201);
      assert.ok(termoAlto.body.termo.id);

      const bloqueioComTermo = await request<{ termoCienciaAssinado: boolean }>(
        baseUrl,
        "/api/suitability/conformidade/LEVE3",
      );
      assert.equal(bloqueioComTermo.status, 200);
      assert.equal(bloqueioComTermo.body.termoCienciaAssinado, true);
    } finally {
      await closeServer(server);
    }
  });
});

type DeliveryApiResponse = {
  request: {
    id: string;
    status: string;
  };
};

describe("report delivery API", () => {
  it("rejects unreviewed recommendations before evaluating the provider or creating a delivery", async () => {
    const originalAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const originalPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    const userId = `delivery-whatsapp-unavailable-${randomUUID()}`;
    const { server, baseUrl } = await startAuthenticatedServer(userId);

    try {
      const response = await request<{ error: string }>(
        baseUrl,
        "/api/investments/reports/BBDC3/delivery",
        {
          method: "POST",
          body: JSON.stringify({
            channel: "whatsapp",
            contact: "+55 11 99999-9999",
            useRegisteredContact: false,
            idempotencyKey: randomUUID(),
          }),
        },
      );

      assert.equal(response.status, 409);
      assert.equal(response.body.error, "RECOMMENDATION_PENDING");
    } finally {
      await closeServer(server);
      if (originalAccessToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
      else process.env.WHATSAPP_ACCESS_TOKEN = originalAccessToken;
      if (originalPhoneNumberId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
      else process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneNumberId;
    }
  });

  it("keeps delivery status isolated by authenticated user and deduplicates retries", async () => {
    const ownerId = `delivery-owner-${randomUUID()}`;
    const otherId = `delivery-other-${randomUUID()}`;
    const report = await storage.createReport({
      userId: ownerId,
      ticker: "BBDC3",
      companyName: "Banco Bradesco",
      price: 15,
      changePercent: 1,
      signal: "Acompanhamento positivo",
      summary: "Resumo de teste",
      strengths: ["Força"],
      risks: ["Risco"],
      riskScore: null,
      outlook: "Perspectiva",
      source: "Teste",
    });
    const delivery = await storage.createReportDeliveryRequest({
      userId: ownerId,
      reportId: report.id,
      idempotencyKey: randomUUID(),
      ticker: report.ticker,
      channel: "email",
      contact: "owner@example.com",
      useRegisteredContact: false,
    });
    const duplicate = await storage.createReportDeliveryRequest({
      userId: ownerId,
      reportId: report.id,
      idempotencyKey: delivery.idempotencyKey,
      ticker: report.ticker,
      channel: "email",
      contact: "owner@example.com",
      useRegisteredContact: false,
    });
    assert.equal(duplicate.id, delivery.id);

    const ownerServer = await startAuthenticatedServer(ownerId);
    const otherServer = await startAuthenticatedServer(otherId);
    const anonymousServer = await startAuthenticatedServer("");
    try {
      const ownerResponse = await request<DeliveryApiResponse>(
        ownerServer.baseUrl,
        `/api/investments/report-deliveries/${delivery.id}`,
      );
      assert.equal(ownerResponse.status, 200);
      assert.equal(ownerResponse.body.request.id, delivery.id);

      const otherResponse = await request<{ error: string }>(
        otherServer.baseUrl,
        `/api/investments/report-deliveries/${delivery.id}`,
      );
      assert.equal(otherResponse.status, 404);

      const listUrl = `/api/investments/report-deliveries?ticker=${report.ticker}`;
      const history = await request<{ requests: Array<Record<string, unknown>> }>(ownerServer.baseUrl, listUrl);
      assert.equal(history.status, 200);
      assert.deepEqual(history.body.requests.map((entry) => entry.id), [delivery.id]);
      assert.equal(history.body.requests[0].confirmationPending, false);
      for (const privateField of ["userId", "contact", "providerMessageId", "idempotencyKey", "professionalReviewId"]) {
        assert.ok(!(privateField in history.body.requests[0]), privateField);
      }
      const otherHistory = await request<{ requests: unknown[] }>(otherServer.baseUrl, listUrl);
      assert.equal(otherHistory.status, 200);
      assert.deepEqual(otherHistory.body.requests, []);
      assert.deepEqual(await storage.listReportDeliveryRequests(ownerId, "PETR4"), []);
      assert.equal((await request(ownerServer.baseUrl, "/api/investments/report-deliveries")).status, 400);
      assert.equal((await request(ownerServer.baseUrl, "/api/investments/report-deliveries?ticker=INVALID")).status, 404);

      await storage.updateReportDeliveryRequest(delivery.id, { status: "sent", providerMessageId: delivery.id });
      await storage.flagUnconfirmedReportDeliveries(new Date(Date.now() + 60_000), 1000);
      const overdue = await request<{ requests: Array<Record<string, unknown>> }>(ownerServer.baseUrl, listUrl);
      assert.equal(overdue.body.requests[0].status, "sent");
      assert.equal(overdue.body.requests[0].confirmationPending, true);
      const overdueAt = overdue.body.requests[0].confirmationOverdueAt;
      assert.ok(overdueAt);
      await storage.updateReportDeliveryStatusFromProvider({
        channel: "email", providerMessageId: delivery.id, status: "delivered",
      });
      const confirmed = await request<{ requests: Array<Record<string, unknown>> }>(ownerServer.baseUrl, listUrl);
      assert.equal(confirmed.body.requests[0].status, "delivered");
      assert.equal(confirmed.body.requests[0].confirmationPending, false);
      assert.equal(confirmed.body.requests[0].confirmationOverdueAt, overdueAt);
      assert.equal((await request(anonymousServer.baseUrl, listUrl)).status, 401);
      assert.equal((await request(anonymousServer.baseUrl, `/api/investments/report-deliveries/${delivery.id}`)).status, 401);

      const failedDelivery = await storage.createReportDeliveryRequest({
        userId: ownerId, reportId: report.id, ticker: report.ticker, channel: "email",
        contact: "owner@example.com", useRegisteredContact: false, idempotencyKey: randomUUID(),
      });
      await storage.updateReportDeliveryRequest(failedDelivery.id, { status: "sent", providerMessageId: failedDelivery.id });
      await storage.flagUnconfirmedReportDeliveries(new Date(Date.now() + 60_000), 1000);
      const failedOverdueAt = (await storage.getReportDeliveryRequest(ownerId, failedDelivery.id))?.confirmationOverdueAt;
      assert.ok(failedOverdueAt);
      await storage.updateReportDeliveryStatusFromProvider({
        channel: "email", providerMessageId: failedDelivery.id, status: "failed",
        errorCode: "provider_failed", errorMessage: "Synthetic provider failure",
      });
      const finalHistory = await request<{ requests: Array<Record<string, unknown>> }>(ownerServer.baseUrl, listUrl);
      const failed = finalHistory.body.requests.find((entry) => entry.id === failedDelivery.id)!;
      assert.equal(failed.status, "failed");
      assert.equal(failed.confirmationPending, false);
      assert.equal(failed.confirmationOverdueAt, failedOverdueAt);
    } finally {
      await closeServer(ownerServer.server);
      await closeServer(otherServer.server);
      await closeServer(anonymousServer.server);
    }
  });

  it("confirms Resend delivery and ignores stale provider failures", async () => {
    const originalSecret = process.env.RESEND_WEBHOOK_SECRET;
    const secret = "delivery-webhook-test-secret";
    process.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from(secret).toString("base64")}`;
    const userId = `delivery-webhook-${randomUUID()}`;
    const report = await storage.createReport({
      userId,
      ticker: "BBDC3",
      companyName: "Banco Bradesco",
      price: 15,
      changePercent: 1,
      signal: "Acompanhamento positivo",
      summary: "Resumo de teste",
      strengths: ["Força"],
      risks: ["Risco"],
      riskScore: null,
      outlook: "Perspectiva",
      source: "Teste",
    });
    const delivery = await storage.createReportDeliveryRequest({
      userId,
      reportId: report.id,
      idempotencyKey: randomUUID(),
      ticker: report.ticker,
      channel: "email",
      contact: "owner@example.com",
      useRegisteredContact: false,
    });
    const providerMessageId = `resend-${randomUUID()}`;
    await storage.updateReportDeliveryRequest(delivery.id, {
      status: "sent",
      providerMessageId,
    });

    const { server, baseUrl } = await startWebhookServer();
    const timestamp = Math.floor(Date.now() / 1000).toString();

    try {
      const deliveredPayload = JSON.stringify({
        type: "email.delivered",
        data: { email_id: providerMessageId },
      });
      const deliveredResponse = await request<{ received: boolean }>(baseUrl, "/api/webhooks/resend", {
        method: "POST",
        body: deliveredPayload,
        headers: resendWebhookHeaders(secret, deliveredPayload, timestamp),
      });
      assert.equal(deliveredResponse.status, 200);
      assert.equal(deliveredResponse.body.received, true);

      const delivered = await storage.getReportDeliveryRequest(userId, delivery.id);
      assert.equal(delivered?.status, "delivered");
      assert.ok(delivered?.deliveredAt);

      const staleFailurePayload = JSON.stringify({
        type: "email.bounced",
        data: { email_id: providerMessageId, reason: "late test event" },
      });
      const staleFailureResponse = await request<{ received: boolean }>(baseUrl, "/api/webhooks/resend", {
        method: "POST",
        body: staleFailurePayload,
        headers: resendWebhookHeaders(secret, staleFailurePayload, timestamp),
      });
      assert.equal(staleFailureResponse.status, 200);
      assert.equal((await storage.getReportDeliveryRequest(userId, delivery.id))?.status, "delivered");
    } finally {
      await closeServer(server);
      if (originalSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
      else process.env.RESEND_WEBHOOK_SECRET = originalSecret;
    }
  });
});

describe("provider webhook regression protection", () => {
  it("accepts only a configured WhatsApp subscription handshake and returns the exact challenge", async () => {
    await withWebhookServer(async (baseUrl) => {
      const challenge = "00123456789";
      const query = new URLSearchParams({
        "hub.mode": "subscribe",
        "hub.verify_token": webhookTestSecret,
        "hub.challenge": challenge,
      });
      const response = await fetch(`${baseUrl}/api/webhooks/whatsapp?${query}`);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), challenge);

      for (const [key, value] of [
        ["hub.mode", "unsubscribe"],
        ["hub.verify_token", "incorrect-token"],
        ["hub.challenge", null],
        ["hub.verify_token", null],
      ] as const) {
        const invalid = new URLSearchParams(query);
        if (value === null) invalid.delete(key);
        else invalid.set(key, value);
        const rejected = await fetch(`${baseUrl}/api/webhooks/whatsapp?${invalid}`);
        assert.equal(rejected.status, 403, key);
        assert.equal(await rejected.text(), "Forbidden");
      }

      delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
      const unconfigured = await fetch(`${baseUrl}/api/webhooks/whatsapp?${query}`);
      assert.equal(unconfigured.status, 403);
      await unconfigured.text();
    });
  });

  for (const provider of ["resend", "whatsapp"] as const) {
    it(`returns 500 on temporary ${provider} storage failure and confirms the authenticated retry`, async (t) => {
      await withWebhookServer(async (baseUrl) => {
        forbidWebhookProviderCalls(t, baseUrl);
        const fixture = await createWebhookDelivery(provider);
        const payload = providerPayload(provider, fixture.providerMessageId, "delivered");
        const update = storage.updateReportDeliveryStatusFromProvider.bind(storage);
        let unavailable = true;
        const write = t.mock.method(storage, "updateReportDeliveryStatusFromProvider", async (input) => {
          if (unavailable) throw new Error("Synthetic temporary storage failure");
          return update(input);
        });

        const response = await request<{ error?: string; received?: boolean }>(baseUrl, `/api/webhooks/${provider}`, {
          method: "POST", body: payload, headers: webhookHeaders(provider, payload),
        });
        assert.equal(response.status, 500);
        assert.deepEqual(response.body, { error: "Não foi possível processar o webhook." });
        assert.equal(Object.hasOwn(response.body, "received"), false);
        assert.equal(write.mock.callCount(), 1, "authenticated callback reached storage");
        assert.deepEqual(await fixture.current(), fixture.initial, "failed persistence cannot confirm delivery");

        unavailable = false;
        await postProviderEvent(baseUrl, provider, payload);
        assert.equal(write.mock.callCount(), 2);
        const confirmed = await fixture.current();
        assert.equal(confirmed?.status, "delivered");
        assert.ok(confirmed?.deliveredAt);
        assert.equal(confirmed?.providerMessageId, fixture.providerMessageId);
        assert.equal(confirmed?.attemptCount, fixture.initial?.attemptCount, "retry must not resend");
        assert.equal(confirmed?.errorCode, null);
        assert.equal(confirmed?.errorMessage, null);
        await postProviderEvent(baseUrl, provider, payload);
        assert.deepEqual(await fixture.current(), confirmed, "duplicate retry preserves the terminal record");
      });
    });

    for (const firstFinal of ["delivered", "failed"] as const) {
      it(`recovers early ${provider} ${firstFinal} confirmations once the send is linked, without resending`, async () => {
        await withWebhookServer(async (baseUrl) => {
          const fixture = await createWebhookDelivery(provider, false);
          const payload = providerPayload(provider, fixture.providerMessageId, firstFinal);
          // The authenticated callback completes before the provider's return ID is persisted.
          await postProviderEvent(baseUrl, provider, payload);
          await postProviderEvent(baseUrl, provider, payload);
          await postProviderEvent(baseUrl, provider, providerPayload(provider, fixture.providerMessageId, "sent"));
          await postProviderEvent(baseUrl, provider, providerPayload(
            provider, fixture.providerMessageId, firstFinal === "delivered" ? "failed" : "delivered",
          ));
          assert.deepEqual(await fixture.current(), fixture.initial);
          const pending = await pool.query(
            "SELECT * FROM report_delivery_provider_events WHERE provider_message_id = $1 ORDER BY id",
            [fixture.providerMessageId],
          );
          assert.equal(pending.rowCount, 3, "duplicates occupy no extra storage");
          await fixture.link();
          const final = await fixture.current();
          assert.equal(final?.status, firstFinal);
          assert.equal(final?.providerMessageId, fixture.providerMessageId);
          assert.equal(final?.attemptCount, 0, "confirmation recovery never claims or resends");
          assert.equal(final?.errorCode, firstFinal === "failed"
            ? provider === "resend" ? "EMAIL_DELIVERY_FAILED" : "WHATSAPP_DELIVERY_FAILED"
            : null);
          assert.equal((await pool.query(
            "SELECT 1 FROM report_delivery_provider_events WHERE provider_message_id = $1",
            [fixture.providerMessageId],
          )).rowCount, 0);
          await fixture.link();
          await postProviderEvent(baseUrl, provider, payload);
          assert.deepEqual(await fixture.current(), final, "terminal status and timestamps stay unchanged");
        });
      });
    }

    it(`serializes ${provider} confirmation ingestion against simultaneous send registration`, async () => {
      await withWebhookServer(async (baseUrl) => {
        const fixture = await createWebhookDelivery(provider, false);
        await Promise.all([
          postProviderEvent(baseUrl, provider, providerPayload(provider, fixture.providerMessageId, "delivered")),
          fixture.link(),
          postProviderEvent(baseUrl, provider, providerPayload(provider, fixture.providerMessageId, "delivered")),
        ]);
        assert.equal((await fixture.current())?.status, "delivered");
        assert.equal((await pool.query(
          "SELECT 1 FROM report_delivery_provider_events WHERE provider_message_id = $1",
          [fixture.providerMessageId],
        )).rowCount, 0);
      });
    });

    it(`does not store unauthenticated early ${provider} confirmations`, async () => {
      await withWebhookServer(async (baseUrl) => {
        const fixture = await createWebhookDelivery(provider, false);
        const response = await request(baseUrl, `/api/webhooks/${provider}`, {
          method: "POST", body: providerPayload(provider, fixture.providerMessageId, "delivered"),
        });
        assert.equal(response.status, 401);
        await fixture.link();
        assert.equal((await fixture.current())?.status, "sent");
      });
    });

    it(`rejects unauthenticated and tampered ${provider} events without changing the delivery`, async () => {
      await withWebhookServer(async (baseUrl) => {
        const fixture = await createWebhookDelivery(provider);
        const payload = providerPayload(provider, fixture.providerMessageId, "delivered");
        const validHeaders = webhookHeaders(provider, payload);
        const invalidHeaders: HeadersInit[] = provider === "whatsapp"
          ? [
            {},
            { "x-hub-signature-256": "sha256=bad" },
            { "x-hub-signature-256": `sha256=${"0".repeat(64)}` },
            { "x-hub-signature-256": `sha1=${"0".repeat(64)}` },
          ]
          : [
            {},
            { ...validHeaders, "svix-signature": "v1,bad" },
            { ...validHeaders, "svix-id": "different-message" },
            resendWebhookHeaders(webhookTestSecret, payload, String(Math.floor(Date.now() / 1000) - 600)),
            resendWebhookHeaders(webhookTestSecret, payload, String(Math.floor(Date.now() / 1000) + 600)),
            resendWebhookHeaders(webhookTestSecret, payload, "not-a-timestamp"),
          ];
        for (const headers of invalidHeaders) {
          const response = await request(baseUrl, `/api/webhooks/${provider}`, {
            method: "POST", body: payload, headers,
          });
          assert.equal(response.status, 401);
          assert.deepEqual(await fixture.current(), fixture.initial);
        }

        // Even equivalent JSON must be signed using the exact bytes received.
        const tampered = await request(baseUrl, `/api/webhooks/${provider}`, {
          method: "POST", body: `${payload}\n`, headers: validHeaders,
        });
        assert.equal(tampered.status, 401);
        assert.deepEqual(await fixture.current(), fixture.initial);

        delete process.env[provider === "resend" ? "RESEND_WEBHOOK_SECRET" : "WHATSAPP_APP_SECRET"];
        const unconfigured = await request(baseUrl, `/api/webhooks/${provider}`, {
          method: "POST", body: payload, headers: validHeaders,
        });
        assert.equal(unconfigured.status, 401);
        assert.deepEqual(await fixture.current(), fixture.initial);
      });
    });

    for (const confirmation of provider === "whatsapp" ? ["delivered", "read"] : ["delivered"]) {
      it(`${provider} ${confirmation} confirms delivery and cannot be downgraded by late or duplicate events`, async () => {
        await withWebhookServer(async (baseUrl) => {
          const fixture = await createWebhookDelivery(provider);
          await postProviderEvent(baseUrl, provider, providerPayload(provider, fixture.providerMessageId, confirmation));
          const confirmed = await fixture.current();
          assert.equal(confirmed?.status, "delivered");
          assert.ok(confirmed?.deliveredAt);
          assert.equal(confirmed?.errorCode, null);
          assert.equal(confirmed?.errorMessage, null);

          for (const status of ["sent", "failed", "delivered", ...(provider === "whatsapp" ? ["read"] : ["bounced", "complained"]), "unknown"]) {
            await postProviderEvent(baseUrl, provider, providerPayload(provider, fixture.providerMessageId, status));
            assert.deepEqual(await fixture.current(), confirmed, `late ${status} must preserve the confirmed record`);
          }
        });
      });
    }

    for (const failure of provider === "resend" ? ["failed", "bounced", "complained"] : ["failed"]) {
      it(`${provider} ${failure} records the provider error and preserves the terminal failure`, async () => {
        await withWebhookServer(async (baseUrl) => {
          const fixture = await createWebhookDelivery(provider);
          await postProviderEvent(baseUrl, provider, providerPayload(provider, fixture.providerMessageId, failure));
          const failed = await fixture.current();
          assert.equal(failed?.status, "failed");
          assert.equal(failed?.deliveredAt, null);
          const errorCodes: Record<string, string> = {
            failed: provider === "resend" ? "EMAIL_DELIVERY_FAILED" : "WHATSAPP_DELIVERY_FAILED",
            bounced: "EMAIL_BOUNCED",
            complained: "EMAIL_COMPLAINT",
          };
          assert.equal(failed?.errorCode, errorCodes[failure]);
          assert.equal(failed?.errorMessage, "Provider test failure");
          for (const status of ["sent", "delivered", "failed", ...(provider === "whatsapp" ? ["read"] : [])]) {
            await postProviderEvent(baseUrl, provider, providerPayload(provider, fixture.providerMessageId, status));
            assert.deepEqual(await fixture.current(), failed);
          }
        });
      });
    }

    it(`acknowledges unknown, malformed and unmatched ${provider} events without changing existing deliveries`, async () => {
      await withWebhookServer(async (baseUrl) => {
        const fixture = await createWebhookDelivery(provider);
        const payloads = [
          providerPayload(provider, fixture.providerMessageId, "unknown"),
          providerPayload(provider, `missing-${randomUUID()}`, "delivered"),
          JSON.stringify({}),
          JSON.stringify(provider === "resend"
            ? { type: "email.delivered", data: { email_id: 123 } }
            : { entry: [null, { changes: [null, { value: { statuses: [null, { id: fixture.providerMessageId }, { id: 123, status: "delivered" }] } }] }] }),
        ];
        for (const payload of payloads) {
          await postProviderEvent(baseUrl, provider, payload);
          assert.deepEqual(await fixture.current(), fixture.initial);
        }
      });
    });
  }

  it("expires unmatched events and never applies an expired confirmation to a newly linked send", async () => {
    await withWebhookServer(async (baseUrl) => {
      const fixture = await createWebhookDelivery("resend", false);
      await postProviderEvent(baseUrl, "resend", providerPayload("resend", fixture.providerMessageId, "delivered"));
      await pool.query(
        `UPDATE report_delivery_provider_events SET received_at = NOW() - INTERVAL '8 days'
         WHERE provider_message_id = $1`,
        [fixture.providerMessageId],
      );
      await storage.pruneReportDeliveryProviderEvents();
      assert.equal((await pool.query(
        "SELECT 1 FROM report_delivery_provider_events WHERE provider_message_id = $1",
        [fixture.providerMessageId],
      )).rowCount, 0);
      await fixture.link();
      assert.equal((await fixture.current())?.status, "sent");
    });
  });

  it("bounds unmatched event storage, accepts duplicates at capacity and requests retry instead of dropping new events", async () => {
    await withWebhookServer(async (baseUrl) => {
      const prefix = `capacity-${randomUUID()}`;
      await storage.pruneReportDeliveryProviderEvents();
      const count = await pool.query("SELECT COUNT(*)::int AS total FROM report_delivery_provider_events");
      const room = PROVIDER_EVENT_MAX_PENDING - count.rows[0].total;
      try {
        await pool.query(
          `INSERT INTO report_delivery_provider_events (channel, provider_message_id, status)
           SELECT 'email', $1 || '-' || n, 'delivered' FROM generate_series(1, $2::int) n`,
          [prefix, room],
        );
        await postProviderEvent(baseUrl, "resend", providerPayload("resend", `${prefix}-1`, "delivered"));
        for (const provider of ["resend", "whatsapp"] as const) {
          const payload = providerPayload(provider, `${prefix}-overflow-${provider}`, "delivered");
          const response = await request(baseUrl, `/api/webhooks/${provider}`, {
            method: "POST", body: payload, headers: webhookHeaders(provider, payload),
          });
          assert.equal(response.status, 500, "provider must retry an event that could not be retained");
        }
        assert.equal((await pool.query(
          "SELECT COUNT(*)::int AS total FROM report_delivery_provider_events",
        )).rows[0].total, PROVIDER_EVENT_MAX_PENDING);
        await pool.query(
          `UPDATE report_delivery_provider_events SET received_at = NOW() - INTERVAL '8 days'
           WHERE provider_message_id = $1`,
          [`${prefix}-1`],
        );
        const payload = providerPayload("resend", `${prefix}-after-expiration`, "delivered");
        await postProviderEvent(baseUrl, "resend", payload);
        assert.equal((await pool.query(
          "SELECT COUNT(*)::int AS total FROM report_delivery_provider_events",
        )).rows[0].total, PROVIDER_EVENT_MAX_PENDING);
      } finally {
        await pool.query("DELETE FROM report_delivery_provider_events WHERE provider_message_id LIKE $1", [`${prefix}%`]);
      }
    });
  });

  it("keeps early confirmations isolated by channel and bounds stored diagnostic text", async () => {
    await withWebhookServer(async (baseUrl) => {
      const fixture = await createWebhookDelivery("resend", false);
      const wrongChannel = providerPayload("whatsapp", fixture.providerMessageId, "delivered");
      try {
        await postProviderEvent(baseUrl, "whatsapp", wrongChannel);
        const failure = JSON.stringify({
          type: "email.failed", data: { email_id: fixture.providerMessageId, reason: "x".repeat(2000) },
        });
        await postProviderEvent(baseUrl, "resend", failure);
        const queued = await pool.query(
          "SELECT error_message FROM report_delivery_provider_events WHERE channel = 'email' AND provider_message_id = $1",
          [fixture.providerMessageId],
        );
        assert.equal(queued.rows[0].error_message.length, 500);
        await fixture.link();
        assert.equal((await fixture.current())?.status, "failed");
        assert.equal((await fixture.current())?.errorMessage?.length, 500);
      } finally {
        await pool.query("DELETE FROM report_delivery_provider_events WHERE provider_message_id = $1", [fixture.providerMessageId]);
      }
    });
  });

  it("returns 500 for a partial WhatsApp batch and preserves confirmed items on authenticated retry", async (t) => {
    await withWebhookServer(async (baseUrl) => {
      forbidWebhookProviderCalls(t, baseUrl);
      const first = await createWebhookDelivery("whatsapp");
      const second = await createWebhookDelivery("whatsapp");
      const payload = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [first, second].map((fixture) => ({
          changes: [{ value: { statuses: [{ id: fixture.providerMessageId, status: "delivered" }] } }],
        })),
      });
      const update = storage.updateReportDeliveryStatusFromProvider.bind(storage);
      let unavailable = true;
      let firstWrite: ReturnType<typeof update> | undefined;
      const write = t.mock.method(storage, "updateReportDeliveryStatusFromProvider", async (input) => {
        if (input.providerMessageId === first.providerMessageId) {
          firstWrite = update(input);
          return firstWrite;
        }
        // Make the partial success deterministic even though batch writes run concurrently.
        assert.ok(firstWrite);
        await firstWrite;
        if (unavailable) throw new Error("Synthetic temporary batch storage failure");
        return update(input);
      });

      const response = await request<{ error?: string; received?: boolean }>(baseUrl, "/api/webhooks/whatsapp", {
        method: "POST", body: payload, headers: webhookHeaders("whatsapp", payload),
      });
      assert.equal(response.status, 500);
      assert.deepEqual(response.body, { error: "Não foi possível processar o webhook." });
      assert.equal(Object.hasOwn(response.body, "received"), false);
      assert.equal(write.mock.callCount(), 2);
      const confirmedFirst = await first.current();
      assert.equal(confirmedFirst?.status, "delivered");
      assert.ok(confirmedFirst?.deliveredAt);
      assert.deepEqual(await second.current(), second.initial);

      unavailable = false;
      await postProviderEvent(baseUrl, "whatsapp", payload);
      assert.equal(write.mock.callCount(), 4, "the whole authenticated batch is retried");
      assert.deepEqual(await first.current(), confirmedFirst, "retry preserves all fields and timestamps of the confirmed item");
      const confirmedSecond = await second.current();
      assert.equal(confirmedSecond?.status, "delivered");
      assert.ok(confirmedSecond?.deliveredAt);
      assert.equal(confirmedSecond?.providerMessageId, second.providerMessageId);
      assert.equal(confirmedSecond?.attemptCount, second.initial?.attemptCount);
      await postProviderEvent(baseUrl, "whatsapp", payload);
      assert.deepEqual(await first.current(), confirmedFirst);
      assert.deepEqual(await second.current(), confirmedSecond);
    });
  });

  it("processes WhatsApp statuses across multiple entries and changes while skipping malformed siblings", async () => {
    await withWebhookServer(async (baseUrl) => {
      const delivered = await createWebhookDelivery("whatsapp");
      const read = await createWebhookDelivery("whatsapp");
      const failed = await createWebhookDelivery("whatsapp");
      const unknown = await createWebhookDelivery("whatsapp");
      const payload = JSON.stringify({
        object: "whatsapp_business_account",
        entry: [
          null,
          { changes: [
            { value: { statuses: [null, { id: delivered.providerMessageId, status: "delivered" }, { status: "read" }] } },
            { value: { statuses: [{ id: read.providerMessageId, status: "read" }] } },
          ] },
          { changes: [{ value: { statuses: [
            { id: failed.providerMessageId, status: "failed", errors: [{ error_data: { details: "Nested provider failure" } }] },
            { id: unknown.providerMessageId, status: "future-status" },
          ] } }] },
        ],
      });
      await postProviderEvent(baseUrl, "whatsapp", payload);
      assert.equal((await delivered.current())?.status, "delivered");
      assert.equal((await read.current())?.status, "delivered");
      assert.ok((await read.current())?.deliveredAt);
      assert.equal((await failed.current())?.status, "failed");
      assert.equal((await failed.current())?.errorMessage, "Nested provider failure");
      assert.deepEqual(await unknown.current(), unknown.initial);
    });
  });
});

type WebhookProvider = "resend" | "whatsapp";
const webhookTestSecret = "provider-webhook-regression-test-secret";

function forbidWebhookProviderCalls(t: TestContext, baseUrl: string): void {
  const originalFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    assert.equal(new URL(url).origin, baseUrl, "webhook tests must not access external services");
    return originalFetch(input, init);
  });
  t.mock.method(ReplitConnectors.prototype, "proxy", async () => {
    assert.fail("webhook tests must not call delivery providers");
  });
}

async function withWebhookServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const keys = ["RESEND_WEBHOOK_SECRET", "WHATSAPP_APP_SECRET", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"] as const;
  const original = keys.map((key) => process.env[key]);
  process.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from(webhookTestSecret).toString("base64")}`;
  process.env.WHATSAPP_APP_SECRET = webhookTestSecret;
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = webhookTestSecret;
  let server: Server | undefined;
  try {
    const started = await startWebhookServer();
    server = started.server;
    await run(started.baseUrl);
  } finally {
    if (server) await closeServer(server);
    keys.forEach((key, index) => {
      if (original[index] === undefined) delete process.env[key];
      else process.env[key] = original[index];
    });
  }
}

async function startWebhookServer(): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  app.use(express.json({
    verify: (req, _res, buffer) => Object.assign(req, { rawBody: buffer }),
  }));
  const server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Webhook test server did not start.");
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function createWebhookDelivery(provider: WebhookProvider, linked = true) {
  const userId = `provider-webhook-${randomUUID()}`;
  const report = await storage.createReport({
    userId, ticker: "BBDC3", companyName: "Banco Bradesco", price: 15,
    changePercent: 1, signal: "Acompanhamento", summary: "Resumo de teste",
    strengths: ["Força"], risks: ["Risco"], riskScore: null,
    outlook: "Perspectiva", source: "Teste",
  });
  const delivery = await storage.createReportDeliveryRequest({
    userId, reportId: report.id, idempotencyKey: randomUUID(), ticker: report.ticker,
    channel: provider === "resend" ? "email" : "whatsapp",
    contact: provider === "resend" ? "owner@example.com" : "+5511999999999",
    useRegisteredContact: false,
  });
  const providerMessageId = `${provider}-${randomUUID()}`;
  const link = () => storage.updateReportDeliveryRequest(delivery.id, { status: "sent", providerMessageId });
  if (linked) await link();
  const current = () => storage.getReportDeliveryRequest(userId, delivery.id);
  return { providerMessageId, current, link, initial: await current() };
}

function providerPayload(provider: WebhookProvider, id: string, status: string): string {
  return JSON.stringify(provider === "resend"
    ? { type: `email.${status}`, data: { email_id: id, reason: "Provider test failure" } }
    : {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: { statuses: [{
        id, status, errors: [{ title: "Provider test failure" }],
      }] } }] }],
    });
}

function webhookHeaders(provider: WebhookProvider, payload: string): HeadersInit {
  return provider === "resend"
    ? resendWebhookHeaders(webhookTestSecret, payload, String(Math.floor(Date.now() / 1000)))
    : { "x-hub-signature-256": `sha256=${createHmac("sha256", webhookTestSecret).update(payload).digest("hex")}` };
}

async function postProviderEvent(baseUrl: string, provider: WebhookProvider, payload: string): Promise<void> {
  const response = await request<{ received: boolean }>(baseUrl, `/api/webhooks/${provider}`, {
    method: "POST", body: payload, headers: webhookHeaders(provider, payload),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { received: true });
}

async function startAuthenticatedServer(userId: string): Promise<{
  server: Server;
  baseUrl: string;
}> {
  const app = express();
  app.use(express.json());

  const authHandler = Object.assign(
    () => ({ userId, tokenType: "session_token" }),
    { [Symbol.for("@clerk/express.auth")]: true },
  );
  app.use((req, _res, next) => {
    Object.assign(req, { auth: authHandler });
    next();
  });

  const server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Test server did not expose a local address.");
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function request<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<ApiResponse<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
  return {
    status: response.status,
    body: JSON.parse(await response.text()) as T,
  };
}

function resendWebhookHeaders(secret: string, body: string, timestamp: string): HeadersInit {
  const id = `msg-${randomUUID()}`;
  const signature = createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${signature}`,
  };
}

function pickPositionFields(
  item: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!item) return undefined;
  return {
    ticker: item.ticker,
    quantity: item.quantity,
    averagePrice: item.averagePrice,
    investedValue: item.investedValue,
    realizedProfit: item.realizedProfit,
  };
}
