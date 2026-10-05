import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { createServer, type Server } from "node:http";
import { after, afterEach, describe, it } from "node:test";
import { registerRoutes } from "./routes";
import { closeStorage, storage, type InvestmentReport } from "./storage";
import { closeSuitability } from "./suitability";
import { processReportDeliveryRequests, startReportDeliveryWorker } from "./report-delivery";
import type { ReportPresentation } from "../shared/report-quality";
import { reviewRepository } from "./professional-review";
import { QUESTOES } from "./suitability";

// No DB connections, migrations, provider traffic, credentials or actual customer rows.
const originalFetch = globalThis.fetch;
const originalList = storage.listReports;
const originalCreate = storage.createReport;
const originalClaim = storage.claimReportDeliveryRequests;
const originalPortfolio = storage.getPortfolioSnapshot;
const originalFlag = storage.flagUnconfirmedReportDeliveries;
const originalRepository = { ...reviewRepository };
let documents: InvestmentReport[] = [];
let servers: Server[] = [];
let compatible = false;
const seenOwners: string[] = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()))));
  servers = [];
  storage.listReports = originalList;
  storage.createReport = originalCreate;
  storage.claimReportDeliveryRequests = originalClaim;
  storage.getPortfolioSnapshot = originalPortfolio;
  storage.flagUnconfirmedReportDeliveries = originalFlag;
  Object.assign(reviewRepository, originalRepository);
  globalThis.fetch = originalFetch;
  documents = [];
  seenOwners.length = 0;
  compatible = false;
});
after(async () => { await Promise.all([closeStorage(), closeSuitability()]); });

type PublicReport = InvestmentReport & ReportPresentation;
describe("Invest quality API with isolated in-memory synthetic storage", () => {
  it("opening lists or empty details never starts analysis or calls an external provider", async () => {
    const url = await start("owner");
    globalThis.fetch = async () => { throw new Error("Reading must not call providers"); };
    const list = await originalFetch(`${url}/api/investments/reports`);
    assert.equal(list.status, 200);
    assert.deepEqual((await list.json() as { reports: unknown[] }).reports, []);
    assert.equal((await originalFetch(`${url}/api/investments/reports/BBDC3`)).status, 404);
    assert.equal(documents.length, 0);
  });
  it("reading an expired report preserves its date without refreshing or calling providers", async () => {
    const old = fixture("owner"); old.generatedAt = "2020-01-01T00:00:00Z"; documents = [old];
    const url = await start("owner");
    globalThis.fetch = async () => { throw new Error("Reading must not call providers"); };
    const response = await originalFetch(`${url}/api/investments/reports/BBDC3`);
    assert.equal(response.status, 200);
    const body = await response.json() as { latest: PublicReport };
    assert.equal(body.latest.analysisStatus, "outdated");
    assert.equal(body.latest.generatedAt, old.generatedAt);
    assert.equal(documents.length, 1);
  });

  it("complete valid report is information only; profile absent and consultant review remain pending", async () => {
    documents = [fixture("owner")];
    const url = await start("owner");
    const response = await originalFetch(`${url}/api/investments/reports/BBDC3`);
    const body = await response.json() as { latest: PublicReport; history: PublicReport[] };
    assert.equal(response.status, 200);
    assert.equal(body.latest.analysisStatus, "complete");
    assert.equal(body.latest.recommendation.status, "pending");
    assert.equal(body.latest.recommendation.profileStatus, "pending");
    assert.equal(body.latest.signal, "Recomendação pendente");
    assert.equal(body.history[0].historical, true);
    assert.equal(body.history[0].analysisStatus, "outdated");
  });
  it("compatible profile never substitutes for consultant approval", async () => {
    compatible = true;
    documents = [fixture("owner")];
    const url = await start("owner");
    const body = await (await originalFetch(`${url}/api/investments/reports/BBDC3`)).json() as { latest: PublicReport };
    assert.equal(body.latest.recommendation.profileStatus, "compatible");
    assert.equal(body.latest.recommendation.professionalReview, "pending");
    assert.equal(body.latest.recommendation.status, "pending");
  });
  it("legacy refresh cannot spend tokens, mutate reports or bypass the wallet", async () => {
    documents = [fixture("owner"), fixture("other")];
    const original = structuredClone(documents);
    const url = await start("owner");
    const refreshed = await originalFetch(`${url}/api/investments/reports/BBDC3/refresh`, { method: "POST" });
    assert.equal(refreshed.status, 503);
    assert.equal((await refreshed.json()).code, "LEGACY_ANALYSIS_DISABLED");
    assert.deepEqual(documents, original);
    const response = await originalFetch(`${url}/api/investments/reports`);
    const body = await response.json() as { reports: PublicReport[] };
    assert.equal(response.status, 200);
    assert.ok(body.reports.every(r => r.userId === "owner"));
    assert.ok(seenOwners.every(owner => owner === "owner"));
  });
  it("partial and unavailable documents have no public consensus or valid financial signal", async () => {
    for (const status of ["partial", "unavailable"] as const) {
      documents = [fixture("owner", status)];
      const url = await start("owner");
      const body = await (await originalFetch(`${url}/api/investments/reports/BBDC3`)).json() as { latest: PublicReport };
      assert.equal(body.latest.analysisStatus, status);
      assert.equal(body.latest.consensusScore, null);
      assert.equal(body.latest.riskScore, null);
      assert.equal(body.latest.signal, "Recomendação pendente");
    }
  });
  it("elevated risk is disclosed and the recommendation remains pending", async () => {
    const report = fixture("owner");
    report.riskScore = 9;
    report.analysisQuality!.highRisk = true;
    documents = [report];
    const url = await start("owner");
    const body = await (await originalFetch(`${url}/api/investments/reports/BBDC3`)).json() as { latest: PublicReport };
    assert.equal(body.latest.highRisk, true);
    assert.ok(body.latest.recommendation.reasons.some((r) => r.includes("veto")));
  });
  it("denies unapproved delivery before any queue lookup or external provider call", async () => {
    const url = await start("owner");
    const response = await originalFetch(`${url}/api/investments/reports/BBDC3/delivery`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: "email", contact: "synthetic@example.test", idempotencyKey: "synthetic-attempt" }),
    });
    assert.equal(response.status, 409);
    const body = await response.json() as { error: string };
    assert.equal(body.error, "RECOMMENDATION_PENDING");
    storage.claimReportDeliveryRequests = async () => [];
    storage.flagUnconfirmedReportDeliveries = async () => [];
    await processReportDeliveryRequests();
    startReportDeliveryWorker()();
  });
  it("requires Clerk identity for portfolio, report reads and generation", async () => {
    const url = await start(null);
    for (const [path, method] of [
      ["/api/investments/portfolio", "GET"],
      ["/api/investments/portfolio/transactions", "POST"],
      ["/api/investments/reports", "GET"],
      ["/api/investments/reports/BBDC3", "GET"],
      ["/api/investments/reports/BBDC3/refresh", "POST"],
    ]) {
      const response = await originalFetch(`${url}${path}`, { method });
      assert.equal(response.status, 401);
    }
    assert.equal(seenOwners.length, 0);
  });
  it("generic portfolio queries remain available and owner-scoped without recommendations", async () => {
    const url = await start("owner");
    storage.getPortfolioSnapshot = async (owner) => {
      assert.equal(owner, "owner");
      return { transactions: [], positions: [], realizedProfit: 0 };
    };
    const response = await originalFetch(`${url}/api/investments/portfolio`);
    assert.equal(response.status, 200);
    const body = await response.json() as { items: unknown[] };
    assert.deepEqual(body.items, []);
  });
});

