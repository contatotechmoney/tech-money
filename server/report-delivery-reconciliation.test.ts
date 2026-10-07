import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, describe, it, mock } from "node:test";
import { Pool } from "pg";
import { closeStorage, storage, type ReportDeliveryStatus } from "./storage";
import {
  reconcileUnconfirmedReportDeliveries,
  startReportDeliveryWorker,
} from "./report-delivery";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const userId = `confirmation-test-${randomUUID()}`;
const cutoff = new Date("2026-01-02T00:00:00Z");

afterEach(async () => {
  mock.restoreAll();
  await pool.query("DELETE FROM report_delivery_requests WHERE user_id = $1", [userId]);
});
after(async () => {
  await Promise.all([pool.end(), closeStorage()]);
});

async function request(
  status: ReportDeliveryStatus = "sent",
  sentAt: Date | null = new Date(cutoff.getTime() - 1),
  channel = "email",
) {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO report_delivery_requests
       (id, user_id, idempotency_key, ticker, channel, contact, status,
        provider_message_id, sent_at, attempt_count)
     VALUES ($1::varchar, $2, $1::varchar, 'PETR4', $3, 'test@example.invalid', $4, $1::text, $5, 1)`,
    [id, userId, channel, status, sentAt],
  );
  return id;
}

describe("unconfirmed report delivery monitoring", () => {
  it("flags only old sent requests, preserves sending details and persists the alert", async () => {
    const old = await request();
    const boundary = await request("sent", cutoff, "whatsapp");
    const recent = await request("sent", new Date(cutoff.getTime() + 1));
    const missingTime = await request("sent", null);
    const finalDelivered = await request("delivered");
    const finalFailed = await request("failed");
    const pending = await request("pending");
    const flagged = await storage.flagUnconfirmedReportDeliveries(cutoff, 100);
    const ours = flagged.filter((item) => item.userId === userId);
    assert.deepEqual(new Set(ours.map((item) => item.id)), new Set([old, boundary]));
    for (const item of ours) {
      assert.equal(item.status, "sent");
      assert.equal(item.providerMessageId, item.id);
      assert.equal(item.attemptCount, 1);
      assert.ok(item.confirmationOverdueAt);
    }
    for (const id of [recent, missingTime, finalDelivered, finalFailed, pending]) {
      const item = await storage.getReportDeliveryRequest(userId, id);
      assert.equal(item?.confirmationOverdueAt, null);
    }
    assert.equal(
      (await storage.flagUnconfirmedReportDeliveries(cutoff, 100))
        .filter((item) => item.userId === userId).length,
      0,
    );
    assert.ok((await storage.getReportDeliveryRequest(userId, old))?.confirmationOverdueAt);
  });

  it("claims bounded batches once across simultaneous scans", async () => {
    const ids = new Set(await Promise.all(Array.from({ length: 5 }, () => request())));
    const batches = await Promise.all(Array.from({ length: 5 }, () =>
      storage.flagUnconfirmedReportDeliveries(cutoff, 2)));
    for (const batch of batches) assert.ok(batch.length <= 2);
    const claimed = batches.flat().filter((item) => ids.has(item.id));
    assert.equal(claimed.length, 5);
    assert.equal(new Set(claimed.map((item) => item.id)).size, 5);
  });

  it("allows a late confirmation but never changes final delivered or failed requests", async () => {
    for (const final of ["delivered", "failed"] as const) {
      const id = await request();
      await storage.flagUnconfirmedReportDeliveries(cutoff, 100);
      await storage.updateReportDeliveryStatusFromProvider({
        channel: "email", providerMessageId: id, status: final,
        errorCode: final === "failed" ? "EMAIL_BOUNCED" : null,
        errorMessage: final === "failed" ? "Rejected by provider" : null,
      });
      const completed = await storage.getReportDeliveryRequest(userId, id);
      assert.equal(completed?.status, final);
      assert.ok(completed?.confirmationOverdueAt); // Retain the historical alert.
      for (const status of ["sent", "delivered", "failed"] as const) {
        await storage.updateReportDeliveryStatusFromProvider({
          channel: "email", providerMessageId: id, status,
          errorCode: "SHOULD_NOT_OVERWRITE", errorMessage: "Duplicate event",
        });
        assert.deepEqual(await storage.getReportDeliveryRequest(userId, id), completed);
      }
      await storage.updateReportDeliveryRequest(id, { status: "sent" });
      assert.deepEqual(await storage.getReportDeliveryRequest(userId, id), completed);
      assert.equal((await storage.flagUnconfirmedReportDeliveries(cutoff, 100))
        .filter((item) => item.id === id).length, 0);
    }
  });

  it("records one observable warning per case without logging contact or report content", async () => {
    const id = await request();
    const flagged = (await storage.flagUnconfirmedReportDeliveries(cutoff, 100))
      .filter((item) => item.id === id);
    const scan = mock.method(storage, "flagUnconfirmedReportDeliveries", async () => flagged);
    const warning = mock.method(console, "warn", () => {});
    assert.equal(await reconcileUnconfirmedReportDeliveries(), 1);
    const args = scan.mock.calls[0].arguments;
    assert.equal(args[1], 100);
    assert.ok(Math.abs(args[0].getTime() - (Date.now() - 86_400_000)) < 1000);
    assert.deepEqual(warning.mock.calls[0].arguments, [
      "[report-delivery] confirmation overdue",
      { requestId: id, channel: "email", sentAt: flagged[0].sentAt,
        confirmationOverdueAt: flagged[0].confirmationOverdueAt },
    ]);
  });

  it("monitors past sends independently of per-report professional approval", async () => {
    const scan = mock.method(storage, "flagUnconfirmedReportDeliveries", async () => []);
    const claim = mock.method(storage, "claimReportDeliveryRequests", async () => []);
    const stop = startReportDeliveryWorker();
    stop();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(scan.mock.callCount(), 1);
    assert.equal(claim.mock.callCount(), 0);
  });

  it("propagates storage errors instead of reporting a successful scan", async () => {
    mock.method(storage, "flagUnconfirmedReportDeliveries", async () => {
      throw new Error("database unavailable");
    });
    await assert.rejects(reconcileUnconfirmedReportDeliveries(), /database unavailable/);
  });
});