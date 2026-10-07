import assert from "node:assert/strict";
import { after, afterEach, before, describe, it, mock } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { pool, storage, closeStorage, type InvestmentReport } from "./storage";
import { salvarPerfil, closeSuitability, QUESTOES } from "./suitability";
import { pendingReviews, recordReview, reviewContext, reviewedReport, reviewRepository, versionOf } from "./professional-review";
import { canDeliverPersonalizedRecommendation } from "./report-policy";
import { processReportDeliveryRequests } from "./report-delivery";
import express from "express";
import { createServer, type Server } from "node:http";
import { registerProfessionalReviewRoutes } from "./professional-review-routes";
import { assignmentChangeInput, assignmentManagement } from "./assignment-management";
import { simulationStore } from "./investment-simulation";
import { Pool } from "pg";

// Never allow this integration suite to run against the workspace or production database.
if (process.env.SYNTHETIC_DATABASE !== "1"
  || !process.env.DATABASE_URL?.startsWith("postgresql://synthetic@/synthetic_invest?host=/tmp/invest-synthetic-"))
  throw new Error("Use npm run validate:synthetic; this suite requires a disposable synthetic database.");

const clientId = `synthetic-client-${randomUUID()}`;
const reviewerId = `synthetic-consultant-${randomUUID()}`;
let report: InvestmentReport;
const adminId = `synthetic-admin-${randomUUID()}`;
const localFetch = globalThis.fetch;
let apiServer: Server;
let apiUrl: string;
before(async () => {
  await pool.query(`INSERT INTO investment_review_professional (reviewer_id, credential_reference, verified_by, valid_until)
    VALUES ($1, 'Credencial exclusivamente sintética', 'synthetic-operator', now() + interval '1 day')`, [reviewerId]);
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
  await pool.query(`INSERT INTO investment_assignment_administrators (user_id, provisioned_by, reason)
    VALUES ($1,'synthetic-operator','Administrador explicitamente autorizado em teste.')`, [adminId]);
  const app = express();
  app.use(express.json());
  registerProfessionalReviewRoutes(app, (req, res, next) => {
    // Test-only fixture middleware on an ephemeral server, never installed in the app.
    const actor = req.header("x-synthetic-actor");
    if (!actor) return void res.status(401).json({ error: "AUTH_REQUIRED" });
    req.userId = actor; next();
  });
  apiServer = createServer(app);
  await new Promise<void>(resolve => apiServer.listen(0, "127.0.0.1", resolve));
  const address = apiServer.address();
  assert.ok(address && typeof address !== "string");
  apiUrl = `http://127.0.0.1:${address.port}`;
});
afterEach(() => mock.restoreAll());
after(async () => {
  if (apiServer) await new Promise<void>(resolve => apiServer.close(() => resolve()));
  await Promise.all([closeStorage(), closeSuitability()]);
});
async function decide(decision: "approved" | "rejected" = "approved") {
  const context = await reviewContext(report);
  return recordReview(reviewerId, clientId, report.id, {
    reportVersion: context.reportVersion, profileVersion: context.profileVersion,
    decision, reason: "Análise completa, fontes, risco e perfil sintéticos efetivamente revisados.",
    ...(decision === "approved" ? { recommendationText: "Orientação profissional exclusivamente sintética e adequada ao perfil de teste." } : {}),
  });
}
describe("professional review persistence on disposable PostgreSQL only", () => {
  it("rehearses the unchanged official additive plan and canonical controls over synthetic legacy data", async () => {
    // A second empty database in the SAME guarded private cluster models the
    // two existing production tables; this never connects to production.
    await pool.query("CREATE DATABASE synthetic_release_rehearsal");
    const rehearsal = new Pool({ host: process.env.PGHOST, port: 6543, user: "synthetic", database: "synthetic_release_rehearsal" });
    const tx = await rehearsal.connect();
    try {
      await tx.query(`CREATE TABLE investment_reports (id varchar PRIMARY KEY, user_id text);
        CREATE TABLE report_delivery_requests (id varchar PRIMARY KEY);
        INSERT INTO investment_reports VALUES ('synthetic-legacy-report','synthetic-legacy-owner');
        INSERT INTO report_delivery_requests VALUES ('synthetic-legacy-request');`);
      const official = JSON.parse(readFileSync("docs/evidence/invest-schema-diff.json", "utf8"));
      assert.equal(official.success, true);
      assert.equal(official.hasStructuralDataLoss, false);
      assert.equal(official.statementsToExecute.length, 15);
      assert.ok(official.statementsToExecute.every((sql: string) => /^\s*(CREATE TABLE|CREATE (UNIQUE )?INDEX|ALTER TABLE)/.test(sql)));
      await tx.query("BEGIN");
      await tx.query(official.statementsToExecute.join("\n"));
      await tx.query(readFileSync("migrations/0015_investment_governance_controls.sql", "utf8"));
      const checks = (await tx.query(readFileSync("sql/investment-release-readiness.sql", "utf8"))).rows;
      assert.equal(checks.length, 21);
      assert.ok(checks.every(row => row.ready));
      assert.deepEqual((await tx.query("SELECT * FROM investment_reports")).rows,
        [{ id: "synthetic-legacy-report", user_id: "synthetic-legacy-owner" }]);
      assert.deepEqual((await tx.query("SELECT * FROM report_delivery_requests")).rows,
        [{ id: "synthetic-legacy-request", professional_review_id: null }]);
      for (const table of ["investment_review_professional", "investment_consultant_authorizations", "investment_assignment_administrators"])
        assert.equal((await tx.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count, 0);
      await tx.query("COMMIT");
    } catch (error) {
      await tx.query("ROLLBACK");
      throw error;
    } finally { tx.release(); await rehearsal.end(); }
  });
  it("confirms the complete release manifest and blocks disabled or replaced audit controls", async () => {
    const readiness = readFileSync("sql/investment-release-readiness.sql", "utf8");
    const canonical = readFileSync("migrations/0015_investment_governance_controls.sql", "utf8");
    const check = async () => (await pool.query(readiness)).rows as { control: string; ready: boolean }[];
    assert.equal((await check()).length, 21);
    assert.ok((await check()).every(row => row.ready));
    assert.equal(await reviewRepository.authorized(reviewerId, clientId), true);
    try {
      await pool.query("ALTER TABLE investment_professional_reviews DISABLE TRIGGER investment_review_immutable");
      assert.equal((await check()).find(row => row.control === "trigger:investment_review_immutable")?.ready, false);
      assert.equal(await reviewRepository.authorized(reviewerId, clientId), false);
    } finally {
      await pool.query("ALTER TABLE investment_professional_reviews ENABLE TRIGGER investment_review_immutable");
    }
    try {
      await pool.query(`CREATE OR REPLACE FUNCTION prevent_investment_review_changes()
        RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$`);
      assert.equal((await check()).find(row => row.control === "function:prevent_investment_review_changes")?.ready, false);
      assert.equal(await reviewRepository.authorized(reviewerId, clientId), false);
    } finally {
      await pool.query(canonical);
    }
    assert.ok((await check()).every(row => row.ready));
  });
  it("rejects a write when audit controls change after successful authorization", async () => {
    const canonical = readFileSync("migrations/0015_investment_governance_controls.sql", "utf8");
    const grantId = await reviewRepository.grantVersion(reviewerId, clientId);
    assert.ok(grantId);
    const attempt = async () => {
      const id = randomUUID();
      await assert.rejects(reviewRepository.append({
        id, reviewerId, clientId, reportId: report.id,
        reportVersion: versionOf(report), profileVersion: versionOf(null),
        decision: "rejected", reason: "Decisão exclusivamente sintética para verificar fechamento seguro.",
        recommendationText: null, reviewedAt: new Date().toISOString(),
      }, grantId), /CONSULTANT_NOT_AUTHORIZED/);
      assert.equal((await pool.query("SELECT id FROM investment_professional_reviews WHERE id=$1", [id])).rowCount, 0);
    };
    assert.equal(await reviewRepository.authorized(reviewerId, clientId), true);
    try {
      await pool.query("ALTER TABLE investment_professional_reviews DISABLE TRIGGER investment_review_immutable");
      await attempt();
    } finally {
      await pool.query("ALTER TABLE investment_professional_reviews ENABLE TRIGGER investment_review_immutable");
    }
    assert.equal(await reviewRepository.authorized(reviewerId, clientId), true);
    try {
      await pool.query(`CREATE OR REPLACE FUNCTION prevent_investment_review_changes()
        RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$`);
      await attempt();
    } finally {
      await pool.query(canonical);
    }
    assert.equal(await reviewRepository.authorized(reviewerId, clientId), true);
  });
  it("persists concurrent simulation retries with real SQL and isolates owners without external calls", async () => {
    let externalCalls = 0;
    mock.method(globalThis, "fetch", async () => { externalCalls++; throw Error("EXTERNAL_CALLS_FORBIDDEN"); });
    const alpha = `synthetic-simulation-${randomUUID()}`, beta = `synthetic-simulation-${randomUUID()}`;
    const key = randomUUID();
    const [first, retry] = await Promise.all([
      simulationStore.create(alpha, "BBDC3", key), simulationStore.create(alpha, "BBDC3", key),
    ]);
    assert.equal(first.id, retry.id);
    assert.equal((await simulationStore.list(alpha)).length, 1);
    assert.equal(await simulationStore.get(beta, first.id), null);
    assert.deepEqual(await simulationStore.list(beta), []);
    await assert.rejects(simulationStore.create(alpha, "BBAS3", key), /SIMULATION_CONFLICT/);
    const own = await simulationStore.create(beta, "BBAS3", key);
    assert.notEqual(own.id, first.id);
    assert.equal((await simulationStore.get(alpha, first.id))?.id, first.id);
    assert.equal(externalCalls, 0);
  });
  it("derives pending work from persisted versions and removes revoked clients without sending", async () => {
    const pendingClientId = `synthetic-pending-${randomUUID()}`;
    await pool.query(`INSERT INTO investment_consultant_authorizations (reviewer_id, client_id, granted_by, reason)
      VALUES ($1,$2,'synthetic-operator','Cliente atribuído exclusivamente para verificar pendências.')`,
    [reviewerId, pendingClientId]);
    const answers = Object.fromEntries(QUESTOES.map(q => [q.id, 4]));
    await salvarPerfil(pendingClientId, answers);
    const { id: _id, generatedAt: _generatedAt, ...input } = report;
    const pendingReport = await storage.createReport({ ...input, userId: pendingClientId });
    const forClient = async () => (await pendingReviews(reviewerId)).items.filter(i => i.clientId === pendingClientId);
    assert.equal((await forClient())[0].reason, "new_report");
    const context = await reviewContext(pendingReport);
    await recordReview(reviewerId, pendingClientId, pendingReport.id, {
      reportVersion: context.reportVersion, profileVersion: context.profileVersion, decision: "approved",
      reason: "Análise de pendências verificada exclusivamente com dados sintéticos.",
      recommendationText: "Orientação sintética adequada ao cliente de teste.",
    });
    assert.deepEqual(await forClient(), []);
    await salvarPerfil(pendingClientId, answers);
    assert.equal((await forClient())[0].reason, "profile_changed");
    assert.equal(canDeliverPersonalizedRecommendation(await reviewedReport(pendingReport)), false);
    const response = await localFetch(`${apiUrl}/api/investments/review-pending`, {
      headers: { "x-synthetic-actor": reviewerId },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok((await response.json() as any).items.some((i: any) => i.clientId === pendingClientId));
    await pool.query(`UPDATE investment_consultant_authorizations SET revoked_at = now()
      WHERE reviewer_id = $1 AND client_id = $2`, [reviewerId, pendingClientId]);
    assert.deepEqual(await forClient(), []);
    assert.deepEqual(await pendingReviews("synthetic-unassigned"), { total: 0, items: [] });
  });
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
  it("simulation worker preserves an approved queued request without calling even a configured synthetic provider", async () => {
    const review = await decide();
    assert.equal(canDeliverPersonalizedRecommendation(await reviewedReport(report)), true);
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
      assert.equal(calls, 0);
      const sent = await storage.getReportDeliveryRequest(clientId, request.id);
      assert.equal(sent?.status, "pending");
      assert.equal(sent?.providerMessageId, null);
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
    assert.equal(blocked?.status, "pending");
    assert.equal(blocked?.errorCode, null);
    await pool.query("UPDATE investment_consultant_authorizations SET revoked_at = now() WHERE reviewer_id = $1 AND client_id = $2", [reviewerId, clientId]);
    assert.equal(canDeliverPersonalizedRecommendation(await reviewedReport(report)), false);
    await assert.rejects(decide(), /CONSULTANT_NOT_AUTHORIZED/);
    await pool.query("UPDATE investment_consultant_authorizations SET revoked_at = NULL WHERE reviewer_id = $1 AND client_id = $2", [reviewerId, clientId]);
    assert.equal(canDeliverPersonalizedRecommendation(await reviewedReport(report)), false);
  });
});

const operationReason = "Atribuição e habilitação conferidas exclusivamente com dados sintéticos.";
async function assignmentApi(path = "", actor: string | null = adminId, body?: unknown) {
  return localFetch(`${apiUrl}/api/investments/assignment-management${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(actor ? { "x-synthetic-actor": actor } : {}), "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function changeInput(id = `synthetic-assigned-${randomUUID()}`, expectedGrantId: string | null = null) {
  return { clientId: id, reason: operationReason, expectedGrantId };
}
describe("operational assignments with explicit administrators and atomic audit", () => {
  it("never infers administrators from login, consultant identity, or client ownership", async () => {
    for (const actor of [null, reviewerId, clientId, "synthetic-stranger"]) {
      const expected = actor === null ? 401 : 403;
      for (const path of ["", `/clients/${clientId}/history`]) assert.equal((await assignmentApi(path, actor)).status, expected);
      assert.equal((await assignmentApi("/grant", actor, changeInput())).status, expected);
      assert.equal((await assignmentApi("/revoke", actor, changeInput())).status, expected);
    }
    assert.equal(await assignmentManagement.canManage(reviewerId), false);
    const access = await localFetch(apiUrl + "/api/investments/review-access", { headers: { "x-synthetic-actor": adminId } });
    assert.deepEqual(await access.json(), { assignments: [], canManageAssignments: true });
    const response = await localFetch(`${apiUrl}/api/investments/review-clients/${clientId}/reports`, { headers: { "x-synthetic-actor": adminId } });
    assert.equal(response.status, 403); // Administrative assignment access is not report access.
  });
  it("requires a meaningful reason and rejects browser-supplied identities or privileges", async () => {
    const form = await localFetch(`${apiUrl}/api/investments/assignment-management/grant`, {
      method: "POST", headers: { "x-synthetic-actor": adminId, "content-type": "application/x-www-form-urlencoded" },
      body: "clientId=synthetic-client&reason=Motivo+sintetico+valido&expectedGrantId=",
    });
    assert.equal(form.status, 415);
    for (const body of [
      { clientId, expectedGrantId: null },
      { ...changeInput(), reason: "curto" },
      { ...changeInput(), reason: " ".repeat(20) },
      { ...changeInput(), reviewerId: "forged-reviewer" },
      { ...changeInput(), actorId: adminId },
      { ...changeInput(), role: "admin" },
      { ...changeInput(), expectedGrantId: "not-a-uuid" },
      { ...changeInput(), clientId: "bad/id" },
    ]) assert.equal((await assignmentApi("/grant", adminId, body)).status, 400);
    assert.equal(assignmentChangeInput.safeParse({ ...changeInput(), reason: "a".repeat(4001) }).success, false);
    assert.equal((await assignmentApi("/grant", adminId, changeInput(reviewerId))).status, 403);
  });
  it("grants, revokes and regrants with durable immutable actor/reason/generation audit", async () => {
    const input = changeInput();
    const grantResponse = await assignmentApi("/grant", adminId, input);
    assert.equal(grantResponse.status, 201);
    assert.equal(grantResponse.headers.get("cache-control"), "no-store");
    const first = ((await grantResponse.json()) as any).assignment;
    assert.equal(first.reviewerId, reviewerId);
    assert.equal(first.grantedBy, adminId);
    assert.equal(first.reason, operationReason);
    assert.equal(await reviewRepository.authorized(reviewerId, input.clientId), true);
    assert.equal((await assignmentApi("/grant", adminId, { ...input, expectedGrantId: first.grantId })).status, 409);
    assert.equal((await assignmentApi("/revoke", adminId, { ...input, expectedGrantId: randomUUID() })).status, 409);
    const revokeReason = "Revogação sintética solicitada para encerramento da atribuição.";
    assert.equal((await assignmentApi("/revoke", adminId, { ...input, expectedGrantId: first.grantId, reason: revokeReason })).status, 200);
    assert.equal(await reviewRepository.authorized(reviewerId, input.clientId), false);
    assert.equal((await assignmentApi("/revoke", adminId, { ...input, expectedGrantId: first.grantId })).status, 409);
    const renewed = await assignmentApi("/grant", adminId, { ...input, expectedGrantId: first.grantId });
    assert.equal(renewed.status, 201);
    const second = ((await renewed.json()) as any).assignment;
    assert.notEqual(first.grantId, second.grantId);
    assert.equal((await assignmentApi("/revoke", adminId, { ...input, expectedGrantId: first.grantId })).status, 409);
    const history = (await (await assignmentApi(`/clients/${input.clientId}/history`)).json()) as any;
    assert.deepEqual(history.events.map((event: any) => event.action), ["grant", "revoke", "grant"]);
    assert.equal(history.events[1].reason, revokeReason);
    assert.ok(history.events.every((event: any) => event.actorId === adminId && event.reviewerId === reviewerId
      && event.clientId === input.clientId && event.credentialReference && event.credentialValidUntil && event.occurredAt));
    assert.equal(history.events[0].grantId, second.grantId);
    assert.equal(history.events[2].grantId, first.grantId);
    assert.deepEqual((await assignmentManagement.history(adminId, "unrelated-synthetic-client")).events, []);
    await assert.rejects(pool.query("UPDATE investment_assignment_audit SET reason = 'changed' WHERE id = $1", [history.events[0].id]), /append-only/);
    await assert.rejects(pool.query("DELETE FROM investment_assignment_audit WHERE id = $1", [history.events[0].id]), /append-only/);
  });
  it("prevents simultaneous grants and stale requests from generating duplicate successes", async () => {
    const input = changeInput();
    const outcomes = await Promise.allSettled([
      assignmentManagement.change(adminId, "grant", input),
      assignmentManagement.change(adminId, "grant", input),
    ]);
    assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter(result => result.status === "rejected").length, 1);
    const { events } = await assignmentManagement.history(adminId, input.clientId);
    assert.equal(events.length, 1);
    const revoke = { ...input, expectedGrantId: events[0].grantId };
    const revoked = await Promise.allSettled([
      assignmentManagement.change(adminId, "revoke", revoke),
      assignmentManagement.change(adminId, "revoke", revoke),
    ]);
    assert.equal(revoked.filter(result => result.status === "fulfilled").length, 1);
    assert.equal((await assignmentManagement.history(adminId, input.clientId)).events.length, 2);
  });
  it("rolls back the assignment if its audit cannot be persisted", async () => {
    const input = changeInput();
    const connect = pool.connect.bind(pool);
    mock.method(pool, "connect", async () => {
      const tx = await connect();
      const query = tx.query.bind(tx);
      tx.query = ((sql: string, ...args: any[]) => {
        if (sql.includes("INSERT INTO investment_assignment_audit")) throw new Error("synthetic audit failure");
        return (query as any)(sql, ...args);
      }) as any;
      const release = tx.release.bind(tx);
      tx.release = () => { tx.query = query as any; release(); };
      return tx;
    });
    await assert.rejects(assignmentManagement.change(adminId, "grant", input), /synthetic audit failure/);
    mock.restoreAll(); // pool.query uses connect's callback overload; restore before regular queries.
    const result = await pool.query("SELECT 1 FROM investment_consultant_authorizations WHERE client_id = $1", [input.clientId]);
    assert.equal(result.rowCount, 0);
    assert.deepEqual((await assignmentManagement.history(adminId, input.clientId)).events, []);
  });
  it("qualification is checked on grant, report access and review; expired qualifications do not prevent revocation", async () => {
    const input = changeInput();
    const first = (await assignmentManagement.change(adminId, "grant", input)).assignment;
    const professional = (await pool.query("SELECT * FROM investment_review_professional")).rows[0];
    try {
      await pool.query("UPDATE investment_review_professional SET revoked_at = now()");
      assert.equal((await assignmentApi("/grant", adminId, changeInput())).status, 409);
      assert.equal(await reviewRepository.authorized(reviewerId, input.clientId), false);
      assert.deepEqual(await reviewRepository.assignments(reviewerId), []);
      await assert.rejects(decide(), /CONSULTANT_NOT_AUTHORIZED/);
      await pool.query(`UPDATE investment_review_professional SET revoked_at = NULL,
        verified_at = now() - interval '2 days', valid_until = now() - interval '1 day'`);
      assert.equal((await assignmentApi("/grant", adminId, changeInput())).status, 409);
      assert.equal(await reviewRepository.authorized(reviewerId, input.clientId), false);
      assert.equal((await assignmentApi("/revoke", adminId, { ...input, expectedGrantId: first.grantId })).status, 200);
      // Singleton constraint rejects adding a second consultant, even outside the API.
      await assert.rejects(pool.query(`INSERT INTO investment_review_professional
        (reviewer_id, credential_reference, verified_by, valid_until)
        VALUES ('synthetic-second','Credencial sintética','synthetic',now() + interval '1 day')`), /unique constraint/);
    } finally {
      await pool.query(`UPDATE investment_review_professional SET verified_at = $1, valid_until = $2, revoked_at = $3`,
        [professional.verified_at, professional.valid_until, professional.revoked_at]);
    }
  });
  it("revoked administrator loses read and mutation access immediately", async () => {
    await pool.query("UPDATE investment_assignment_administrators SET revoked_at = now() WHERE user_id = $1", [adminId]);
    try {
      assert.equal((await assignmentApi()).status, 403);
      await assert.rejects(assignmentManagement.change(adminId, "grant", changeInput()), /ASSIGNMENT_ADMIN_REQUIRED/);
      await assert.rejects(assignmentManagement.history(adminId, clientId), /ASSIGNMENT_ADMIN_REQUIRED/);
    } finally {
      await pool.query("UPDATE investment_assignment_administrators SET revoked_at = NULL WHERE user_id = $1", [adminId]);
    }
  });
  it("operational regrant does not revive old approvals or allow an in-flight review under an old generation", async () => {
    const approved = await decide();
    assert.equal(canDeliverPersonalizedRecommendation(await reviewedReport(report)), true);
    const firstGrantId = await reviewRepository.grantVersion(reviewerId, clientId);
    assert.ok(firstGrantId);
    await assignmentManagement.change(adminId, "revoke", changeInput(clientId, firstGrantId));
    assert.equal(canDeliverPersonalizedRecommendation(await reviewedReport(report)), false);
    await assignmentManagement.change(adminId, "grant", changeInput(clientId, firstGrantId));
    assert.equal(canDeliverPersonalizedRecommendation(await reviewedReport(report)), false);
    // Even a timestamp created after the regrant cannot bypass the generation captured before it.
    await assert.rejects(reviewRepository.append({ ...approved, id: randomUUID(), reviewedAt: new Date().toISOString() }, firstGrantId),
      /CONSULTANT_NOT_AUTHORIZED/);
    assert.equal((await reviewRepository.history(clientId, report.id))[0].id, approved.id);
    await decide();
    assert.equal(canDeliverPersonalizedRecommendation(await reviewedReport(report)), true);
  });
});