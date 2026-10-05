import assert from "node:assert/strict";
import { after, afterEach, before, describe, it, mock } from "node:test";
import { randomUUID } from "node:crypto";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { pool, storage, closeStorage, type InvestmentReport } from "./storage";
import { salvarPerfil, closeSuitability, QUESTOES } from "./suitability";
import { recordReview, reviewContext, reviewedReport, reviewRepository } from "./professional-review";
import { canDeliverPersonalizedRecommendation } from "./report-policy";
import { processReportDeliveryRequests } from "./report-delivery";

// Never allow this integration suite to run against the workspace or production database.
if (process.env.SYNTHETIC_DATABASE !== "1"
  || !process.env.DATABASE_URL?.startsWith("postgresql://synthetic@/synthetic_invest?host=/tmp/invest-synthetic-"))
  throw new Error("Use npm run validate:synthetic; this suite requires a disposable synthetic database.");

const clientId = `synthetic-client-${randomUUID()}`;
const reviewerId = `synthetic-consultant-${randomUUID()}`;
let report: InvestmentReport;
before(async () => {
  await pool.query(`INSERT INTO investment_consultant_authorizations (reviewer_id, client_id, granted_by, reason)
    VALUES ($1,$2,'synthetic-operator','Habilitação profissional verificada exclusivamente em teste.')`, [reviewerId, clientId]);
  await salvarPerfil(clientId, Object.fromEntries(QUESTOES.map(q => [q.id, 4])));
  const now = new Date().toISOString();
  report = await storage.createReport({
    userId: clientId, ticker: "BBDC3", companyName: "Empresa sintética", price: 25, changePercent: 0,
    signal: "Recomendação pendente", summary: "Informação exclusivamente sintética",
    strengths: [], risks: [], riskScore: 3, outlook: "Informativo", source: "Fonte sintética",
    analysisQuality: { version: 1, status: "complete", reason: "Completo sintético", availableAgents: 9, expectedAgents: 9,
      missingAgents: [], consensusScore: 7, highRisk: false, marketDataAt: now,
      fundamentalsPeriod: new Date(Date.now() - 86400000).toISOString() },
  });
});
afterEach(() => mock.restoreAll());
after(async () => { await Promise.all([closeStorage(), closeSuitability()]); });
async function decide(decision: "approved" | "rejected" = "approved") {
  const context = await reviewContext(report);
  return recordReview(reviewerId, clientId, report.id, {
    reportVersion: context.reportVersion, profileVersion: context.profileVersion,
    decision, reason: "Análise completa, fontes, risco e perfil sintéticos efetivamente revisados.",
    ...(decision === "approved" ? { recommendationText: "Orientação profissional exclusivamente sintética e adequada ao perfil de teste." } : {}),
  });
}
describe("professional review persistence on disposable PostgreSQL only", () => {
  it("loads complete profile answers and stores version-bound decisions durably", async () => {
    const review = await decide();
    const context = await reviewContext((await storage.listReports(clientId, report.ticker))[0]);
    assert.equal(context.reviews[0].id, review.id);
    assert.equal(context.reviews[0].reviewerId, reviewerId);
    assert.deepEqual(context.profile?.respostas, Object.fromEntries(QUESTOES.map(q => [q.id, 4])));
    assert.equal(canDeliverPersonalizedRecommendation(context.presentation), true);
    assert.deepEqual(await reviewRepository.assignments("unassigned"), []);
    assert.deepEqual(await reviewRepository.history("other-client", report.id), []);
  });
  it("database rejects changing or deleting professional history and self-authorizations", async () => {
    const review = await decide();
    await assert.rejects(pool.query("UPDATE investment_professional_reviews SET reason = 'changed' WHERE id = $1", [review.id]), /append-only/);
    await assert.rejects(pool.query("DELETE FROM investment_professional_reviews WHERE id = $1", [review.id]), /append-only/);
    await assert.rejects(pool.query(`INSERT INTO investment_consultant_authorizations (reviewer_id,client_id,granted_by,reason)
      VALUES ('self','self','synthetic','Invalid self-review test')`), /check constraint/);
    assert.equal((await reviewRepository.history(clientId, report.id))[0].reason, review.reason);
  });
  it("new rejection is appended and overrides an earlier approval", async () => {
    await decide("rejected");
    const view = await reviewedReport(report);
    assert.equal(view.recommendation.status, "rejected");
    assert.equal(canDeliverPersonalizedRecommendation(view), false);
    assert.ok((await reviewRepository.history(clientId, report.id)).length >= 3);
  });
  it("worker sends only the exact approved decision with a simulated provider, never external traffic", async () => {
    const review = await decide();
    const request = await storage.createReportDeliveryRequest({
      userId: clientId, reportId: report.id, professionalReviewId: review.id,
      idempotencyKey: randomUUID(), ticker: report.ticker, channel: "email",
      contact: "synthetic@example.test", useRegisteredContact: false,
    });
    assert.equal(request.professionalReviewId, review.id);
    mock.method(globalThis, "fetch", async () => { throw new Error("External network forbidden"); });
    // Test-only sender; the runner strips actual credentials and sender before starting this process.
    const oldFrom = process.env.DELIVERY_EMAIL_FROM;
    process.env.DELIVERY_EMAIL_FROM = "synthetic@example.test";
    let calls = 0;
    mock.method(ReplitConnectors.prototype, "proxy", async (_provider: string, _path: string, options: any) => {
      calls++;
      const body = JSON.parse(options.body);
      assert.deepEqual(body.to, ["synthetic@example.test"]);
      assert.match(body.text, /Orientação profissional exclusivamente sintética/);
      assert.match(body.text, /Honorários pagos pelo cliente, sem comissão de produtos/);
      return new Response(JSON.stringify({ id: "synthetic-provider-message" }), { status: 200 });
    });
    try {
      await processReportDeliveryRequests({ id: request.id, limit: 1 });
      assert.equal(calls, 1);
      const sent = await storage.getReportDeliveryRequest(clientId, request.id);
      assert.equal(sent?.status, "sent");
      assert.equal(sent?.providerMessageId, "synthetic-provider-message");
      assert.equal(await storage.getReportDeliveryRequest("other-client", request.id), undefined);
    } finally {
      if (oldFrom === undefined) delete process.env.DELIVERY_EMAIL_FROM;
      else process.env.DELIVERY_EMAIL_FROM = oldFrom;
    }
  });
  it("old queues cannot silently use a newer approval or authorization", async () => {
    const first = await decide();
    const request = await storage.createReportDeliveryRequest({
      userId: clientId, reportId: report.id, professionalReviewId: first.id,
      idempotencyKey: randomUUID(), ticker: report.ticker, channel: "email",
      contact: "synthetic@example.test", useRegisteredContact: false,
    });
    await decide(); // Same document, different professional decision.
    mock.method(globalThis, "fetch", async () => { throw new Error("External network forbidden"); });
    mock.method(ReplitConnectors.prototype, "proxy", async () => { throw new Error("Must not send"); });
    mock.method(console, "error", () => {});
    await processReportDeliveryRequests({ id: request.id, limit: 1 });
    const blocked = await storage.getReportDeliveryRequest(clientId, request.id);
    assert.equal(blocked?.status, "failed");
    assert.equal(blocked?.errorCode, "RECOMMENDATION_PENDING");
    await pool.query("UPDATE investment_consultant_authorizations SET revoked_at = now() WHERE reviewer_id = $1 AND client_id = $2", [reviewerId, clientId]);
    assert.equal(canDeliverPersonalizedRecommendation(await reviewedReport(report)), false);
    await assert.rejects(decide(), /CONSULTANT_NOT_AUTHORIZED/);
    await pool.query("UPDATE investment_consultant_authorizations SET revoked_at = NULL WHERE reviewer_id = $1 AND client_id = $2", [reviewerId, clientId]);
    assert.equal(canDeliverPersonalizedRecommendation(await reviewedReport(report)), false);
  });
});