function fixture(userId: string, status: "complete" | "partial" | "unavailable" = "complete"): InvestmentReport {
  const now = new Date().toISOString();
  return {
    id: randomUUID(), userId, ticker: "BBDC3", companyName: "Empresa sintética",
    generatedAt: now, price: 25, changePercent: 0,
    signal: "Recomendação pendente", summary: "Informação sintética.", strengths: [], risks: [],
    riskScore: status === "complete" ? 3 : null, outlook: "Revisão pendente.", source: "Fonte sintética",
    analysisQuality: {
      version: 1, status, reason: `Análise ${status} de teste.`,
      availableAgents: status === "complete" ? 9 : status === "partial" ? 8 : 0,
      expectedAgents: 9, missingAgents: [], consensusScore: status === "complete" ? 7 : null,
      highRisk: false, marketDataAt: now, fundamentalsPeriod: "2026-06-30",
    },
  };
}

async function start(userId: string | null): Promise<string> {
  reviewRepository.profile = async (owner) => compatible ? {
    id: "synthetic-profile", userId: owner, perfil: "AGRESSIVO", pontuacaoMedia: 5,
    respostas: Object.fromEntries(QUESTOES.map(q => [q.id, 4])),
    dataAvaliacao: new Date(Date.now() - 1000).toISOString(),
    dataProximaReavaliacao: new Date(Date.now() + 86400000).toISOString(),
  } : null;
  reviewRepository.history = async () => [];
  reviewRepository.authorized = async () => false;
  storage.listReports = async (owner, ticker) => {
    seenOwners.push(owner);
    return documents.filter((d) => d.userId === owner && (!ticker || ticker === d.ticker));
  };
  storage.createReport = async (input) => {
    seenOwners.push(input.userId);
    const report = { ...input, id: randomUUID(), generatedAt: new Date().toISOString() };
    documents.unshift(report);
    return report;
  };
  // Network access is blocked. Only originalFetch above reaches the local test server.
  globalThis.fetch = async () => { throw new Error("Synthetic market outage; external requests are blocked"); };
  const app = express();
  app.use(express.json());
  const authHandler = Object.assign(() => ({ userId, tokenType: "session_token" }), {
    [Symbol.for("@clerk/express.auth")]: true,
  });
  app.use((req, _res, next) => { Object.assign(req, { auth: authHandler }); next(); });
  const server = createServer(app);
  servers.push(server);
  await registerRoutes(server, app, {
    checkProfile: async (owner) => {
      assert.equal(owner, userId);
      return compatible ? { ok: true } : { ok: false, motivo: "Sem perfil suficiente avaliado." };
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}