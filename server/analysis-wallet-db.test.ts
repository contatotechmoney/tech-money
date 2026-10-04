import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { analysisStore, closeHermesJobs } from "./hermes-jobs";
import { grantAnalysisCredits, walletSnapshot, type AnalysisPrice } from "./analysis-wallet";

if (process.env.SYNTHETIC_DATABASE !== "1"
  || !process.env.DATABASE_URL?.startsWith("postgresql://synthetic@/synthetic_invest?host=/tmp/invest-synthetic-"))
  throw Error("Use npm run validate:synthetic with a disposable synthetic database.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const price: AnalysisPrice = { credits: 2, maxCostMicroUsd: 100, dailyBudgetMicroUsd: 1000000, executionFingerprint: "a".repeat(64) };
const owner = () => `wallet-test-${randomUUID()}`;
const reserve = (user: string, key = randomUUID(), cost = price) => analysisStore.reserve(user,key,"BBDC3","approved",100,1000,10,cost);
async function fund(user: string, credits = 2) { await grantAnalysisCredits(pool,user,credits,randomUUID(),"Synthetic fixture"); }
async function finish(user: string, id: string, status: "completed" | "failed") {
  await analysisStore.attach(user,id,`run-${id}`);
  await analysisStore.update(user,id,{status,output: status === "completed" ? "Synthetic informational study" : null,runtime: null});
}
after(async () => { await pool.end(); await closeHermesJobs(); });
describe("atomic analysis wallet on disposable PostgreSQL", () => {
  it("rejects unfunded and invalid-price requests without creating jobs", async () => {
    const user = owner();
    await assert.rejects(reserve(user),/INSUFFICIENT_CREDITS/);
    await assert.rejects(reserve(user,randomUUID(),{...price,credits: 0}),/INVALID_ANALYSIS_PRICE/);
    assert.deepEqual(await analysisStore.list(user),[]);
    assert.equal((await walletSnapshot(pool,user)).available,0);
  });
  it("deduplicates concurrent funding and rejects altered payment events", async () => {
    const user=owner(), event=randomUUID();
    const result=await Promise.all([1,2,3].map(() => grantAnalysisCredits(pool,user,2,event,"Synthetic fixture")));
    assert.equal(result.filter(Boolean).length,1);
    assert.equal((await walletSnapshot(pool,user)).available,2);
    await assert.rejects(grantAnalysisCredits(pool,user,4,event,"Synthetic fixture"),/CREDIT_EVENT_CONFLICT/);
  });
  it("serializes competing requests without spending the same credits twice", async () => {
    const user=owner(); await fund(user);
    const result=await Promise.allSettled([reserve(user),reserve(user)]);
    assert.equal(result.filter(r => r.status === "fulfilled").length,1);
    assert.equal((await analysisStore.list(user)).length,1);
    const snapshot=await walletSnapshot(pool,user);
    assert.equal(snapshot.available,0); assert.equal(snapshot.reserved,2);
    await finish(user,(await analysisStore.list(user))[0].id,"failed");
  });
  it("replays the same request without another charge and rejects changed input", async () => {
    const user=owner(),key=randomUUID(); await fund(user);
    const first=await reserve(user,key), again=await reserve(user,key);
    assert.equal(first.id,again.id);
    assert.equal((await walletSnapshot(pool,user)).entries.filter(e=>e.kind === "reserve").length,1);
    await assert.rejects(analysisStore.reserve(user,key,"BBAS3","approved",100,1000,10,price),/IDEMPOTENCY_CONFLICT/);
    await assert.rejects(reserve(user,key,{...price,executionFingerprint:"b".repeat(64)}),/IDEMPOTENCY_CONFLICT/);
    await finish(user,first.id,"failed");
  });
  it("uncertain submission retains its reservation; confirmed failure refunds exactly once", async () => {
    const user=owner(); await fund(user); const job=await reserve(user);
    assert.equal((await walletSnapshot(pool,user)).reserved,2);
    await finish(user,job.id,"failed");
    await analysisStore.update(user,job.id,{status:"failed",output:null,runtime:null});
    await analysisStore.update(user,job.id,{status:"completed",output:"Late contradictory output",runtime:null});
    const snapshot=await walletSnapshot(pool,user);
    assert.equal(snapshot.available,2); assert.equal(snapshot.reserved,0);
    assert.equal(snapshot.entries.filter(e=>e.kind === "refund").length,1);
    assert.equal((await analysisStore.get(user,job.id))?.status,"failed");
  });
  it("completion consumes once, keeps ownership private and never refunds on a late failure", async () => {
    const user=owner(),other=owner(); await fund(user); const job=await reserve(user);
    await finish(user,job.id,"completed");
    await analysisStore.update(user,job.id,{status:"failed",output:null,runtime:null});
    const snapshot=await walletSnapshot(pool,user);
    assert.equal(snapshot.available,0); assert.equal(snapshot.reserved,0);
    assert.equal(snapshot.entries.filter(e=>e.kind === "consume").length,1);
    assert.equal(snapshot.entries.filter(e=>e.kind === "refund").length,0);
    assert.equal(await analysisStore.get(other,job.id),null);
    assert.deepEqual((await walletSnapshot(pool,other)).entries,[]);
  });
  it("history cannot be edited or deleted", async () => {
    const user=owner(); await fund(user);
    await assert.rejects(pool.query("UPDATE analysis_credit_entries SET delta=100 WHERE user_id=$1",[user]),/append-only/);
    await assert.rejects(pool.query("DELETE FROM analysis_credit_entries WHERE user_id=$1",[user]),/append-only/);
    assert.equal((await walletSnapshot(pool,user)).available,2);
  });
  it("global financial reservation serializes different users, including old active runs", async () => {
    const held=Number((await pool.query("SELECT coalesce(sum(cost_ceiling_micro_usd),0) AS held FROM hermes_analysis_jobs")).rows[0].held);
    const cost={...price,dailyBudgetMicroUsd:held+price.maxCostMicroUsd};
    const users=[owner(),owner()]; await Promise.all(users.map(u=>fund(u)));
    const result=await Promise.allSettled(users.map(u=>reserve(u,randomUUID(),cost)));
    assert.equal(result.filter(r=>r.status === "fulfilled").length,1);
    const rejected=result.find(r=>r.status === "rejected") as PromiseRejectedResult;
    assert.match(rejected.reason.message,/FINANCIAL_BUDGET/);
    const success=result.findIndex(r=>r.status === "fulfilled");
    const job=(result[success] as PromiseFulfilledResult<Awaited<ReturnType<typeof reserve>>>).value;
    await pool.query("UPDATE hermes_analysis_jobs SET created_at=now()-interval '48 hours',updated_at=now()-interval '48 hours' WHERE id=$1",[job.id]);
    await assert.rejects(reserve(users[1-success],randomUUID(),cost),/FINANCIAL_BUDGET/);
    await finish(users[success],job.id,"failed");
    // Even after settlement a long run remains budgeted for 24h from its latest update.
    await assert.rejects(reserve(users[1-success],randomUUID(),cost),/FINANCIAL_BUDGET/);
  });
});
