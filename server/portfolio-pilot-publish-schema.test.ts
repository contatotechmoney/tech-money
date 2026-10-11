import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { Client } from "pg";
import { REAL_PORTFOLIO_PILOT_ENABLED } from "./portfolio-pilot";

// Never connect to workspace/production credentials. The wrapper owns this private
// Unix-socket-only cluster and removes it after validation. No production runner.
if (process.env.SYNTHETIC_DATABASE !== "1" ||
    !/^\/tmp\/invest-synthetic-[a-zA-Z0-9]+\/socket$/.test(process.env.PGHOST ?? "") ||
    process.env.PGUSER !== "synthetic" || process.env.PGPORT !== "6543" ||
    process.env.PGDATABASE !== "synthetic_invest") {
  throw new Error("Publish-schema tests require the disposable synthetic wrapper");
}
const record = JSON.parse(readFileSync("docs/evidence/portfolio-pilot-publish-diff.json", "utf8"));
const database = `pilot_publish_${randomUUID().replaceAll("-", "")}`;
const connection = { host: process.env.PGHOST, port: 6543, user: "synthetic" };
const admin = new Client({ ...connection, database: "synthetic_invest" });
const client = new Client({ ...connection, database });
const ownerSql = `INSERT INTO portfolio_pilot_owner_bindings
  (singleton,clerk_user_id,clerk_environment,evidence_digest,verification_method,verified_at)
  VALUES ($1,'synthetic_owner',$2,$3,$4,'2026-10-10T00:00:00Z')`;
const valid = [true, "production", "a".repeat(64), "official_clerk_owner_attestation"];

async function isolated(action: () => Promise<unknown>) {
  await client.query("SAVEPOINT synthetic_case");
  try { await action(); }
  finally {
    await client.query("ROLLBACK TO SAVEPOINT synthetic_case");
    await client.query("RELEASE SAVEPOINT synthetic_case");
  }
}
async function rejects(sql: string, params: unknown[], code: string) {
  await isolated(async () => {
    await assert.rejects(client.query(sql, params), (e: unknown) =>
      !!e && typeof e === "object" && "code" in e && e.code === code);
  });
}
before(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  await client.connect();
});
after(async () => {
  await client.query("ROLLBACK");
  await client.end();
  await admin.end();
  // No DROP or data-copy commands. The disposable cluster's owner cleans it up.
});

