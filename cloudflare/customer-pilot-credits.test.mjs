import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { pilotCredits, pilotCreditsPath } from "./customer-pilot-credits.mjs";

test("pilot credits persist per identity, reject overdrafts and deduplicate retries", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(await readFile(new URL("./pilot-credit-migrations/0001_credit_events.sql", import.meta.url), "utf8"));
  const database = {
    prepare(sql) {
      return { bind(...values) {
        return { all() {
          const statement = sqlite.prepare(sql);
          const results = sql.includes("?1")
            ? statement.all(Object.fromEntries(values.map((value, index) => [String(index + 1), value])))
            : statement.all(...values);
          return { results };
        } };
      } };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map(statement => statement.all());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const origin = "https://pilot.example.workers.dev";
  const issuer = "https://pilot-example.cloudflareaccess.com";
  const wallet = (event, subject = "invited-user", requestOrigin = origin) => pilotCredits(new Request(origin + pilotCreditsPath,
    event ? { method: "POST", headers: { Origin: requestOrigin, "Content-Type": "application/json" }, body: JSON.stringify(event) } : {}),
  { database, origin, issuer, subject }, (body, status = 200) => Response.json(body, { status }));
  const analysis = { id: crypto.randomUUID(), type: "spend", credits: 1, usage: { kind: "analysis", ticker: "HORIZ3" } };

  try {
    assert.equal((await (await wallet()).json()).wallet.prepaid, 100);
    assert.equal((await wallet(analysis, "invited-user", "https://example.invalid")).status, 403);
    const recorded = (await (await wallet(analysis)).json()).wallet;
    assert.equal(recorded.prepaid, 80);
    assert.equal(recorded.entries[0].credits, 20);
    assert.match(recorded.entries[0].recordedAt, /Z$/);
    assert.equal((await (await wallet(analysis)).json()).wallet.entries.length, 1);
    assert.equal((await wallet({ ...analysis, usage: { kind: "analysis", ticker: "EXEMP3" } })).status, 409);
    const fresh = (await (await wallet()).json()).wallet;
    assert.equal(fresh.prepaid, 80);
    assert.equal(fresh.entries[0].label, "Análise de HORIZ3");
    assert.deepEqual((await (await wallet(undefined, "another-account")).json()).wallet.entries, []);

    const oversized = { id: crypto.randomUUID(), type: "spend", usage: { kind: "combined", units: {
      analysis: 5, voiceMinute: 0, monitorCompanyMonth: 0,
    } } };
    assert.equal((await wallet(oversized)).status, 409);
    assert.equal((await wallet({ id: crypto.randomUUID(), type: "load", offerId: "essencial" })).status, 200);
    const fromMonthly = (await (await wallet({ ...analysis, id: crypto.randomUUID() })).json()).wallet;
    assert.equal(fromMonthly.monthly, 380);
    assert.equal(fromMonthly.prepaid, 80);
    const topUp = { id: crypto.randomUUID(), type: "load", offerId: "avulso" };
    assert.equal((await (await wallet(topUp)).json()).wallet.prepaid, 180);
    assert.equal((await (await wallet(topUp)).json()).wallet.prepaid, 180);

    const otherDebit = id => wallet({ id, type: "spend", usage: { kind: "combined", units: {
      analysis: 3, voiceMinute: 0, monitorCompanyMonth: 0,
    } } }, "another-account");
    const competing = await Promise.all([otherDebit(crypto.randomUUID()), otherDebit(crypto.randomUUID())]);
    assert.deepEqual(competing.map(response => response.status).sort(), [200, 409]);
    assert.equal((await (await wallet(undefined, "another-account")).json()).wallet.prepaid, 40);
  } finally {
    sqlite.close();
  }
});
