import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { portfolioSimulationStore } from "./portfolio-simulation";
import { PORTFOLIO_DEMO_VERSION, presentPortfolioStudy } from "../shared/portfolio-simulation";
import { closeStorage, pool } from "./storage";

const synthetic = process.env.SYNTHETIC_DATABASE === "1";
const alpha = `portfolio-synthetic-${randomUUID()}`, beta = `portfolio-synthetic-${randomUUID()}`;
before(() => { if (!synthetic) throw Error("This DB suite requires the isolated synthetic validation script."); });
after(async () => { await closeStorage(); });

describe("portfolio simulation durable repository, isolated PostgreSQL", () => {
  it("has the dedicated additive table and no real-finance payload columns", async () => {
    const result = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='portfolio_simulation_studies' ORDER BY ordinal_position");
    assert.deepEqual(result.rows.map(row => row.column_name), ["id", "user_id", "request_key", "scenario_version", "created_at"]);
  });
  it("persists idempotently across repository calls while isolating identical keys by account", async () => {
    const key = randomUUID();
    const row = await portfolioSimulationStore.create(alpha, key);
    const retry = await portfolioSimulationStore.create(alpha, key);
    assert.equal(retry.id, row.id);
    assert.equal(row.scenario_version, PORTFOLIO_DEMO_VERSION);
    assert.equal((await portfolioSimulationStore.list(alpha))[0].id, row.id);
    assert.equal((await portfolioSimulationStore.get(alpha, row.id))!.id, row.id);
    assert.equal(await portfolioSimulationStore.get(beta, row.id), null);
    assert.deepEqual(await portfolioSimulationStore.list(beta), []);
    const other = await portfolioSimulationStore.create(beta, key);
    assert.notEqual(other.id, row.id);
    assert.equal(await portfolioSimulationStore.get(alpha, other.id), null);
  });
  it("enforces active limits without changing persistent progress or debiting anything", async () => {
    await assert.rejects(portfolioSimulationStore.create(alpha, randomUUID()), /PORTFOLIO_SIMULATION_ACTIVE/);
    const row = (await portfolioSimulationStore.list(alpha))[0];
    const before = row.created_at;
    const completed = presentPortfolioStudy(row, new Date(row.created_at).getTime() + 12000);
    assert.equal(completed.completedAgents, 6);
    const reloaded = (await portfolioSimulationStore.get(alpha, row.id))!;
    assert.equal(new Date(reloaded.created_at).getTime(), new Date(before).getTime());
    assert.equal(presentPortfolioStudy(reloaded, new Date(reloaded.created_at).getTime() + 12000).synthesis, completed.synthesis);
  });
  it("rejects unsupported scenario versions at the database boundary", async () => {
    await assert.rejects(pool.query(
      "INSERT INTO portfolio_simulation_studies(user_id,request_key,scenario_version) VALUES($1,$2,'unknown')",
      [alpha, randomUUID()]), (error: unknown) => (error as { code: string }).code === "23514");
  });
  it("enforces daily limits in the repository, with only synthetic fixtures", async () => {
    const owner = `portfolio-limit-${randomUUID()}`;
    await pool.query(
      `INSERT INTO portfolio_simulation_studies(user_id,request_key,scenario_version,created_at)
       SELECT $1,gen_random_uuid(),'portfolio-demo-v1',now()-interval '1 hour' FROM generate_series(1,30)`, [owner]);
    await assert.rejects(portfolioSimulationStore.create(owner, randomUUID()), /PORTFOLIO_SIMULATION_LIMIT/);
    assert.equal((await portfolioSimulationStore.list(owner)).length, 30);
  });
});