describe("exact official pilot publish migration, disposable database only", () => {
  it("captures the official statements unchanged, additive only, including their byte hashes", () => {
    for (const [statements, hash] of [
      [record.statementsToExecute, record.statementsSha256],
      [record.failedStatementsToExecute, record.failedStatementsSha256],
    ] as [string[], string][]) {
      assert.equal(createHash("sha256").update(JSON.stringify(statements)).digest("hex"), hash);
    }
    assert.equal(record.hasStructuralDataLoss, false);
    assert.equal(record.maybeNonBackwardsCompatible, false);
    for (const key of ["tablesToRemove", "tablesToTruncate", "columnsToRemove", "schemasToRemove", "matViewsToRemove"])
      assert.deepEqual(record[key], []);
    assert.equal(record.statementsToExecute.length, 4);
    assert.equal(record.statementsToExecute.filter((s: string) => s.startsWith("CREATE TABLE ")).length, 3);
    assert.equal(record.statementsToExecute.filter((s: string) => s.startsWith('ALTER TABLE "portfolio_pilot_audit" ADD CONSTRAINT ')).length, 1);
    assert.doesNotMatch(record.statementsToExecute.join("\n"),
      /(^|;)\s*(DROP|TRUNCATE|INSERT|UPDATE|DELETE|COPY)\b/im);
    assert.doesNotMatch(record.statementsToExecute.join("\n"), /CHECK\s*\(\s*CHECK/i);
  });
  it("reproduces syntax error 42601 from the exact original generated migration", async () => {
    await client.query("BEGIN");
    try {
      await assert.rejects(async () => {
        for (const sql of record.failedStatementsToExecute) await client.query(sql);
      }, (e: unknown) => !!e && typeof e === "object" && "code" in e && e.code === "42601");
    } finally { await client.query("ROLLBACK"); }
  });
  it("executes the four exact corrected statements in captured order without rewriting SQL", async () => {
    await client.query("BEGIN");
    for (const sql of record.statementsToExecute) await client.query(sql);
    const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
    assert.deepEqual(tables.rows.map(r => r.table_name),
      ["portfolio_pilot_accounts", "portfolio_pilot_audit", "portfolio_pilot_owner_bindings"]);
    const constraints = await client.query(`SELECT conname,pg_get_constraintdef(oid) AS def
      FROM pg_constraint WHERE conrelid='portfolio_pilot_owner_bindings'::regclass ORDER BY conname`);
    assert.equal(constraints.rows.length, 5);
    assert.match(constraints.rows.find(r => r.conname === "portfolio_pilot_owner_singleton_check")!.def,
      /CHECK \(\(singleton = true\)\)/);
  });
  it("rejects singleton=false, preserving at most one possible owner row", async () => {
    await rejects(ownerSql, [false, ...valid.slice(1)], "23514");
  });
  it("rejects singleton=NULL, not SQL three-valued check bypass", async () => {
    await rejects(ownerSql, [null, ...valid.slice(1)], "23502");
  });
  it("rejects a second owner even when the existing row was revoked", async () => {
    await isolated(async () => {
      await client.query(ownerSql, valid);
      await client.query("UPDATE portfolio_pilot_owner_bindings SET revoked_at=now()");
      await assert.rejects(client.query(ownerSql, valid), (e: unknown) =>
        !!e && typeof e === "object" && "code" in e && e.code === "23505");
    });
  });
  it("rejects unsupported environments and missing environments", async () => {
    await rejects(ownerSql, [true, "staging", ...valid.slice(2)], "23514");
    await rejects(ownerSql, [true, null, ...valid.slice(2)], "23502");
  });
  it("rejects short, long and missing verification evidence", async () => {
    for (const n of [63, 65])
      await rejects(ownerSql, [true, "production", "a".repeat(n), valid[3]], "23514");
    await rejects(ownerSql, [true, "production", null, valid[3]], "23502");
  });
  it("rejects browser diagnosis and generic approval as official verification methods", async () => {
    for (const method of ["browser_confirmation", "generic_owner_approval"])
      await rejects(ownerSql, [true, "production", valid[2], method], "23514");
  });
  it("allows only valid synthetic records for each supported environment and keeps the default singleton", async () => {
    for (const environment of ["development", "production"]) await isolated(async () => {
      const sql = `INSERT INTO portfolio_pilot_owner_bindings
        (clerk_user_id,clerk_environment,evidence_digest,verification_method,verified_at)
        VALUES ('synthetic_owner',$1,$2,$3,now()) RETURNING singleton,clerk_environment`;
      const r = await client.query(sql, [environment, valid[2], valid[3]]);
      assert.equal(r.rows[0].singleton, true);
      assert.equal(r.rows[0].clerk_environment, environment);
    });
  });
  it("keeps audit events linked to an existing account", async () => {
    await rejects("INSERT INTO portfolio_pilot_audit(user_id,event_index,event) VALUES ('missing_synthetic_account',0,'{}')", [], "23503");
  });
  it("rejects negative revisions", async () => {
    await rejects("INSERT INTO portfolio_pilot_accounts(user_id,revision) VALUES ('synthetic_owner',-1)", [], "23514");
  });
  it("rejects negative audit event indices", async () => {
    await isolated(async () => {
      await client.query("INSERT INTO portfolio_pilot_accounts(user_id) VALUES ('synthetic_owner')");
      await assert.rejects(client.query("INSERT INTO portfolio_pilot_audit(user_id,event_index,event) VALUES ('synthetic_owner',-1,'{}')"),
        (e: unknown) => !!e && typeof e === "object" && "code" in e && e.code === "23514");
    });
  });
  it("keeps account/event audit uniqueness", async () => {
    await isolated(async () => {
      await client.query("INSERT INTO portfolio_pilot_accounts(user_id) VALUES ('synthetic_owner')");
      const sql = "INSERT INTO portfolio_pilot_audit(user_id,event_index,event) VALUES ('synthetic_owner',0,'{}')";
      await client.query(sql);
      await assert.rejects(client.query(sql), (e: unknown) =>
        !!e && typeof e === "object" && "code" in e && e.code === "23505");
    });
  });
  it("keeps real execution globally disabled and the schema's explicit comparison", () => {
    assert.equal(REAL_PORTFOLIO_PILOT_ENABLED, false);
    assert.match(readFileSync("shared/schema.ts", "utf8"),
      /check\("portfolio_pilot_owner_singleton_check", sql`\$\{t\.singleton\} = true`\)/);
  });
  it("upgrades the historical development schema without changing synthetic account, audit or binding records", async () => {
    await client.query("ROLLBACK");
    await client.query("BEGIN");
    await client.query(readFileSync("migrations/0017_portfolio_pilot.sql", "utf8"));
    await client.query("INSERT INTO portfolio_pilot_accounts(user_id,state,revision) VALUES ('synthetic_owner','{\"synthetic_only\":true}',7)");
    await client.query("INSERT INTO portfolio_pilot_audit(user_id,event_index,event) VALUES ('synthetic_owner',0,'{\"synthetic_only\":true}')");
    await client.query(ownerSql, valid);
    const capture = async () => Promise.all([
      client.query("SELECT * FROM portfolio_pilot_accounts"),
      client.query("SELECT * FROM portfolio_pilot_audit"),
      client.query("SELECT * FROM portfolio_pilot_owner_bindings"),
    ]).then(r => r.map(q => q.rows));
    const original = await capture();
    await client.query(readFileSync("migrations/0018_portfolio_pilot_singleton_publish_compat.sql", "utf8"));
    assert.deepEqual(await capture(), original);
    await rejects(ownerSql, [false, ...valid.slice(1)], "23514");
  });
});
