import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import type { Server } from "node:http";
import { after, afterEach, describe, it } from "node:test";
import { Pool } from "pg";
import { registerHermesRoutes, analysisPriceVersion } from "./hermes-routes";
import { analysisStore, closeHermesJobs } from "./hermes-jobs";
import { grantAnalysisCredits, walletSnapshot } from "./analysis-wallet";
import type { HermesConfig, HermesModel, HermesRun } from "./hermes-client";

declare global { namespace Express { interface Request { userId?: string; } } }

if (process.env.SYNTHETIC_DATABASE !== "1" || !process.env.DATABASE_URL?.startsWith("postgresql://synthetic@/synthetic_invest?host=/tmp/invest-synthetic-"))
  throw Error("Disposable synthetic PostgreSQL required; never run against a client database.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const config: HermesConfig = { url: "https://offline.invalid", key: "test-fixture-only", models: [{id:"fixture",label:"Modelo simulado — sem tarifa real",provider:"nous",model:"synthetic-deepseek-test",credits:2,maxCostMicroUsd:1000}],tickers:["BBDC3"],users:[],dailyLimit:100,globalLimit:1000,globalConcurrent:10,dailyBudgetMicroUsd:1000000 };
const servers: Server[] = [], folders: string[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s=>new Promise<void>(resolve=>s.close(()=>resolve())))); });
after(async () => { await pool.end(); await closeHermesJobs(); await Promise.all(folders.map(f=>rm(f,{recursive:true,force:true}))); });

type Scenario = "success" | "unknown_usage" | "truncated" | "budget_exhausted";
class OfflineFixtureClient {
  executions = 0; polls = 0;
  private runs = new Map<string, Promise<HermesRun>>();
  constructor(private user: string, private scenario: Scenario) {}
  async start(id: string, ticker: string, model: HermesModel) {
    assert.equal(ticker,"BBDC3"); assert.equal(model.model, "synthetic-deepseek-test");
    const wallet = await walletSnapshot(pool, this.user);
    assert.equal(wallet.reserved,2); // Real PostgreSQL reservation MUST precede executor work.
    if (!this.runs.has(id)) {
      this.executions++;
      this.runs.set(id, this.execute());
    }
    await this.runs.get(id);
    return id;
  }
  private async execute(): Promise<HermesRun> {
    const folder = await mkdtemp(path.join(tmpdir(),"committee-offline-")); folders.push(folder);
    const { stdout } = await promisify(execFile)("python3",["executor/b3/simulation_cli.py","--offline-fixture",path.join(folder,"budget.sqlite"),this.scenario],{
      cwd:process.cwd(),timeout:10000,maxBuffer:64000,env:{ PATH:process.env.PATH, PYTHONDONTWRITEBYTECODE:"1" },
    });
    const result = JSON.parse(stdout);
    assert.equal(result.live_enabled,false); assert.equal(result.network_calls,0);
    assert.equal(result.portal_wallet_connected,false); // Direct linkage is this test harness only.
    const runtime={provider:"nous",model:"synthetic-deepseek-test"};
    if (result.outcome === "USAGE_UNVERIFIED") return {status:"running",output:null,runtime};
    if (result.outcome !== "simulated_complete") return {status:"failed",output:null,runtime};
    assert.equal(result.settled_responses,21);
    return {status:"completed",output:"SIMULAÇÃO: 21 etapas fictícias concluídas. Não é análise financeira.",runtime};
  }
  async poll(id: string) { this.polls++; const result=this.runs.get(id); if(!result)throw Error("Unknown fixture run");return result; }
}
async function fixture(scenario: Scenario="success",funded=true) {
  const user="bridge-fixture-"+randomUUID();
  if(funded)await grantAnalysisCredits(pool,user,2,randomUUID(),"Disposable simulation fixture");
  const current={...config,users:[user]}; const client=new OfflineFixtureClient(user,scenario);
  const app=express();app.use(express.json());
  registerHermesRoutes(app,(req,_res,next)=>{req.userId=user;next();},{store:analysisStore,client,config:()=>current});
  const server=app.listen(0,"127.0.0.1");servers.push(server);await new Promise<void>(resolve=>server.once("listening",resolve));
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const key=randomUUID();
  const body={ticker:"BBDC3",modelId:"fixture",idempotencyKey:key,confirmedCredits:2,priceVersion:analysisPriceVersion(current,current.models[0])};
  const send=(input: unknown=body)=>fetch(url+"/api/investments/analyses",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
  return {user,client,url,body,send};
}
describe("portal → offline Python executor → real disposable credit ledger",()=>{
  it("reserves before executor work and consumes once after the 21-step simulation",async()=>{
    const f=await fixture();const job=await(await f.send()).json();assert.equal(job.status,"running");
    assert.equal((await walletSnapshot(pool,f.user)).reserved,2);
    const result=await(await fetch(f.url+`/api/investments/analyses/${job.id}`)).json();
    assert.equal(result.status,"completed");assert.equal(result.professionalReview,"pending");assert.match(result.output,/SIMULAÇÃO/);
    await fetch(f.url+`/api/investments/analyses/${job.id}`);await f.send();
    const wallet=await walletSnapshot(pool,f.user);assert.equal(wallet.available,0);assert.equal(wallet.reserved,0);
    assert.equal(wallet.entries.filter(e=>e.kind==="consume").length,1);assert.equal(f.client.executions,1);
  });
  it("missing consent and altered price start nothing and debit nothing",async()=>{
    const f=await fixture();const {confirmedCredits,priceVersion,...unconfirmed}=f.body;
    assert.equal((await f.send(unconfirmed)).status,400);
    assert.equal((await f.send({...f.body,confirmedCredits:1})).status,409);
    assert.equal((await f.send({...f.body,priceVersion:"0".repeat(64)})).status,409);
    assert.equal(f.client.executions,0);assert.equal((await walletSnapshot(pool,f.user)).available,2);
    assert.deepEqual(await analysisStore.list(f.user),[]);
  });
  it("insufficient credits prevent even the simulated executor from starting",async()=>{
    const f=await fixture("success",false);assert.equal((await f.send()).status,402);
    assert.equal(f.client.executions,0);assert.deepEqual(await analysisStore.list(f.user),[]);
  });
  it("unknown usage retains credits and prevents another analysis",async()=>{
    const f=await fixture("unknown_usage");const job=await(await f.send()).json();
    const result=await(await fetch(f.url+`/api/investments/analyses/${job.id}`)).json();assert.equal(result.status,"running");
    const wallet=await walletSnapshot(pool,f.user);assert.equal(wallet.available,0);assert.equal(wallet.reserved,2);
    assert.equal((await f.send({...f.body,idempotencyKey:randomUUID()})).status,409);
    assert.equal(f.client.executions,1);
  });
  for(const scenario of ["truncated","budget_exhausted"] as const)it(`${scenario} refunds exactly once without delivering a completed report`,async()=>{
    const f=await fixture(scenario);const job=await(await f.send()).json();
    const result=await(await fetch(f.url+`/api/investments/analyses/${job.id}`)).json();assert.equal(result.status,"failed");assert.equal(result.output,null);
    await fetch(f.url+`/api/investments/analyses/${job.id}`);
    const wallet=await walletSnapshot(pool,f.user);assert.equal(wallet.available,2);assert.equal(wallet.reserved,0);
    assert.equal(wallet.entries.filter(e=>e.kind==="refund").length,1);
  });
});
