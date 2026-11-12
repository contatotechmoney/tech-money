import test from "node:test";
import assert from "node:assert/strict";
import { equityBudget } from "../shared/equity-committee-budget";
import { runMeteredEquityCommittee, type EquityCallEvent } from "./equity-committee-meter";

const tariff = {
  modelId: "deepseek/deepseek-v4.1-flash", priceVersion: "a".repeat(64),
  inputUsdMicrosPerMillion: 106000, outputUsdMicrosPerMillion: 513000,
  verifiedAt: 1, validUntil: 1000, accountPricingVerified: false,
};
function fixture() {
  const events: EquityCallEvent[] = [];
  const calls: string[] = [];
  return { events, calls, options: {
    mode: "simulation" as const, owner: "owner-test", ticker: "DEMO3", dossier: "Fictional dossier",
    tariff, now: () => 2, countPrompt: (prompt: string) => Math.ceil(prompt.length / 3.6),
    append: async (event: EquityCallEvent) => { events.push(event); },
    simulate: async (call: { agentId: string; modelId: string; priceVersion: string; prompt: string; maxOutputTokens: number }) => {
      assert.equal(events.at(-1)?.status, "reserved");
      calls.push(call.agentId);
      if (call.agentId === "rafael") {
        assert.equal(call.maxOutputTokens, 1000);
        assert.equal(calls.length, 10);
        for (const id of calls.slice(0, -1)) assert.match(call.prompt, new RegExp(`Opinion ${id}`));
      } else assert.equal(call.maxOutputTokens, 400);
      return { modelId: call.modelId, priceVersion: call.priceVersion,
        text: `Opinion ${call.agentId}`, inputTokens: 1200, outputTokens: 100 };
    },
  } };
}

test("caps and rounds a complete ten-call budget, refuses expired and malformed pricing", () => {
  const q = equityBudget("DEMO3", tariff, 2);
  assert.equal(q.agents.length, 10);
  assert.equal(new Set(q.agents.map(a => a.id)).size, 10);
  assert.equal(q.agents.at(-1)?.id, "rafael");
  assert.equal(q.maxUsdMicros, 10317);
  assert.equal(q.approvalAvailable, false);
  assert.throws(() => equityBudget("DEMO3", tariff, 1000), /PRICE_UNAVAILABLE/);
  assert.throws(() => equityBudget("DEMO3", { ...tariff, outputUsdMicrosPerMillion: -1 }, 2), /INVALID_USAGE_OR_RATE/);
});

test("records receipt usage per call, with a single run ID and Rafael synthesizing all nine", async () => {
  const { options, events, calls } = fixture();
  const run = await runMeteredEquityCommittee(options);
  assert.equal(events.length, 20);
  assert.equal(new Set(events.map(e => e.runId)).size, 1);
  assert.equal(new Set(events.map(e => e.quoteDigest)).size, 1);
  assert.equal(run.metered.length, 10);
  assert.equal(calls.at(-1), "rafael");
  assert.ok(run.metered.every(e => e.status === "metered" && e.inputTokens === 1200 && e.outputTokens === 100 && e.costUsdMicros === 179));
  assert.equal(run.creditsDebited, 0);
});

test("blocks real calls before any persistence or dispatch, even with confirmed pricing", async () => {
  const { options, events, calls } = fixture();
  await assert.rejects(runMeteredEquityCommittee({ ...options, mode: "real", tariff: { ...tariff, accountPricingVerified: true } }), /REAL_ANALYSIS_DISABLED/);
  assert.deepEqual(events, []);
  assert.deepEqual(calls, []);
});

test("never dispatches over the input cap or when the reservation could not be recorded", async () => {
  const { options, calls, events } = fixture();
  await assert.rejects(runMeteredEquityCommittee({ ...options, countPrompt: () => 7001 }), /INPUT_LIMIT/);
  await assert.rejects(runMeteredEquityCommittee({ ...options, append: async () => { throw Error("LEDGER_UNAVAILABLE"); } }), /LEDGER_UNAVAILABLE/);
  assert.deepEqual(calls, []);
  assert.deepEqual(events, []);
});

test("records unknown usage without inventing zero cost, and stops without retry", async () => {
  const { options, events, calls } = fixture();
  await assert.rejects(runMeteredEquityCommittee({ ...options, simulate: async call => ({
    ...await options.simulate(call), priceVersion: "unverified",
  }) }), /USAGE_UNVERIFIED/);
  assert.equal(calls.length, 1);
  assert.equal(events.at(-1)?.status, "usage_unknown");
  assert.equal("costUsdMicros" in events.at(-1)!, false);
});

test("retains over-limit usage instead of silently clipping the cost", async () => {
  const { options, events, calls } = fixture();
  await assert.rejects(runMeteredEquityCommittee({ ...options, simulate: async call => ({
    ...await options.simulate(call), outputTokens: 500,
  }) }), /CALL_LIMIT_EXCEEDED/);
  assert.equal(calls.length, 1);
  assert.match(JSON.stringify(events.at(-1)), /"status":"limit_violation".*"outputTokens":500/);
});

test("database audit keeps reservation and receipt per call, rejects duplicates, hides rows from browser roles", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFile } = await import("node:fs/promises");
  const { equityAuditAppender } = await import("./equity-committee-audit");
  const pg = new PGlite();
  try {
    await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
    await pg.exec(await readFile(new URL("../migrations/0019_equity_committee_call_audit.sql", import.meta.url), "utf8"));
    const { options } = fixture();
    const append = equityAuditAppender((sql, values) => pg.query(sql, values));
    const run = await runMeteredEquityCommittee({ ...options, append: async event => {
      await append(event);
      await options.append(event);
    } });
    const rows = (await pg.query<{ agent_id: string; status: string; simulated: boolean; cost: number | null }>(
      "SELECT agent_id,status,simulated,cost_usd_micros::int AS cost FROM equity_committee_call_audit",
    )).rows;
    assert.equal(rows.length, 20);
    assert.equal(rows.filter(row => row.status === "reserved" && row.cost === null).length, 10);
    assert.equal(rows.filter(row => row.status === "metered" && row.simulated && row.cost === 179).length, 10);
    assert.equal(rows.filter(row => row.agent_id === "rafael").length, 2);
    await assert.rejects(append(run.metered[0]), /duplicate key/);
    await pg.exec("SET ROLE authenticated");
    await assert.rejects(pg.query("SELECT * FROM equity_committee_call_audit"), /permission denied/);
  } finally {
    await pg.close();
  }
});
