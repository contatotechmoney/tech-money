import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { createServer, type Server } from "node:http";
import { after, afterEach, beforeEach, describe, it, mock } from "node:test";
import { registerRoutes } from "./routes";
import { publicSimulation, simulationStore } from "./investment-simulation";
import { closeStorage, pool, storage, type InvestmentReport } from "./storage";
import { closeSuitability } from "./suitability";
import { reviewRepository } from "./professional-review";

const localFetch = globalThis.fetch;
const actualSimulationGet = simulationStore.get;
const actualSimulationList = simulationStore.list;
const servers: Server[] = [];
let providerCalls = 0;
const rows: { id: string; user_id: string; request_key: string; ticker: string; created_at: string }[] = [];
let clock = Date.now();
const fixture: InvestmentReport = {
  id: "synthetic-report", userId: "alpha", ticker: "BBDC3", companyName: "Ativo sintético",
  generatedAt: new Date().toISOString(), price: 10, changePercent: 0, signal: "Compra",
  summary: "Conclusão sintética não revisada", strengths: [], risks: [], outlook: "Não revisado", source: "synthetic",
};

beforeEach(() => {
  rows.length = 0; providerCalls = 0; clock = Date.now();
  mock.method(globalThis, "fetch", async () => { providerCalls++; throw Error("ALL_EXTERNAL_CALLS_FORBIDDEN"); });
  mock.method(storage, "listReports", async (userId: string, ticker: string) =>
    userId === "alpha" && ticker === "BBDC3" ? [fixture] : []);
  mock.method(reviewRepository, "profile", async () => null);
  mock.method(reviewRepository, "history", async () => []);
  mock.method(simulationStore, "list", async (userId: string) => rows.filter(row => row.user_id === userId));
  mock.method(simulationStore, "get", async (userId: string, id: string) =>
    rows.find(row => row.user_id === userId && row.id === id) ?? null);
  mock.method(simulationStore, "create", async (userId: string, ticker: string, key: string) => {
    const previous = rows.find(row => row.user_id === userId && row.request_key === key);
    if (previous) {
      if (previous.ticker !== ticker) throw Error("SIMULATION_CONFLICT");
      return previous;
    }
    const row = { id: randomUUID(), user_id: userId, ticker, request_key: key, created_at: new Date(clock).toISOString() };
    rows.push(row); return row;
  });
});
afterEach(() => { assert.equal(providerCalls, 0, "No application request may reach a provider"); mock.restoreAll(); });
after(async () => {
  await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  await closeStorage(); await closeSuitability();
});

