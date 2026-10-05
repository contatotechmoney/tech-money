import assert from "node:assert/strict";
import { test } from "node:test";
import { createCommitteePreview, type PreviewScenario } from "../client/src/lib/committee-preview";
import type { AnalysisJob, AnalysisOptions } from "../client/src/components/hermes-analysis-panel";

const path = "/api/investments/analyses";
async function offer(engine: ReturnType<typeof createCommitteePreview>) {
  const options = await engine.transport.request("GET", "/api/investments/analysis-options") as AnalysisOptions;
  const m = options.models[0];
  return { ticker: "BBDC3", modelId: m.id, idempotencyKey: crypto.randomUUID(), confirmedCredits: m.credits, priceVersion: m.priceVersion };
}
test("preview rejects unapproved or stale prices without debiting", async () => {
  const e = createCommitteePreview(), payload = await offer(e);
  await assert.rejects(e.transport.request("POST", path, { ...payload, confirmedCredits: undefined }), /PRICE_CHANGED/);
  e.reprice();
  await assert.rejects(e.transport.request("POST", path, payload), /PRICE_CHANGED/);
  assert.equal(e.ledger().length, 0);
});
test("preview refuses insufficient credits and unknown routes", async () => {
  const e = createCommitteePreview("success", 0);
  await assert.rejects(e.transport.request("POST", path, await offer(e)), /INSUFFICIENT_CREDITS/);
  await assert.rejects(e.transport.request("GET", "/api/live-provider"), /não disponível/);
  assert.equal(e.ledger().length, 0);
});
for (const scenario of ["success", "incomplete", "limit", "uncertain"] as PreviewScenario[]) {
  test(`${scenario}: isolated wallet settlement and idempotency without network`, async () => {
    const saved = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("Network forbidden in fixture"); };
    try {
      const e = createCommitteePreview(scenario), payload = await offer(e);
      const job = await e.transport.request("POST", path, payload) as AnalysisJob;
      assert.equal((await e.transport.request("POST", path, payload) as AnalysisJob).id, job.id);
      for (let i = 0; i < 5; i++) await e.transport.request("GET", `${path}/${job.id}`);
      const options = await e.transport.request("GET", "/api/investments/analysis-options") as AnalysisOptions;
      assert.equal(e.ledger().filter(l => l.kind === "reserve").length, 1);
      if (scenario === "uncertain") {
        assert.deepEqual(options.wallet, { available: 18, reserved: 2 });
        await assert.rejects(e.transport.request("POST", path, { ...payload, idempotencyKey: crypto.randomUUID() }), /ANALYSIS_IN_PROGRESS/);
      } else if (scenario === "success") {
        assert.deepEqual(options.wallet, { available: 18, reserved: 0 });
        assert.equal(e.ledger().filter(l => l.kind === "consume").length, 1);
      } else {
        assert.deepEqual(options.wallet, { available: 20, reserved: 0 });
        assert.equal(e.ledger().filter(l => l.kind === "refund").length, 1);
      }
    } finally { globalThis.fetch = saved; }
  });
}
