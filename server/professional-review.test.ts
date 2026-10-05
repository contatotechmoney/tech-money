import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { createServer, type Server } from "node:http";
import { after, afterEach, beforeEach, describe, it, mock } from "node:test";
import { Pool } from "pg";
import { registerRoutes } from "./routes";
import { closeStorage, storage, type InvestmentReport, type ClaimedReportDelivery } from "./storage";
import { closeSuitability, QUESTOES, type SuitabilityProfile } from "./suitability";
import { checkReviewedProfile, recordReview, reviewContext, reviewedReport, reviewInput, reviewRepository, versionOf } from "./professional-review";
import { canDeliverPersonalizedRecommendation } from "./report-policy";
import { processReportDeliveryRequests } from "./report-delivery";
import type { ProfessionalReview } from "../shared/report-quality";

// In-memory synthetic data only. Any unexpected database or provider access fails the test.
const fetchLocal = globalThis.fetch;
let documents: InvestmentReport[];
let profile: SuitabilityProfile | null;
let reviews: ProfessionalReview[];
let grant: boolean;
let grantTime: number;
let servers: Server[] = [];
const owner = "synthetic-client";
const consultant = "synthetic-consultant";
const recommendation = "Recomendação exclusiva sintética: manter alocação revisada para objetivo de teste.";
beforeEach(() => {
  documents = [fixture()];
  profile = {
    id: "synthetic-profile", userId: owner, perfil: "AGRESSIVO", pontuacaoMedia: 5,
    respostas: Object.fromEntries(QUESTOES.map(q => [q.id, 4])),
    dataAvaliacao: new Date(Date.now() - 1000).toISOString(),
    dataProximaReavaliacao: new Date(Date.now() + 86400000).toISOString(),
  };
  reviews = []; grant = true; grantTime = 0;
  mock.method(Pool.prototype, "query", async () => { throw new Error("Database forbidden in synthetic tests"); });
  mock.method(Pool.prototype, "connect", async () => { throw new Error("Database forbidden in synthetic tests"); });
  mock.method(globalThis, "fetch", async () => { throw new Error("Provider forbidden in synthetic tests"); });
  mock.method(storage, "listReports", async (clientId: string, ticker?: string) =>
    documents.filter(d => d.userId === clientId && (!ticker || d.ticker === ticker)));
  mock.method(reviewRepository, "profile", async (clientId: string) => clientId === owner ? structuredClone(profile) : null);
  mock.method(reviewRepository, "history", async (clientId: string, reportId: string) =>
    reviews.filter(r => r.clientId === clientId && r.reportId === reportId));
  mock.method(reviewRepository, "authorized", async (reviewerId: string, clientId: string, at?: string) =>
    grant && reviewerId === consultant && clientId === owner && (!at || Date.parse(at) >= grantTime));
  mock.method(reviewRepository, "assignments", async (reviewerId: string) =>
    grant && reviewerId === consultant ? [{ clientId: owner }] : []);
  mock.method(reviewRepository, "append", async (review: ProfessionalReview) => { reviews.unshift(structuredClone(review)); });
});
afterEach(async () => {
  await Promise.all(servers.map(server => new Promise<void>((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve()))));
  servers = [];
  mock.restoreAll();
});
after(async () => { await Promise.all([closeStorage(), closeSuitability()]); });

