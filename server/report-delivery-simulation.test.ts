import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "node:http";
import { after, afterEach, describe, it, mock } from "node:test";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { registerRoutes } from "./routes";
import { closeStorage, storage } from "./storage";
import { closeSuitability } from "./suitability";
import { PostgresCreditStore } from "./credits";
import {
  assertRealReportDeliveryEnabled,
  isReportDeliveryChannelAvailable,
  processReportDeliveryRequests,
  startReportDeliveryWorker,
} from "./report-delivery";
import { REAL_REPORT_DELIVERY_ENABLED } from "../shared/simulation-policy";

const localFetch = globalThis.fetch;
const servers: Server[] = [];
afterEach(() => mock.restoreAll());
after(async () => {
  await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  await Promise.all([closeStorage(), closeSuitability()]);
});

async function app() {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    const auth = Object.assign(() => ({
      userId: req.headers["x-test-user"] ?? null, tokenType: "session_token",
    }), { [Symbol.for("@clerk/express.auth")]: true });
    Object.assign(req, { auth }); next();
  });
  const server = createServer(instance);
  servers.push(server);
  await registerRoutes(server, instance);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

describe("simulation release blocks all real report sends", () => {
  it("cannot be enabled by a configured sender, WhatsApp credentials or an environment flag", async () => {
    const names = ["DELIVERY_EMAIL_FROM", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "REAL_REPORT_DELIVERY_ENABLED"] as const;
    const previous = names.map(name => process.env[name]);
    try {
      names.forEach(name => { process.env[name] = "synthetic-only"; });
      process.env.REAL_REPORT_DELIVERY_ENABLED = "true";
      let claims = 0, providerCalls = 0;
      mock.method(storage, "claimReportDeliveryRequests", async () => { claims++; throw Error("MUST_NOT_CLAIM"); });
      mock.method(globalThis, "fetch", async () => { providerCalls++; throw Error("MUST_NOT_SEND"); });
      mock.method(ReplitConnectors.prototype, "proxy", async () => { providerCalls++; throw Error("MUST_NOT_SEND"); });
      assert.equal(REAL_REPORT_DELIVERY_ENABLED, false);
      for (const channel of ["email", "whatsapp"] as const) assert.equal(isReportDeliveryChannelAvailable(channel), false);
      assert.throws(assertRealReportDeliveryEnabled, { code: "REAL_REPORT_DELIVERY_DISABLED" });
      await processReportDeliveryRequests();
      await processReportDeliveryRequests({ id: "synthetic-approved-request", limit: 1 });
      assert.equal(claims, 0);
      assert.equal(providerCalls, 0);
    } finally {
      names.forEach((name, i) => {
        if (previous[i] === undefined) delete process.env[name];
        else process.env[name] = previous[i];
      });
    }
  });

  it("immediate and scheduled worker ticks never claim or send; passive historical monitoring remains active", async () => {
    let tick: (() => void) | undefined;
    let claims = 0, sends = 0, updates = 0, monitored = 0;
    mock.method(globalThis, "setInterval", (callback: () => void) => {
      tick = callback; return { unref() {} } as any;
    });
    mock.method(globalThis, "clearInterval", () => {});
    mock.method(storage, "claimReportDeliveryRequests", async () => { claims++; return []; });
    mock.method(storage, "updateReportDeliveryRequest", async () => { updates++; });
    mock.method(storage, "pruneReportDeliveryProviderEvents", async () => 0);
    mock.method(storage, "flagUnconfirmedReportDeliveries", async () => { monitored++; return []; });
    mock.method(globalThis, "fetch", async () => { sends++; throw Error("MUST_NOT_SEND"); });
    mock.method(ReplitConnectors.prototype, "proxy", async () => { sends++; throw Error("MUST_NOT_SEND"); });
    const stop = startReportDeliveryWorker();
    assert.ok(tick);
    tick();
    await new Promise<void>(resolve => setImmediate(resolve));
    stop();
    assert.equal(claims, 0);
    assert.equal(sends, 0);
    assert.equal(updates, 0);
    assert.equal(monitored, 2);
  });

  it("authenticated delivery endpoints reject email, WhatsApp and malformed payloads before storage or providers", async () => {
    let claims = 0, queued = 0, reads = 0, providers = 0;
    mock.method(storage, "claimReportDeliveryRequests", async () => { claims++; return []; });
    mock.method(storage, "createReportDeliveryRequest", async () => { queued++; throw Error("MUST_NOT_QUEUE"); });
    mock.method(storage, "listReports", async () => { reads++; throw Error("MUST_NOT_LOOKUP"); });
    mock.method(globalThis, "fetch", async () => { providers++; throw Error("MUST_NOT_SEND"); });
    mock.method(ReplitConnectors.prototype, "proxy", async () => { providers++; throw Error("MUST_NOT_SEND"); });
    const url = await app();
    const path = `${url}/api/investments/reports/BBDC3/delivery`;
    assert.equal((await localFetch(path, { method: "POST" })).status, 401);
    for (const body of [
      { channel: "email", contact: "synthetic@example.test", idempotencyKey: "synthetic-email" },
      { channel: "whatsapp", contact: "+5511999999999", idempotencyKey: "synthetic-whatsapp" },
      {},
    ]) {
      const response = await localFetch(path, {
        method: "POST", headers: { "content-type": "application/json", "x-test-user": "synthetic-owner" },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 403);
      assert.equal((await response.json() as { code: string }).code, "REAL_REPORT_DELIVERY_DISABLED");
    }
    assert.equal(claims + queued + reads + providers, 0);
  });

  it("credit balance endpoint does not touch the real credit ledger in this phase", async () => {
    let calls = 0;
    mock.method(PostgresCreditStore.prototype, "balance", async () => { calls++; throw Error("REAL_LEDGER_FORBIDDEN"); });
    const url = await app();
    assert.equal((await localFetch(`${url}/api/investments/credits`)).status, 401);
    const response = await localFetch(`${url}/api/investments/credits`, { headers: { "x-test-user": "synthetic-owner" } });
    assert.equal(response.status, 403);
    assert.equal((await response.json() as { code: string }).code, "REAL_ANALYSIS_DISABLED");
    assert.equal(calls, 0);
  });
});
