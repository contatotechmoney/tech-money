import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import { Pool } from "pg";
import { PostgresPilotLedger } from "./portfolio-pilot-ledger";
import { verifiedPilotOwner } from "./portfolio-pilot-owner";
import { bindReviewedProductionOwner } from "./portfolio-pilot-binding";
import { PortfolioPilot } from "./portfolio-pilot";
import { createPilotExecutor } from "./portfolio-pilot-executor";
import express from "express";
import { registerOwnerBindingAction } from "./portfolio-pilot-owner-binding-action";
import { productionOwnerReference } from "./portfolio-pilot-confirmation";
import { readProductionOwnerBinding } from "./portfolio-pilot-binding";

// Refuse workspace/prod credentials. This suite is registered in the disposable DB runner.
if (process.env.SYNTHETIC_DATABASE !== "1") throw new Error("DISPOSABLE_SYNTHETIC_DATABASE_REQUIRED");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
after(() => pool.end());
describe("durable pilot ledger on disposable PostgreSQL", () => {
  it("persists atomic state and separate audit across adapter reconstruction", async () => {
    const owner = `synthetic-${randomUUID()}`;
    const first = new PostgresPilotLedger(pool);
    await first.transaction(owner, async state => {
      state.events.push({ type: "synthetic-only", budgetId: "fake", fingerprint: "a".repeat(64), at: 1 });
    });
    const second = new PostgresPilotLedger(pool);
    assert.equal((await second.transaction(owner, async state => state.events)).length, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM portfolio_pilot_audit WHERE user_id=$1", [owner])).rows[0].n, 1);
    await assert.rejects(second.transaction(owner, async state => { state.events = []; }), /AUDIT_IMMUTABLE/);
    assert.equal((await second.transaction(owner, async state => state.events)).length, 1);
  });
  it("rolls back audit and state together and isolates account parameters", async () => {
    const owner = `synthetic-${randomUUID()}`, other = `synthetic-${randomUUID()}`, ledger = new PostgresPilotLedger(pool);
    await assert.rejects(ledger.transaction(owner, async state => {
      state.events.push({ type: "rolled-back", budgetId: "fake", fingerprint: "b".repeat(64), at: 1 });
      throw new Error("synthetic-failure");
    }));
    assert.equal((await ledger.transaction(owner, async state => state.events)).length, 0);
    assert.equal((await ledger.transaction(other, async state => state.events)).length, 0);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM portfolio_pilot_audit WHERE user_id=$1", [owner])).rows[0].n, 0);
  });
  it("serializes parallel writes from independent connections with no lost audit", async () => {
    const owner = `synthetic-${randomUUID()}`;
    await Promise.all(Array.from({ length: 10 }, (_, i) => new PostgresPilotLedger(pool).transaction(owner, async state => {
      state.events.push({ type: `parallel-${i}`, budgetId: "fake", fingerprint: "c".repeat(64), at: i });
    })));
    const state = await new PostgresPilotLedger(pool).transaction(owner, async state => state);
    assert.equal(state.events.length, 10);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM portfolio_pilot_audit WHERE user_id=$1", [owner])).rows[0].n, 10);
  });
  it("requires reviewed binding plus server-recorded official proof, exact environment and verified primary email", async () => {
    const actor = `synthetic-${randomUUID()}`, proof = "d".repeat(64);
    let officialCalls = 0;
    const official = async (id: string) => { officialCalls++; return {
      id, primaryEmailAddressId: "synthetic-email", emailAddresses: [{ id: "synthetic-email", verification: { status: "verified" } }],
    }; };
    assert.equal(await verifiedPilotOwner(pool, actor, "development", official), null);
    assert.equal(officialCalls, 0);
    await pool.query(`INSERT INTO portfolio_pilot_owner_bindings(singleton,clerk_user_id,clerk_environment,evidence_digest,verification_method,verified_at)
      VALUES(true,$1,'development',$2,'official_clerk_owner_attestation',now())`, [actor, proof]);
    try {
      assert.equal(await verifiedPilotOwner(pool, actor, "development", official), null);
      await new PostgresPilotLedger(pool).transaction(actor, async state => {
        state.events.push({ type: "identity_verified:development", budgetId: "identity-attestation", fingerprint: proof, at: Date.now() });
      });
      assert.equal(await verifiedPilotOwner(pool, actor, "production", official), null);
      assert.equal(await verifiedPilotOwner(pool, "foreign", "development", official), null);
      assert.equal(await verifiedPilotOwner(pool, actor, "development", official), actor);
      assert.equal(officialCalls, 1);
      await pool.query("UPDATE portfolio_pilot_owner_bindings SET revoked_at=now() WHERE singleton=true");
      assert.equal(await verifiedPilotOwner(pool, actor, "development", official), null);
    } finally { await pool.query("DELETE FROM portfolio_pilot_owner_bindings WHERE clerk_user_id=$1", [actor]); }
  });
  it("atomically audits synthetic production binding and refuses replacing it with a homonym", async () => {
    const actor = `synthetic-${randomUUID()}`;
    const options = {
      expectedOwner: actor, auth: () => ({ userId: actor, sessionId: "synthetic-session" }),
      officialUser: async (id: string) => ({ id, primaryEmailAddressId: "synthetic-primary",
        emailAddresses: [{ id: "synthetic-primary", verification: { status: "verified" } }] }),
      officialSession: async (id: string) => ({ id, userId: actor, status: "active" }),
      pool, environment: () => "production" as const,
    };
    try {
      const first = await bindReviewedProductionOwner(options);
      assert.equal(first.ownerBound, true); assert.equal(first.executable, false);
      await bindReviewedProductionOwner(options);
      assert.equal((await pool.query("SELECT revision FROM portfolio_pilot_accounts WHERE user_id=$1", [actor])).rows[0].revision, 1);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM portfolio_pilot_audit WHERE user_id=$1", [actor])).rows[0].n, 2);
      assert.equal(await verifiedPilotOwner(pool, actor, "production", options.officialUser), actor);
      const other = `synthetic-${randomUUID()}`;
      await assert.rejects(bindReviewedProductionOwner({ ...options, expectedOwner: other,
        auth: () => ({ userId: other, sessionId: "synthetic-session-other" }),
        officialSession: async id => ({ id, userId: other, status: "active" }) }), /OWNER_BINDING_CONFLICT/);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM portfolio_pilot_accounts WHERE user_id=$1", [other])).rows[0].n, 0);
    } finally { await pool.query("DELETE FROM portfolio_pilot_owner_bindings WHERE clerk_user_id=$1", [actor]); }
  });
  it("HTTP consent to audited binding to re-opened status uses only fake Clerk and disposable PostgreSQL", async () => {
    const owner = `synthetic-${randomUUID()}`;
    const actor = { userId: owner, sessionId: "synthetic-http-session" };
    const officialUser = async (id: string) => ({ id, primaryEmailAddressId: "synthetic-primary",
      emailAddresses: [{ id: "synthetic-primary", verification: { status: "verified" } }] });
    const officialSession = async (id: string) => ({ id, userId: owner, status: "active" });
    const app = express(); app.use(express.json());
    registerOwnerBindingAction(app, (req, _res, next) => { req.userId = actor.userId; next(); },
      (_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); }, {
        metadata: { environment: () => "production", ownerReference: () => productionOwnerReference(owner),
          now: Date.now, user: officialUser, session: officialSession },
        signedActor: () => actor,
        read: signed => readProductionOwnerBinding(pool, signed.userId!, officialUser),
        bind: signed => bindReviewedProductionOwner({
          expectedOwner: signed.userId!, auth: () => signed, officialUser, officialSession, pool,
          environment: () => "production",
        }),
      });
    const listener = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => listener.once("listening", resolve));
    const port = (listener.address() as { port: number }).port;
    const url = `http://127.0.0.1:${port}/api/investments/portfolio-pilot/account-binding`;
    const post = () => fetch(url, { method: "POST",
      headers: { "content-type": "application/json", origin: `https://127.0.0.1:${port}` },
      body: JSON.stringify({ confirmExclusiveOwner: true }) });
    try {
      assert.equal((await (await fetch(url)).json()).ownerBound, false);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM portfolio_pilot_accounts WHERE user_id=$1", [owner])).rows[0].n, 0);
      assert.equal((await post()).status, 200);
      const state = await (await fetch(url)).json();
      assert.equal(state.ownerBound, true); assert.equal(state.auditRecorded, true); assert.equal(state.executable, false);
      assert.doesNotMatch(JSON.stringify(state), /synthetic-|fingerprint|evidence/);
      assert.equal((await post()).status, 200);
      assert.equal((await pool.query("SELECT revision FROM portfolio_pilot_accounts WHERE user_id=$1", [owner])).rows[0].revision, 1);
      actor.userId = `synthetic-${randomUUID()}`;
      assert.equal((await fetch(url)).status, 403); assert.equal((await post()).status, 403);
      actor.userId = owner;
      await pool.query("UPDATE portfolio_pilot_owner_bindings SET revoked_at=now() WHERE clerk_user_id=$1", [owner]);
      assert.equal((await (await fetch(url)).json()).revoked, true);
      assert.equal((await post()).status, 409);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM portfolio_pilot_audit WHERE user_id=$1", [owner])).rows[0].n, 2);
    } finally {
      await new Promise<void>(resolve => listener.close(() => resolve()));
      await pool.query("DELETE FROM portfolio_pilot_owner_bindings WHERE clerk_user_id=$1", [owner]);
    }
  });
  it("concurrent binding preserves singleton, one account revision and two durable proofs", async () => {
    const owner = `synthetic-${randomUUID()}`;
    const options = {
      expectedOwner: owner, auth: () => ({ userId: owner, sessionId: "synthetic-concurrent-session" }),
      officialUser: async (id: string) => ({ id, primaryEmailAddressId: "synthetic-primary",
        emailAddresses: [{ id: "synthetic-primary", verification: { status: "verified" } }] }),
      officialSession: async (id: string) => ({ id, userId: owner, status: "active" }),
      pool, environment: () => "production" as const,
    };
    try {
      const results = await Promise.all([bindReviewedProductionOwner(options), bindReviewedProductionOwner(options)]);
      assert.ok(results.every(result => result.ownerBound && !result.executable));
      assert.equal((await pool.query("SELECT revision FROM portfolio_pilot_accounts WHERE user_id=$1", [owner])).rows[0].revision, 1);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM portfolio_pilot_audit WHERE user_id=$1", [owner])).rows[0].n, 2);
    } finally { await pool.query("DELETE FROM portfolio_pilot_owner_bindings WHERE clerk_user_id=$1", [owner]); }
  });
  it("refuses a repeated binding with missing durable audit instead of claiming success or repairing silently", async () => {
    const owner = `synthetic-${randomUUID()}`;
    const options = {
      expectedOwner: owner, auth: () => ({ userId: owner, sessionId: "synthetic-integrity-session" }),
      officialUser: async (id: string) => ({ id, primaryEmailAddressId: "synthetic-primary",
        emailAddresses: [{ id: "synthetic-primary", verification: { status: "verified" } }] }),
      officialSession: async (id: string) => ({ id, userId: owner, status: "active" }),
      pool, environment: () => "production" as const,
    };
    try {
      await bindReviewedProductionOwner(options);
      // Deliberately corrupt only this disposable synthetic fixture.
      await pool.query("DELETE FROM portfolio_pilot_audit WHERE user_id=$1", [owner]);
      await assert.rejects(bindReviewedProductionOwner(options), /DURABLE_AUDIT_NOT_READY/);
      assert.equal((await pool.query("SELECT revision FROM portfolio_pilot_accounts WHERE user_id=$1", [owner])).rows[0].revision, 1);
      assert.equal((await readProductionOwnerBinding(pool, owner, options.officialUser)).ownerBound, false);
    } finally { await pool.query("DELETE FROM portfolio_pilot_owner_bindings WHERE clerk_user_id=$1", [owner]); }
  });
  it("runs approval-to-six-agents-to-private-history through durable adapters with only fake provider", async () => {
    const actor = `synthetic-${randomUUID()}`, now = Date.now();
    let calls = 0;
    const models = () => [{
      key: "fake-exact", name: "fake", provider: "fake", modelId: "fake-id", priceVersion: "fake-price",
      inputUsdMicrosPerMillion: 100_000, outputUsdMicrosPerMillion: 1_000_000,
      verifiedAt: now - 1, validUntil: now + 600_000, source: "synthetic", accountPricingVerified: true,
    }];
    const market = () => ({ version: "fake-market", verifiedAt: now - 1, validUntil: now + 600_000,
      verified: true, source: "synthetic", prices: { SYN: 10 },
      engine: { source: "synthetic", asOf: "2026-10-10", prices: { SYN: 10 }, histories: {} } });
    const executor = createPilotExecutor({ complete: async input => {
      calls++; return { modelId: input.modelId, priceVersion: input.priceVersion,
        inputTokens: 20, outputTokens: 20, result: { summary: "synthetic", observations: [] } };
    } });
    const construct = () => new PortfolioPilot({
      ownerId: actor, models, market, now: Date.now, executorReady: true, execute: executor,
      ledger: new PostgresPilotLedger(pool),
      positions: async () => [{ id: "SYN", ticker: "SYN", quantity: 1 }],
    });
    const pilot = construct(), request = { requestKey: randomUUID(), positionIds: ["SYN"], modelKey: "fake-exact", maxSpendUsdMicros: 10_000 };
    const budget = await pilot.quote(actor, request);
    await assert.rejects(pilot.execute(actor, { budgetId: budget.id }), /APPROVAL_REQUIRED/);
    await construct().approve(actor, { budgetId: budget.id, fingerprint: budget.fingerprint, confirm: true });
    const competing = await Promise.all(Array.from({ length: 5 }, () => construct().execute(actor, { budgetId: budget.id })));
    assert.equal(new Set(competing.map(r => r.id)).size, 1); assert.equal(calls, 6);
    const reopened = await construct().history(actor);
    assert.equal(reopened[0].status, "completed");
    assert.equal(reopened[0].consumption.calls, 6);
    await assert.rejects(construct().history("foreign"), /PILOT_CLOSED/);
    assert.equal((await construct().execute(actor, { budgetId: budget.id })).id, reopened[0].id);
    assert.equal(calls, 6);
  });
});