async function app() {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    const auth = Object.assign(() => ({ userId: req.headers["x-test-user"] || null, tokenType: "session_token" }), {
      [Symbol.for("@clerk/express.auth")]: true,
    });
    Object.assign(req, { auth }); next();
  });
  const server = createServer(instance); servers.push(server);
  await registerRoutes(server, instance, { checkProfile: async () => ({ ok: false, motivo: "Perfil sintético pendente" }) });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  return (path: string, user = "alpha", body?: unknown) => localFetch(url + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(user ? { "x-test-user": user } : {}), "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("Invest: authenticated simulation and report loading without paid calls", () => {
  it("requires the existing Clerk session on every simulation path", async () => {
    const request = await app();
    for (const path of ["/api/investments/simulation-options", "/api/investments/simulations", `/api/investments/simulations/${randomUUID()}`]) {
      assert.equal((await request(path, "")).status, 401);
    }
    assert.equal((await request("/api/investments/simulations", "", { ticker: "BBDC3", requestKey: randomUUID() })).status, 401);
  });
  it("returns explicitly simulated options and never enables real analysis", async () => {
    // These are fake child-process values, not workspace secrets. Even fully
    // configured provider flags cannot enable the production route registration.
    Object.assign(process.env, {
      HERMES_ANALYSIS_ENABLED: "true", HERMES_API_URL: "https://provider.invalid",
      HERMES_API_KEY: "synthetic-key", HERMES_MODELS_JSON: JSON.stringify([{ id: "demo", label: "Demo", provider: "fake", model: "fake" }]),
      HERMES_ALLOWED_USER_IDS: "alpha", LLM_API_KEY: "synthetic-key",
    });
    const request = await app();
    assert.deepEqual(await (await request("/api/investments/simulation-options")).json(), {
      mode: "simulation", tickers: ["BBDC3", "BBAS3"], tokensUsed: 0, creditsDebited: 0, realAnalysisEnabled: false,
    });
    assert.equal((await (await request("/api/investments/analysis-options")).json()).available, false);
    assert.equal((await request("/api/investments/analyses", "alpha", {})).status, 503);
    assert.equal((await request(`/api/investments/analyses/${randomUUID()}`)).status, 503);
    assert.equal((await request("/api/investments/reports/BBDC3/refresh", "alpha", {})).status, 403);
    assert.equal((await request("/api/investments/agents/run", "alpha", {})).status, 403);
    for (const key of ["HERMES_ANALYSIS_ENABLED", "HERMES_API_URL", "HERMES_API_KEY", "HERMES_MODELS_JSON", "HERMES_ALLOWED_USER_IDS", "LLM_API_KEY"]) delete process.env[key];
  });
  it("loads existing reports as pending, without fabricated approval", async () => {
    const request = await app(); const response = await request("/api/investments/reports");
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.reports.length, 1);
    assert.equal(result.reports[0].recommendation.professionalReview, "pending");
    assert.notEqual(result.reports[0].signal, "Compra");
    assert.equal((await (await request("/api/investments/reports", "beta")).json()).reports.length, 0);
    assert.equal((await request("/api/investments/reports", "")).status, 401);
  });
  it("blocks legacy checkout and real credit grants before validation or persistence", async () => {
    const request = await app();
    let databaseCalls = 0;
    mock.method(pool, "query", async () => { databaseCalls++; throw Error("CREDIT_DATABASE_FORBIDDEN"); });
    mock.method(pool, "connect", async () => { databaseCalls++; throw Error("CREDIT_DATABASE_FORBIDDEN"); });
    for (const path of ["/api/investments/billing/checkout", "/api/investments/credits/signup-grant"]) {
      assert.equal((await request(path, "", {})).status, 401);
      for (const body of [{}, { planoId: "synthetic-paid", ciclo: "mensal" }]) {
        const response = await request(path, "alpha", body);
        assert.equal(response.status, 403);
        assert.equal((await response.json()).code, "REAL_ANALYSIS_DISABLED");
      }
    }
    assert.equal((await request("/api/investments/billing/webhook", "", {})).status, 403);
    assert.equal(databaseCalls, 0);
  });
  it("reports schema failure explicitly instead of an empty list or a market error", async () => {
    mock.method(reviewRepository, "history", async () => { throw Object.assign(Error("missing review table"), { code: "42P01" }); });
    const request = await app(); const response = await request("/api/investments/reports");
    assert.equal(response.status, 503);
    const result = await response.json();
    assert.equal(result.error, "INVESTMENT_SCHEMA_UNAVAILABLE"); assert.equal(result.reports, undefined);
  });
  it("isolates history, detail and idempotency across accounts", async () => {
    const request = await app(); const key = randomUUID();
    const first = await (await request("/api/investments/simulations", "alpha", { ticker: "BBDC3", requestKey: key })).json();
    const repeat = await (await request("/api/investments/simulations", "alpha", { ticker: "BBDC3", requestKey: key })).json();
    assert.equal(first.id, repeat.id); assert.equal(rows.length, 1);
    assert.equal((await request(`/api/investments/simulations/${first.id}`, "beta")).status, 404);
    assert.deepEqual(await (await request("/api/investments/simulations", "beta")).json(), { studies: [] });
    const own = await (await request("/api/investments/simulations", "beta", { ticker: "BBAS3", requestKey: key })).json();
    assert.notEqual(own.id, first.id);
    const list = await (await request("/api/investments/simulations", "alpha")).json();
    assert.equal(list.studies.length, 1); assert.equal(list.studies[0].id, first.id);
    assert.equal(first.user_id, undefined); assert.equal(first.request_key, undefined);
  });
  it("rejects forged owners, models, unsupported assets, malformed IDs and conflicting retries", async () => {
    const request = await app(); const key = randomUUID();
    for (const body of [
      { ticker: "PETR4", requestKey: key },
      { ticker: "BBDC3", requestKey: key, userId: "beta" },
      { ticker: "BBDC3", requestKey: key, modelId: "paid" },
    ]) assert.equal((await request("/api/investments/simulations", "alpha", body)).status, 400);
    assert.equal((await request("/api/investments/simulations/not-a-uuid")).status, 404);
    await request("/api/investments/simulations", "alpha", { ticker: "BBDC3", requestKey: key });
    assert.equal((await request("/api/investments/simulations", "alpha", { ticker: "BBAS3", requestKey: key })).status, 409);
  });
  it("keeps empty, persistence error and saturation responses distinct", async () => {
    const request = await app();
    assert.deepEqual(await (await request("/api/investments/simulations")).json(), { studies: [] });
    mock.method(simulationStore, "list", async () => { throw Error("DB_DOWN"); });
    const failure = await request("/api/investments/simulations");
    assert.equal(failure.status, 503); assert.equal((await failure.json()).studies, undefined);
    for (const [code, status] of [["SIMULATION_ACTIVE", 409], ["SIMULATION_LIMIT", 429], ["DB_DOWN", 503]] as const) {
      mock.method(simulationStore, "create", async () => { throw Error(code); });
      assert.equal((await request("/api/investments/simulations", "alpha", { ticker: "BBDC3", requestKey: randomUUID() })).status, status);
    }
  });
  it("advances deterministic local stages without inference or approval", () => {
    const row = { id: randomUUID(), user_id: "alpha", request_key: randomUUID(), ticker: "BBDC3", created_at: new Date(clock) };
    assert.equal(publicSimulation(row, clock).status, "queued");
    assert.equal(publicSimulation(row, clock + 2000).status, "running");
    const completed = publicSimulation(row, clock + 8000);
    assert.equal(completed.status, "completed"); assert.match(completed.output!, /DADOS FICTÍCIOS/);
    assert.equal(completed.tokensUsed, 0); assert.equal(completed.creditsDebited, 0);
    assert.equal(completed.professionalReview, "not_applicable"); assert.equal(completed.recommendation, "blocked");
  });
  it("binds identity in the real SQL repository, not a client-supplied owner", async () => {
    const id = randomUUID();
    mock.method(pool, "query", async (sql: string, params: string[]) => {
      assert.match(sql, /WHERE user_id=\$1/);
      assert.equal(params[0], "alpha");
      if (params.length === 2) {
        assert.match(sql, /AND id=\$2/); assert.equal(params[1], id);
      } else assert.match(sql, /LIMIT 30/);
      return { rows: [], rowCount: 0, fields: [], command: "SELECT", oid: 0 };
    });
    assert.equal(await actualSimulationGet("alpha", id), null);
    assert.deepEqual(await actualSimulationList("alpha"), []);
  });
});
