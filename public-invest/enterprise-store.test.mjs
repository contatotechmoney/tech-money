import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { adminRequest } from "./admin.mjs";
import { enterpriseQueue, enterpriseStore } from "./enterprise-store.mjs";
import { interestRequest } from "./intake.mjs";
import { deliverPending } from "./notifications.mjs";

test("enterprise intake records private details and queues only one fixed Telegram notice", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec(readFileSync(new URL("./enterprise-migrations/0001_requests.sql", import.meta.url), "utf8"));
  const adapter = {
    prepare(sql, values = []) {
      const run = () => {
        const statement = database.prepare(sql);
        return sql.includes("?1")
          ? statement.all(Object.fromEntries(values.map((value, i) => [String(i + 1), value])))
          : statement.all(...values);
      };
      return { bind: (...input) => adapter.prepare(sql, input), all: () => ({ results: run() }),
        first: () => run()[0] ?? null, run };
    },
    async batch(statements) {
      database.exec("BEGIN");
      try {
        const result = statements.map(statement => statement.all());
        database.exec("COMMIT");
        return result;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const origin = "https://interest.example.invalid";
  let sent = 0;
  const env = {
    INTEREST_ORIGIN: origin,
    INVEST_ENTERPRISE_REQUESTS: adapter,
    INVEST_NOTIFICATIONS: { async notifyInvest(testMode, ...details) {
      assert.equal(testMode, false);
      assert.deepEqual(details, []);
      sent++;
      return { delivered: true };
    } },
  };
  const sample = {
    name: "Pessoa de teste", email: "empresa@example.invalid", interest: "empresarial", companyName: "Empresa de teste",
    teamSize: "6-20", enterpriseGoal: "Avaliar fluxo da equipe", contactConsent: true, marketingOptIn: false, website: "",
  };
  const submit = data => interestRequest(new Request(origin + "/api/interesse", {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(data),
  }), env, { capture: (parsed, _request, config) => enterpriseStore.capture(parsed, "test-bucket", config) });
  const list = () => new Request(origin + "/api/admin/interessados?tipo=empresarial&q=Empresa");

  try {
    assert.equal((await submit({ ...sample, teamSize: "invalid" })).status, 400);
    assert.equal((await submit({ ...sample, marketingOptIn: true })).status, 400);
    assert.equal((await submit(sample)).status, 202);
    assert.equal((await submit(sample)).status, 202);
    assert.equal((await adminRequest(list(), env, enterpriseStore, null)).status, 403);
    const identity = { subject: "owner-test" };
    const result = await (await adminRequest(list(), env, enterpriseStore, identity)).json();
    assert.equal(result.total, 1);
    const [row] = result.contacts;
    assert.equal(row.interest, "empresarial");
    assert.equal(row.company_name, sample.companyName);
    assert.equal(row.team_size, sample.teamSize);
    assert.equal(row.enterprise_goal, sample.enterpriseGoal);
    assert.equal(await enterpriseStore.update({ id: row.id, version: row.version, status: "contatado", notes: "" }, identity, env), true);
    assert.equal(database.prepare("SELECT count(*) AS count FROM enterprise_audit").get().count, 1);
    assert.deepEqual(await deliverPending(env, enterpriseQueue), { delivered: 1, failed: 0 });
    assert.deepEqual(await deliverPending(env, enterpriseQueue), { delivered: 0, failed: 0 });
    assert.equal(sent, 1);
    assert.notEqual(database.prepare("SELECT sent_at FROM enterprise_notices").get().sent_at, null);
  } finally {
    database.close();
  }
});
