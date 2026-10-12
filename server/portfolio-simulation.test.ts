import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";
import { registerPortfolioSimulationRoutes, type PortfolioSimulationStore } from "./portfolio-simulation";
import { PORTFOLIO_AGENTS, PORTFOLIO_DEMO_VERSION, portfolioMetrics, portfolioScenario, presentPortfolioStudy, type PortfolioStudyRow } from "../shared/portfolio-simulation";
import { CVS, listarAgentes } from "../shared/personas";
import { closeStorage } from "./storage";

const realFetch = globalThis.fetch;
const rows: PortfolioStudyRow[] = [];
let clock = Date.parse("2026-10-10T12:00:00Z"), externalCalls = 0, storeCalls = 0, failure = false;
const store: PortfolioSimulationStore = {
  async list(userId) { storeCalls++; if (failure) throw Error("MISSING_TABLE"); return rows.filter(row => row.user_id === userId); },
  async get(userId, id) { storeCalls++; return rows.find(row => row.user_id === userId && row.id === id) ?? null; },
  async create(userId, key) {
    storeCalls++;
    if (failure) throw Error("UNAVAILABLE");
    const previous = rows.find(row => row.user_id === userId && row.request_key === key);
    if (previous) return previous;
    if (rows.some(row => row.user_id === userId && clock - new Date(row.created_at).getTime() < 12000)) throw Error("PORTFOLIO_SIMULATION_ACTIVE");
    const row = { id: randomUUID(), user_id: userId, request_key: key, scenario_version: PORTFOLIO_DEMO_VERSION, created_at: new Date(clock).toISOString() };
    rows.push(row); return row;
  },
};
const app = express();
app.use(express.json());
registerPortfolioSimulationRoutes(app, (req, res, next) => {
  const actor = req.get("x-synthetic-user");
  if (!actor) { res.status(401).json({ error: "UNAUTHORIZED" }); return; }
  req.userId = actor; next();
}, { store, now: () => clock });
const server = createServer(app);
let origin: string;
before(async () => {
  globalThis.fetch = async () => { externalCalls++; throw Error("EXTERNAL_CALL_FORBIDDEN"); };
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => {
  globalThis.fetch = realFetch;
  await new Promise<void>(resolve => server.close(() => resolve()));
  await closeStorage();
});
const request = (path: string, actor?: string, body?: unknown) => realFetch(origin + path, {
  method: body ? "POST" : "GET",
  headers: { ...(actor ? { "x-synthetic-user": actor } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

describe("complete portfolio committee, purely synthetic", () => {
  it("keeps RV/RF identities and groups the six new AI personas explicitly", () => {
    assert.equal(listarAgentes("rv").length, 10);
    assert.equal(listarAgentes("rf").length, 6);
    assert.deepEqual(listarAgentes("carteira"), ["bruno", "denise", "larissa", "paulo", "sergio", "tereza"]);
    assert.equal(listarAgentes().length, 22);
    for (const agent of PORTFOLIO_AGENTS) {
      assert.ok(!listarAgentes("rf").includes(agent.id));
      assert.match(CVS[agent.id].resumo, /Persona de IA, não profissional humano/);
      assert.deepEqual(CVS[agent.id].formacao, []);
      assert.deepEqual(CVS[agent.id].certificacoes, []);
      assert.deepEqual(CVS[agent.id].experiencia, []);
    }
  });
  it("calculates only supported nominal metrics from the versioned fictional composition", () => {
    assert.equal(portfolioScenario().assets.length, 5);
    const metrics = portfolioMetrics();
    assert.equal(metrics.totalValue, 100000);
    assert.deepEqual(metrics.byClass.map(group => group.weightPercent), [40, 40, 20]);
    assert.equal(metrics.largestHolding.weightPercent, 30);
    assert.equal(metrics.topTwoPercent, 55);
    assert.equal(metrics.holdings.reduce((sum, item) => sum + item.weightPercent, 0), 100);
    assert.match(metrics.methodology, /Não há preços de mercado/);
    assert.throws(() => portfolioScenario("unknown-version"), /UNKNOWN_PORTFOLIO_SCENARIO/);
  });
  it("requires authentication for scenario, creation, list and detail before storage", async () => {
    const count = storeCalls;
    for (const path of ["/api/investments/portfolio-simulation/scenario", "/api/investments/portfolio-simulations", `/api/investments/portfolio-simulations/${randomUUID()}`]) {
      assert.equal((await request(path)).status, 401);
    }
    assert.equal((await request("/api/investments/portfolio-simulations", undefined, { requestKey: randomUUID() })).status, 401);
    assert.equal(storeCalls, count);
  });
  it("offers a demo without loading holdings, suitability, history or quotes", async () => {
    const count = storeCalls;
    const response = await request("/api/investments/portfolio-simulation/scenario", "alpha");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    const demo = await response.json();
    assert.equal(demo.tokensUsed, 0);
    assert.equal(demo.agents.length, 6);
    assert.match(demo.scenario.disclaimer, /não corresponde à sua carteira/);
    assert.equal(storeCalls, count);
  });
  it("rejects owner/model/positions/profile injection rather than accepting client financial input", async () => {
    const count = storeCalls;
    for (const extra of [{ userId: "beta" }, { positions: [{ ticker: "REAL", value: 999 }] }, { profile: "real" }, { model: "paid" }, { scenarioVersion: "other" }, { credits: 1 }]) {
      assert.equal((await request("/api/investments/portfolio-simulations", "alpha", { requestKey: randomUUID(), ...extra })).status, 400);
    }
    assert.equal((await request("/api/investments/portfolio-simulations", "alpha", { requestKey: "invalid" })).status, 400);
    assert.equal(storeCalls, count);
  });
  it("distinguishes empty history, unavailable schema and active-study conflict", async () => {
    assert.deepEqual(await (await request("/api/investments/portfolio-simulations", "alpha")).json(), { studies: [] });
    failure = true;
    const unavailable = await request("/api/investments/portfolio-simulations", "alpha");
    assert.equal(unavailable.status, 503);
    assert.doesNotMatch(JSON.stringify(await unavailable.json()), /MISSING_TABLE/);
    failure = false;
    const first = await request("/api/investments/portfolio-simulations", "alpha", { requestKey: randomUUID() });
    assert.equal(first.status, 202);
    assert.equal((await first.json()).synthesis, null);
    assert.equal((await request("/api/investments/portfolio-simulations", "alpha", { requestKey: randomUUID() })).status, 409);
  });
  it("isolates creation idempotency, detail and history across users and binds identity to auth", async () => {
    const alpha = rows[0];
    const retry = await (await request("/api/investments/portfolio-simulations", "alpha", { requestKey: alpha.request_key })).json();
    assert.equal(retry.id, alpha.id);
    assert.equal(retry.user_id, undefined);
    assert.equal(retry.request_key, undefined);
    assert.equal((await request(`/api/investments/portfolio-simulations/${alpha.id}`, "beta")).status, 404);
    assert.deepEqual(await (await request("/api/investments/portfolio-simulations", "beta")).json(), { studies: [] });
    assert.equal((await request("/api/investments/portfolio-simulations/not-a-uuid", "beta")).status, 400);
    const beta = await (await request("/api/investments/portfolio-simulations", "beta", { requestKey: alpha.request_key })).json();
    assert.notEqual(beta.id, alpha.id);
    assert.equal((await request(`/api/investments/portfolio-simulations/${beta.id}`, "alpha")).status, 404);
  });
  it("progresses all six agents locally and reopens identical Denise synthesis from history", async () => {
    const row = rows[0];
    for (let step = 0; step <= 6; step++) {
      const presentation = presentPortfolioStudy(row, new Date(row.created_at).getTime() + step * 2000);
      assert.equal(presentation.completedAgents, step);
      assert.equal(presentation.agents.filter(agent => agent.output !== null).length, step);
      assert.equal(presentation.synthesis !== null, step === 6);
      assert.equal(presentation.tokensUsed, 0);
      assert.equal(presentation.creditsDebited, 0);
      assert.equal(presentation.recommendation, "blocked");
      assert.equal(presentation.professionalReview, "not_applicable");
    }
    clock += 12000;
    const detail = await (await request(`/api/investments/portfolio-simulations/${row.id}`, "alpha")).json();
    const history = await (await request("/api/investments/portfolio-simulations", "alpha")).json();
    assert.equal(history.studies[0].synthesis, detail.synthesis);
    assert.match(detail.synthesis, /Denise/);
    assert.match(detail.synthesis, /55%/);
    assert.equal(detail.status, "completed");
    assert.equal(externalCalls, 0);
  });
  it("uses dedicated append-only storage and never reads real financial tables or enables inference", () => {
    const source = readFileSync("server/portfolio-simulation.ts", "utf8");
    assert.doesNotMatch(source, /fetch\(|Hermes|runAgents|runCommittee|portfolio_holdings|portfolio_transactions|suitability|createReport|sendEmail|debit/);
    assert.match(source, /WHERE user_id=\$1 AND id=\$2/);
    assert.match(source, /LIMIT 30/);
    const migration = readFileSync("migrations/0016_portfolio_simulation.sql", "utf8");
    assert.doesNotMatch(migration, /\b(?:DROP|DELETE|TRUNCATE|ALTER|GRANT|REVOKE)\b/i);
    assert.match(migration, /scenario_version = 'portfolio-demo-v1'/);
  });
});
