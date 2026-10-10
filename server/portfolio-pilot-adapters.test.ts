import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateKeyPairSync, sign, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createNousPilotAdapter } from "./portfolio-pilot-nous";
import { preparePrivatePilot } from "./portfolio-pilot-runtime";
import { officialPilotIdentity } from "./portfolio-pilot-owner";
import { positionsVersion, verifyPilotMarket } from "./portfolio-pilot-market";
import { PortfolioPilot, type PilotAccountState, type PilotDependencies } from "./portfolio-pilot";
import { createPilotExecutor } from "./portfolio-pilot-executor";
import { randomUUID } from "node:crypto";
import { bindReviewedProductionOwner } from "./portfolio-pilot-binding";
import type { Pool } from "pg";

const modelId = "deepseek/deepseek-v4.1-flash";
const now = Date.parse("2026-10-10T12:00:00Z");
const catalogue = (prompt = "0.0000001060") => ({ data: [{
  id: modelId, name: "same name", canonical_slug: modelId,
  supported_parameters: ["max_tokens"], pricing: { prompt, completion: "0.0000005130" },
}] });
function providerFixture(options: { armed?: boolean; counter?: boolean; badUsage?: boolean; badOutput?: boolean } = {}) {
  const requests: { method: string; body?: string }[] = [];
  let payload = catalogue();
  const adapter = createNousPilotAdapter({
    credential: () => "synthetic-not-a-real-key", armed: options.armed !== false,
    tokenCounter: options.counter === false ? undefined : { modelId, methodology: "synthetic counter, not production proof", count: () => 20 },
    now: () => now,
    transport: async (_url, init) => {
      requests.push({ method: init.method!, body: init.body?.toString() });
      assert.equal(init.redirect, "error");
      if (init.method === "GET") {
        assert.equal(init.body, undefined);
        return Response.json(payload);
      }
      const request = JSON.parse(init.body!.toString());
      assert.equal(request.model, modelId); assert.equal(request.stream, false);
      assert.equal(request.max_tokens, 1000);
      return Response.json({
        model: modelId,
        usage: { prompt_tokens: 20, completion_tokens: options.badUsage ? 1001 : 30,
          total_tokens: options.badUsage ? 1021 : 50 },
        choices: [{ finish_reason: "stop", message: { content: options.badOutput ? "invalid json" :
          JSON.stringify({ summary: "Synthetic IA persona", observations: [] }) } }],
      });
    },
  });
  const input = async () => ({ agentId: "bruno", modelId, priceVersion: (await adapter.catalogue())[0].priceVersion,
    prompt: "Synthetic data only", maxInputTokens: 300, maxOutputTokens: 1000, signal: new AbortController().signal });
  return { adapter, input, requests, changePrice: () => { payload = catalogue("0.0000002060"); } };
}
describe("Nous transport — injected HTTP only, no real inference/credentials", () => {
  it("reads credential-scoped metadata, distinguishes authenticated from public evidence", async () => {
    const f = providerFixture(); const models = await f.adapter.catalogue();
    assert.equal(models[0].accountPricingVerified, true); assert.equal(models[0].modelId, modelId);
    assert.equal(f.requests.filter(request => request.method === "POST").length, 0);
  });
  it("sends only after gates, caps output and returns authoritative usage", async () => {
    const f = providerFixture(); const result = await f.adapter.provider.complete(await f.input());
    assert.equal(result.inputTokens, 20); assert.equal(result.outputTokens, 30);
    assert.equal(f.requests.filter(request => request.method === "POST").length, 1);
  });
  it("never dispatches in preparation even with credentials and tokenizer", async () => {
    const f = providerFixture({ armed: false }), input = await f.input();
    const before = f.requests.length;
    await assert.rejects(f.adapter.provider.complete(input), /REAL_EXECUTION_DISABLED/);
    assert.equal(f.requests.length, before);
  });
  it("never dispatches with missing tokenizer, excessive input or changed tariff", async () => {
    const missing = providerFixture({ counter: false });
    await assert.rejects(missing.adapter.provider.complete(await missing.input()), /TOKENIZER_UNVERIFIED/);
    const f = providerFixture(), input = await f.input();
    await assert.rejects(f.adapter.provider.complete({ ...input, maxInputTokens: 1 }), /TOKEN_LIMIT_EXCEEDED/);
    f.changePrice();
    await assert.rejects(f.adapter.provider.complete(input), /APPROVAL_INVALIDATED/);
    assert.equal([...f.requests, ...missing.requests].filter(request => request.method === "POST").length, 0);
  });
  it("rejects ambiguous receipts and preserves known usage on malformed output", async () => {
    const bad = providerFixture({ badUsage: true });
    await assert.rejects(bad.adapter.provider.complete(await bad.input()), /PROVIDER_RECEIPT_UNCONFIRMED/);
    const malformed = providerFixture({ badOutput: true });
    const result = await malformed.adapter.provider.complete(await malformed.input());
    assert.equal(result.result, null); assert.equal(result.outputTokens, 30);
  });
  it("does not fall back to public metadata or other credentials on authentication failure", async () => {
    let requests = 0;
    const adapter = createNousPilotAdapter({ credential: () => undefined, armed: false,
      transport: async () => { requests++; return Response.json({}, { status: 401 }); } });
    await assert.rejects(adapter.catalogue(), /NOUS_CREDENTIAL_UNAVAILABLE/); assert.equal(requests, 0);
    const rejected = createNousPilotAdapter({ credential: () => "synthetic", armed: false,
      transport: async () => { requests++; return Response.json({}, { status: 401 }); } });
    await assert.rejects(rejected.catalogue(), /ACCOUNT_TARIFF_UNVERIFIED/);
    assert.equal(rejected.models().length, 0);
  });
});

