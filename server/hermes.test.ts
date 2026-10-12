import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { after, afterEach, describe, it } from "node:test";
import type { Server } from "node:http";
import { HermesClient, hermesConfig, type HermesConfig } from "./hermes-client";
import { registerHermesRoutes } from "./hermes-routes";
import { closeHermesJobs, publicJob, type AnalysisJob, type AnalysisStore } from "./hermes-jobs";

const config: HermesConfig = { url: "https://synthetic.invalid", key: "synthetic-not-a-secret", models: [{ id: "standard", label: "Sintético", provider: "test", model: "model" }], users: ["owner"], tickers: ["BBDC3"], dailyLimit: 3, globalLimit: 10, globalConcurrent: 2 };
let servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.map(s => new Promise<void>(resolve => s.close(() => resolve())))); servers = []; });
after(closeHermesJobs);
function fixture(): AnalysisJob {
  return { id: randomUUID(), user_id: "owner", idempotency_key: randomUUID(), ticker: "BBDC3", model_id: "standard", status: "submitting", run_id: null, output: null, runtime: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
}
function memoryStore(job: AnalysisJob): AnalysisStore {
  return {
    async ready() { return true; }, async list(user) { return user === job.user_id ? [job] : []; },
    async get(user, id) { return user === job.user_id && id === job.id ? job : null; },
    async reserve(user, key, ticker, model) {
      if (user !== job.user_id) throw Error("OTHER_OWNER");
      if (ticker !== job.ticker || model !== job.model_id) throw Error("IDEMPOTENCY_CONFLICT");
      job.idempotency_key = key; return job;
    },
    async attach(user, id, runId) { assert.equal(user, job.user_id); assert.equal(id, job.id); job.run_id = runId; job.status = "running"; },
    async update(user, id, result) { assert.equal(user, job.user_id); assert.equal(id, job.id); Object.assign(job, result); },
  };
}
async function start(user: string | null, store: AnalysisStore, client: Pick<HermesClient, "start" | "poll">, value: HermesConfig | null = config) {
  const app = express(); app.use(express.json());
  registerHermesRoutes(app, (req, res, next) => { if (!user) { res.status(401).end(); return; } req.userId = user; next(); }, { store, client, config: () => value });
  const server = app.listen(0, "127.0.0.1"); servers.push(server);
  await new Promise<void>(resolve => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
const forbiddenClient = { async start(): Promise<string> { throw Error("REMOTE_SHOULD_NOT_RUN"); }, async poll(): Promise<never> { throw Error("REMOTE_SHOULD_NOT_RUN"); } };
describe("Hermes bridge: synthetic inputs, no DB or external provider", () => {
  it("is disabled by default and rejects insecure or incomplete configuration", () => {
    assert.equal(hermesConfig({}), null);
    assert.equal(hermesConfig({ HERMES_ANALYSIS_ENABLED: "true", HERMES_API_URL: "http://example.invalid" }), null);
    assert.equal(hermesConfig({ HERMES_ANALYSIS_ENABLED: "true", HERMES_API_URL: "https://example.invalid" }), null);
  });
  it("submission sends explicit model/provider and a stable idempotency key, without customer data", async () => {
    let seen: RequestInit | undefined;
    const client = new HermesClient(config, async (_url, init) => { seen = init; return new Response(JSON.stringify({ run_id: "synthetic-run" })); });
    assert.equal(await client.start("stable-key", "BBDC3", config.models[0]), "synthetic-run");
    const payload = JSON.parse(String(seen?.body));
    assert.equal(payload.provider, "test"); assert.equal(payload.model, "model");
    assert.equal((seen?.headers as Record<string, string>)["Idempotency-Key"], "stable-key");
    assert.equal(seen?.redirect, "error"); assert.ok(!payload.session_id && !payload.userId);
  });
  it("records actual fallback runtime and rejects a completed run without output", async () => {
    const client = new HermesClient(config, async () => new Response(JSON.stringify({ status: "completed", output: "Texto sintético", runtime: { provider: "fallback", model: "different" } })));
    assert.equal((await client.poll("run")).runtime?.model, "different");
    const bad = new HermesClient(config, async () => new Response(JSON.stringify({ status: "completed" })));
    await assert.rejects(bad.poll("run"), /INVALID_RESPONSE/);
  });
  it("requires authentication", async () => {
    const url = await start(null, memoryStore(fixture()), forbiddenClient);
    assert.equal((await fetch(url + "/api/investments/analyses")).status, 401);
  });
  it("disabled or unapproved accounts never call storage or Hermes", async () => {
    const store = memoryStore(fixture()); store.ready = async () => { throw Error("DB_SHOULD_NOT_RUN"); };
    const url = await start("other", store, forbiddenClient);
    assert.equal((await (await fetch(url + "/api/investments/analysis-options")).json()).available, false);
    assert.equal((await fetch(url + "/api/investments/analyses", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 503);
  });
  it("rejects arbitrary models, extra fields and unapproved tickers before reserving", async () => {
    const store = memoryStore(fixture()); store.reserve = async () => { throw Error("RESERVE_SHOULD_NOT_RUN"); };
    const url = await start("owner", store, forbiddenClient);
    for (const body of [{ ticker: "BBDC3", modelId: "arbitrary" }, { ticker: "PETR4", modelId: "standard" }, { ticker: "BBDC3", modelId: "standard", provider: "override" }]) {
      assert.equal((await fetch(url + "/api/investments/analyses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey: randomUUID() }) })).status, 400);
    }
  });
  it("verifies ownership before querying the remote run", async () => {
    const job = fixture(); job.user_id = "someone-else"; job.status = "running"; job.run_id = "private-run";
    const url = await start("owner", memoryStore(job), forbiddenClient);
    assert.equal((await fetch(url + `/api/investments/analyses/${job.id}`)).status, 404);
  });
  it("reuses submission after uncertainty and never exposes remote IDs or approval", async () => {
    const job = fixture(); const seen: string[] = [];
    const client = { async start(id: string) { seen.push(id); if (seen.length === 1) throw Error("UNCERTAIN"); return "private-run"; }, async poll() { return { status: "completed" as const, output: "Conteúdo sintético", runtime: null }; } };
    const url = await start("owner", memoryStore(job), client);
    const send = () => fetch(url + "/api/investments/analyses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker: job.ticker, modelId: job.model_id, idempotencyKey: job.idempotency_key }) });
    assert.equal((await send()).status, 503); const response = await send(); assert.equal(response.status, 202);
    assert.deepEqual(seen, [job.id, job.id]);
    const body = await response.json(); assert.equal(body.run_id, undefined); assert.equal(body.user_id, undefined);
    const result = await (await fetch(url + `/api/investments/analyses/${job.id}`)).json();
    assert.equal(result.status, "completed"); assert.equal(result.professionalReview, "pending"); assert.equal(result.purpose, "informational");
  });
  it("does not automatically resubmit uncertain jobs after provider key retention", async () => {
    const job = fixture(); job.created_at = new Date(Date.now() - 24 * 3600_000).toISOString();
    const url = await start("owner", memoryStore(job), forbiddenClient);
    const response = await fetch(url + "/api/investments/analyses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker: job.ticker, modelId: job.model_id, idempotencyKey: job.idempotency_key }) });
    assert.equal(response.status, 409);
  });
  it("maps budget and concurrency limits to actionable responses", async () => {
    for (const [error, status] of [["GLOBAL_LIMIT", 429], ["GLOBAL_BUSY", 429], ["DAILY_LIMIT", 429], ["ANALYSIS_ACTIVE", 409], ["IDEMPOTENCY_CONFLICT", 409]] as const) {
      const job = fixture(); const store = memoryStore(job); store.reserve = async () => { throw Error(error); };
      const url = await start("owner", store, forbiddenClient);
      assert.equal((await fetch(url + "/api/investments/analyses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker: job.ticker, modelId: job.model_id, idempotencyKey: job.idempotency_key }) })).status, status);
    }
  });
  it("public history excludes user IDs, remote run IDs and never claims review", () => {
    const result = publicJob(fixture()); assert.equal(result.professionalReview, "pending"); assert.equal("user_id" in result, false); assert.equal("run_id" in result, false);
  });
});