async function decide(decision: "approved" | "rejected" = "approved") {
  const context = await reviewContext(documents[0]);
  return recordReview(consultant, owner, documents[0].id, {
    reportVersion: context.reportVersion, profileVersion: context.profileVersion, decision,
    reason: "Objetivo, perfil, fontes e riscos conferidos com dados exclusivamente sintéticos.",
    ...(decision === "approved" ? { recommendationText: recommendation } : {}),
  });
}
describe("real consultant review, entirely synthetic and offline", () => {
  it("records authorized identity, reason, decision, date and exact content/profile versions", async () => {
    assert.equal(canDeliverPersonalizedRecommendation(await reviewedReport(documents[0])), false);
    const review = await decide();
    assert.equal(review.reviewerId, consultant);
    assert.equal(review.clientId, owner);
    assert.equal(review.reportId, documents[0].id);
    assert.equal(review.reportVersion, versionOf(documents[0]));
    assert.equal(review.profileVersion, versionOf(profile));
    assert.ok(Number.isFinite(Date.parse(review.reviewedAt)));
    assert.ok(review.reason);
    const view = await reviewedReport(documents[0]);
    assert.equal(view.recommendation.status, "approved");
    assert.equal(view.recommendation.professionalReview, "approved");
    assert.equal(view.outlook, recommendation);
    assert.equal(canDeliverPersonalizedRecommendation(view), true);
  });
  it("latest rejection overrides approval without rewriting history", async () => {
    const approved = await decide();
    await decide("rejected");
    const view = await reviewedReport(documents[0]);
    assert.equal(view.recommendation.status, "rejected");
    assert.equal(canDeliverPersonalizedRecommendation(view), false);
    assert.doesNotMatch(JSON.stringify(view), /Recomendação exclusiva sintética/);
    assert.deepEqual(reviews[1], approved);
  });
  it("no login, customer, self-review or unassigned consultant may record decisions", async () => {
    const context = await reviewContext(documents[0]);
    for (const [reviewerId, clientId] of [[owner, owner], ["unknown", owner], [consultant, "other-client"]]) {
      await assert.rejects(recordReview(reviewerId, clientId, documents[0].id, {
        reportVersion: context.reportVersion, profileVersion: context.profileVersion,
        decision: "approved", reason: "Motivo sintético completo.", recommendationText: recommendation,
      }), /CONSULTANT_NOT_AUTHORIZED/);
    }
    assert.equal(reviews.length, 0);
  });
  it("revocation and later re-grant never revive a previous approval", async () => {
    await decide();
    grant = false;
    assert.equal(canDeliverPersonalizedRecommendation(await reviewedReport(documents[0])), false);
    grant = true; grantTime = Date.now() + 1000;
    assert.equal(canDeliverPersonalizedRecommendation(await reviewedReport(documents[0])), false);
  });
  it("content changes under the same ID invalidate the review without modifying its history", async () => {
    await decide();
    const saved = structuredClone(reviews);
    documents[0].summary = "Nova versão sintética alterada.";
    const view = await reviewedReport(documents[0]);
    assert.equal(view.recommendation.professionalReview, "pending");
    assert.equal(canDeliverPersonalizedRecommendation(view), false);
    assert.deepEqual(reviews, saved);
    assert.doesNotMatch(JSON.stringify(view), /Recomendação exclusiva sintética/);
  });
  it("new, partial or failed reports invalidate older approvals, including historical display", async () => {
    await decide();
    const previous = documents[0];
    for (const status of ["complete", "partial", "unavailable"] as const) {
      documents = [{ ...fixture(), analysisQuality: { ...fixture().analysisQuality!, status } }, previous];
      assert.equal(canDeliverPersonalizedRecommendation(await reviewedReport(previous)), false);
      assert.equal((await reviewedReport(documents[0])).recommendation.professionalReview, "pending");
    }
    assert.equal(canDeliverPersonalizedRecommendation(await reviewedReport(previous, { historical: true })), false);
  });
  it("profile changes, missing answers, expiry and incompatible profiles block previously approved advice", async () => {
    await decide();
    const original = structuredClone(profile!);
    for (const invalid of [
      null, { ...original, respostas: undefined },
      { ...original, dataProximaReavaliacao: "2020-01-01" },
      { ...original, dataAvaliacao: new Date(Date.now() + 86400000).toISOString() },
      { ...original, respostas: {}, pontuacaoMedia: 5 },
      { ...original, id: "new-synthetic-profile" },
    ]) {
      profile = invalid;
      assert.equal(canDeliverPersonalizedRecommendation(await reviewedReport(documents[0])), false);
    }
    profile = { ...original, perfil: "CONSERVADOR", pontuacaoMedia: 1,
      respostas: Object.fromEntries(QUESTOES.map(q => [q.id, 0])) };
    documents[0].riskScore = 8;
    assert.equal(checkReviewedProfile(profile, documents[0]).incompativel, true);
    await assert.rejects(decide(), /REVIEW_SAFETY_BLOCKED/);
    // Rejection remains recordable even without sufficient profile.
    profile = null;
    await decide("rejected");
  });
  it("an awareness term never overrides the actual profile or a separate conformity veto", async () => {
    await decide();
    const view = await reviewedReport(documents[0], {
      profileCheck: { ok: false, incompativel: true, motivo: "Termo assinado, mas incompatibilidade permanece." },
    });
    assert.equal(view.recommendation.profileStatus, "incompatible");
    assert.equal(canDeliverPersonalizedRecommendation(view), false);
  });
  it("partial, unavailable, legacy, stale, invalid sources/dates/quotes/risk and security veto cannot be approved", async () => {
    const original = structuredClone(documents[0]);
    const mutations: Array<(r: InvestmentReport) => void> = [
      r => { r.analysisQuality!.status = "partial"; },
      r => { r.analysisQuality!.status = "unavailable"; },
      r => { r.analysisQuality = null; },
      r => { r.generatedAt = "2020-01-01"; },
      r => { r.generatedAt = new Date(Date.now() + 86400000).toISOString(); },
      r => { r.source = " "; },
      r => { r.price = NaN; },
      r => { r.changePercent = Infinity; },
      r => { r.analysisQuality!.marketDataAt = "invalid"; },
      r => { r.analysisQuality!.marketDataAt = "2020-01-01"; },
      r => { r.analysisQuality!.fundamentalsPeriod = "2030-01-01"; },
      r => { r.analysisQuality!.fundamentalsPeriod = "2026-02-30"; },
      r => { r.analysisQuality!.marketDataAt = "2026-02-30T00:00:00Z"; },
      r => { r.analysisQuality!.fundamentalsPeriod = "2020-01-01"; },
      r => { r.analysisQuality!.missingAgents = ["risk"]; },
      r => { r.analysisQuality!.consensusScore = NaN; },
      r => { r.riskScore = null; },
      r => { r.riskScore = 11; },
      r => { r.riskScore = 9; },
      r => { r.analysisQuality!.highRisk = true; },
    ];
    for (const mutate of mutations) {
      documents = [structuredClone(original)]; mutate(documents[0]);
      await assert.rejects(decide(), /REVIEW_SAFETY_BLOCKED/);
      assert.equal(canDeliverPersonalizedRecommendation(await reviewedReport(documents[0])), false);
    }
    assert.equal(reviews.length, 0);
  });
  it("refuses stale open-form report/profile versions and client-supplied reviewer identities", async () => {
    const context = await reviewContext(documents[0]);
    const input = { reportVersion: context.reportVersion, profileVersion: context.profileVersion,
      decision: "approved" as const, reason: "Motivo sintético completo.", recommendationText: recommendation };
    documents[0].summary = "Conteúdo novo";
    await assert.rejects(recordReview(consultant, owner, documents[0].id, input), /REVIEW_VERSION_CHANGED/);
    documents = [fixture()]; const c = await reviewContext(documents[0]);
    profile!.id = "new-profile";
    await assert.rejects(recordReview(consultant, owner, documents[0].id, { ...input, reportVersion: c.reportVersion, profileVersion: c.profileVersion }), /REVIEW_VERSION_CHANGED/);
    assert.equal(reviewInput.safeParse({ ...input, reviewerId: consultant }).success, false);
    assert.equal(reviewInput.safeParse({ ...input, recommendationText: undefined }).success, false);
  });
  it("server routes enforce identity and per-client scope, persist real decisions and expose approved client view", async () => {
    const reviewerUrl = await start(consultant);
    const ownerUrl = await start(owner);
    const anonymousUrl = await start(null);
    const path = `/api/investments/review-clients/${owner}/reports`;
    assert.equal((await fetchLocal(anonymousUrl + path)).status, 401);
    assert.equal((await fetchLocal(ownerUrl + path)).status, 403);
    assert.equal((await fetchLocal(reviewerUrl + "/api/investments/review-clients/other/reports")).status, 403);
    const access = await (await fetchLocal(reviewerUrl + "/api/investments/review-access")).json() as any;
    assert.deepEqual(access.assignments, [{ clientId: owner }]);
    const result = await (await fetchLocal(reviewerUrl + path)).json() as any;
    assert.deepEqual(result.reports[0].profile.respostas, profile!.respostas);
    const response = await fetchLocal(`${reviewerUrl}${path}/${documents[0].id}/reviews`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ reportVersion: result.reports[0].reportVersion, profileVersion: result.reports[0].profileVersion,
        decision: "approved", reason: "Decisão profissional sintética.", recommendationText: recommendation }),
    });
    assert.equal(response.status, 201);
    const view = await (await fetchLocal(ownerUrl + "/api/investments/reports/BBDC3")).json() as any;
    assert.equal(view.latest.recommendation.status, "approved");
    assert.equal(view.latest.outlook, recommendation);
    assert.ok(view.history.every((r: any) => r.recommendation.status === "pending"));
  });
  it("delivery route queues only approved current advice and never runs inference", async () => {
    let queued = 0;
    mock.method(storage, "createReportDeliveryRequest", async (input: any) => {
      queued++;
      assert.equal(input.userId, owner); assert.equal(input.reportId, documents[0].id);
      return { ...input, id: "synthetic-delivery", status: "pending" };
    });
    mock.method(storage, "claimReportDeliveryRequests", async () => []);
    const url = await start(owner);
    const send = () => fetchLocal(url + "/api/investments/reports/BBDC3/delivery", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: "email", contact: "synthetic@example.test", idempotencyKey: randomUUID() }),
    });
    assert.equal((await send()).status, 409); assert.equal(queued, 0);
    await decide();
    assert.equal((await send()).status, 201); assert.equal(queued, 1);
    profile = null;
    assert.equal((await send()).status, 409); assert.equal(queued, 1);
  });
  it("worker rechecks authorization, report version and profile before any provider call", async () => {
    await decide();
    const report = structuredClone(documents[0]);
    const queued = { id: "synthetic-queue", userId: owner, reportId: report.id, professionalReviewId: reviews[0].id, ticker: report.ticker,
      channel: "email", contact: "synthetic@example.test", report } as ClaimedReportDelivery;
    mock.method(storage, "claimReportDeliveryRequests", async () => [queued]);
    const updates: any[] = [];
    mock.method(storage, "updateReportDeliveryRequest", async (_id: string, update: any) => { updates.push(update); });
    mock.method(console, "error", () => {});
    for (const mutate of [
      () => { grant = false; },
      () => { grant = true; documents[0].summary = "alterado"; },
      () => { documents = [report]; profile = null; },
      () => { documents = [fixture(), report]; },
    ]) {
      mutate(); await processReportDeliveryRequests();
      assert.equal(updates.at(-1).errorCode, "RECOMMENDATION_PENDING");
    }
    assert.equal(updates.length, 4);
  });
});
function fixture(): InvestmentReport {
  const now = new Date().toISOString();
  return { id: randomUUID(), userId: owner, ticker: "BBDC3", companyName: "Empresa sintética",
    generatedAt: now, price: 25, changePercent: 0, signal: "Recomendação pendente",
    summary: "Análise sintética completa.", strengths: ["Sintético"], risks: ["Sintético"],
    riskScore: 3, outlook: "Informativo", source: "Fonte sintética",
    analysisQuality: { version: 1, status: "complete", reason: "Completo sintético", availableAgents: 9,
      expectedAgents: 9, missingAgents: [], consensusScore: 7, highRisk: false,
      marketDataAt: now, fundamentalsPeriod: new Date(Date.now() - 86400000).toISOString() } };
}
async function start(userId: string | null) {
  const app = express(); app.use(express.json());
  const auth = Object.assign(() => ({ userId, tokenType: "session_token" }), { [Symbol.for("@clerk/express.auth")]: true });
  app.use((req, _res, next) => { Object.assign(req, { auth }); next(); });
  const server = createServer(app); servers.push(server);
  await registerRoutes(server, app, { checkProfile: async () => ({ ok: true }) });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}