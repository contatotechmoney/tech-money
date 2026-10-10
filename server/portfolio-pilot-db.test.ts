import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import { Pool } from "pg";
import { PostgresPilotLedger } from "./portfolio-pilot-ledger";
import { verifiedPilotOwner } from "./portfolio-pilot-owner";
import { PortfolioPilot } from "./portfolio-pilot";
import { createPilotExecutor } from "./portfolio-pilot-executor";

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