function marketFixture() {
  const keys = generateKeyPairSync("ed25519");
  const positions = [{ id: "SYN", ticker: "SYN", quantity: 2 }];
  const document = { owner: "synthetic-owner", positionsVersion: positionsVersion(positions),
    sourceId: "synthetic", source: "https://synthetic.invalid/observations", observedAt: now - 100,
    validUntil: now + 1000, asOf: "2026-10-09", prices: { SYN: 10 }, quoteTimes: { SYN: now - 86400000 },
    histories: {} };
  const envelope = (body = document) => {
    const payload = JSON.stringify(body);
    return { payload, signature: sign(null, Buffer.from(payload), keys.privateKey).toString("base64") };
  };
  const options = { actor: document.owner, positions, now,
    trustedSources: new Map([["synthetic", { url: document.source, publicKey: keys.publicKey }]]) };
  return { document, envelope, options };
}
describe("verified market observations — synthetic signatures only", () => {
  it("accepts signed owner-specific quotes and keeps absent histories absent", () => {
    const f = marketFixture(), result = verifyPilotMarket(f.envelope(), f.options);
    assert.equal(result.verified, true); assert.deepEqual(result.engine!.histories, {});
  });
  it("rejects tampering, unknown source, foreign account and changed quantities", () => {
    const f = marketFixture();
    assert.throws(() => verifyPilotMarket({ ...f.envelope(), payload: JSON.stringify({ ...f.document, prices: { SYN: 999 } }) }, f.options));
    assert.throws(() => verifyPilotMarket(f.envelope(), { ...f.options, trustedSources: new Map() }));
    assert.throws(() => verifyPilotMarket(f.envelope(), { ...f.options, actor: "foreign" }));
    assert.throws(() => verifyPilotMarket(f.envelope(), { ...f.options, positions: [{ id: "SYN", ticker: "SYN", quantity: 3 }] }));
  });
  it("rejects expired/future observations, stale/missing quotes and unsourced macro facts", () => {
    const f = marketFixture();
    for (const body of [{ ...f.document, validUntil: now }, { ...f.document, observedAt: now + 1 },
      { ...f.document, quoteTimes: {} }, { ...f.document, quoteTimes: { SYN: now - 86400000 * 4 } }])
      assert.throws(() => verifyPilotMarket(f.envelope(body), f.options));
    assert.throws(() => verifyPilotMarket(f.envelope({ ...f.document, macro: { facts: ["invented"] } } as any), f.options));
  });
});
describe("stateless official identity proof and closed runtime", () => {
  const official = async (id: string) => ({ id, primaryEmailAddressId: "primary",
    emailAddresses: [{ id: "primary", verification: { status: "verified" } }] });
  it("proves exact official subject without name/email disclosure or database writes", async () => {
    const result = await officialPilotIdentity("synthetic-owner", "production", official);
    assert.equal(result.environment, "production"); assert.equal(result.fingerprint.length, 64);
    assert.equal(JSON.stringify(result).includes("synthetic-owner"), false);
    const development = await officialPilotIdentity("synthetic-owner", "development", official);
    assert.notEqual(result.fingerprint, development.fingerprint);
  });
  it("rejects another returned subject, unverified primary and verified secondary only", async () => {
    await assert.rejects(officialPilotIdentity("synthetic-owner", "production", () => official("foreign")));
    await assert.rejects(officialPilotIdentity("synthetic-owner", "production", async id => ({
      id, primaryEmailAddressId: "primary", emailAddresses: [
        { id: "primary", verification: { status: "unverified" } },
        { id: "secondary", verification: { status: "verified" } }],
    })));
  });
  it("does not read positions, metadata, notebook or transmit anything when owner is unbound", async () => {
    let calls = 0;
    const runtime = await preparePrivatePilot({ ownerId: null, armed: false, credential: () => "synthetic",
      ledger: null, positions: async () => { calls++; return []; },
      transport: async () => { calls++; throw new Error("NO_NETWORK"); } });
    assert.equal(runtime.status("synthetic-owner").executable, false);
    await assert.rejects(runtime.positions("synthetic-owner"), /PILOT_CLOSED/);
    assert.equal(calls, 0);
  });
  it("does not bind in development, with another subject, revoked session or unverified email", async () => {
    let writes = 0;
    const options = {
      expectedOwner: "synthetic-owner", auth: () => ({ userId: "synthetic-owner", sessionId: "synthetic-session" }),
      officialUser: official,
      officialSession: async (id: string) => ({ id, userId: "synthetic-owner", status: "active" }),
      pool: { connect: async () => { writes++; throw new Error("NO_DB"); } } as unknown as Pool,
      environment: () => "production" as const,
    };
    await assert.rejects(bindReviewedProductionOwner({ ...options, environment: () => "development" }), /PRODUCTION_IDENTITY_REQUIRED/);
    await assert.rejects(bindReviewedProductionOwner({ ...options, auth: () => ({ userId: "homonym", sessionId: "fake" }) }), /OWNER_SESSION_REQUIRED/);
    await assert.rejects(bindReviewedProductionOwner({ ...options, officialSession: async id => ({ id, userId: "synthetic-owner", status: "revoked" }) }), /OWNER_SESSION_REQUIRED/);
    await assert.rejects(bindReviewedProductionOwner({ ...options, officialUser: async id => ({
      id, primaryEmailAddressId: "p", emailAddresses: [{ id: "p", verification: { status: "unverified" } }],
    }) }), /VERIFIED_IDENTITY_REQUIRED/);
    assert.equal(writes, 0);
  });
});
describe("explicit selection and six-agent adapter lifecycle — synthetic ledger only", () => {
  it("requires selection and budget approval, records six receipts, and invalidates approval on model change", async () => {
    const f = providerFixture();
    const models = await f.adapter.catalogue();
    const state: PilotAccountState = { budgets: [], events: [] };
    const deps: PilotDependencies = {
      ownerId: "synthetic-owner", now: () => now, models: () => models,
      positions: async () => [{ id: "SYN", ticker: "SYN", quantity: 2 }],
      ledger: { transaction: async (_owner, work) => work(state) },
      market: () => ({ verified: true, version: "synthetic", source: "synthetic", verifiedAt: now - 1,
        validUntil: now + 10000, prices: { SYN: 10 },
        engine: { source: "synthetic", asOf: "2026-10-09", prices: { SYN: 10 }, histories: {} } }),
      executorReady: true, requireModelSelection: true, execute: createPilotExecutor(f.adapter.provider),
    };
    const pilot = new PortfolioPilot(deps);
    const request = { requestKey: randomUUID(), positionIds: ["SYN"], modelKey: models[0].key, maxSpendUsdMicros: 10000 };
    await assert.rejects(pilot.quote("synthetic-owner", request), /MODEL_SELECTION_REQUIRED/);
    await assert.rejects(pilot.selectModel("foreign", { modelKey: models[0].key }), /PILOT_CLOSED/);
    await pilot.selectModel("synthetic-owner", { modelKey: models[0].key });
    const budget = await pilot.quote("synthetic-owner", request);
    await assert.rejects(pilot.execute("synthetic-owner", { budgetId: budget.id }), /APPROVAL_REQUIRED/);
    await pilot.approve("synthetic-owner", { budgetId: budget.id, fingerprint: budget.fingerprint, confirm: true });
    const run = await pilot.execute("synthetic-owner", { budgetId: budget.id });
    assert.equal(run.status, "completed"); assert.equal(run.agents.length, 6);
    assert.equal(f.requests.filter(request => request.method === "POST").length, 6);
    assert.equal(run.consumption.inputTokens, 120);
    assert.ok(run.consumption.costUsdMicros <= run.reservedConsumption!.costUsdMicros);
    await pilot.execute("synthetic-owner", { budgetId: budget.id });
    assert.equal(f.requests.filter(request => request.method === "POST").length, 6);
    models.push({ ...models[0], key: "nous:alternate-explicit", modelId: "synthetic-other" });
    await pilot.selectModel("synthetic-owner", { modelKey: "nous:alternate-explicit" });
    assert.equal(state.approval, undefined);
  });
});
describe("production browser self-check — fake sessions, no network", () => {
  const script = readFileSync("docs/portfolio-pilot-owner-self-check.md", "utf8").split("```javascript\n")[1].split("\n```")[0];
  async function run(authenticated: boolean, profileEnabled = true, hostname = "invest.techmoney.com.br") {
    let calls = 0, output = "";
    await vm.runInNewContext(script, {
      location: { hostname, origin: `https://${hostname}` }, crypto: webcrypto, TextEncoder, Uint8Array,
      console: { log: (value: string) => { output = value; } },
      fetch: async (path: string, init: RequestInit) => {
        calls++; assert.equal(init.method, "GET"); assert.equal(init.credentials, "same-origin");
        assert.ok(["/api/auth/session", "/api/leads/profile"].includes(path));
        return Response.json(path.endsWith("session") ? { authenticated, userId: "synthetic-private-subject" } :
          profileEnabled ? { email: "synthetic@invalid.test", nome: "private" } : { enabled: false },
        { status: authenticated ? 200 : 401 });
      },
    });
    return { output, calls };
  }
  it("emits salted diagnostic proof without subject, email, cookies or bearer token", async () => {
    const result = await run(true), report = JSON.parse(result.output);
    assert.equal(report.authenticated, true); assert.equal(report.primaryEmailVerified, true);
    assert.equal(report.ownerBound, false); assert.equal(report.executable, false);
    assert.equal(report.subjectFingerprint.length, 64); assert.equal(result.calls, 2);
    assert.equal(result.output.includes("synthetic-private-subject"), false);
    assert.equal(result.output.includes("synthetic@"), false);
  });
  it("does not accept unsigned enabled=false/profile placeholders or anonymous sessions", async () => {
    assert.equal(JSON.parse((await run(false)).output).primaryEmailVerified, false);
    assert.equal(JSON.parse((await run(true, false)).output).primaryEmailVerified, false);
  });
  it("cannot run against development or another site", async () => {
    const result = await run(true, true, "preview.invalid");
    assert.equal(result.calls, 0); assert.match(result.output, /Nenhum acesso foi concedido/);
  });
});
