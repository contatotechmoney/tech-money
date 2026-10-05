import express from "express";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AnalysisJob, AnalysisStore } from "./hermes-jobs";
import type { HermesConfig, HermesRun } from "./hermes-client";
import { registerHermesRoutes } from "./hermes-routes";

declare global { namespace Express { interface Request { userId?: string; } } }
export type FixtureScenario = "success" | "unknown_usage" | "truncated" | "budget_exhausted";
const scenarios: FixtureScenario[] = ["success", "unknown_usage", "truncated", "budget_exhausted"];

// Disposable wallet only. Production continues to use the PostgreSQL store.
export function createLocalFixture(scenario: FixtureScenario = "success", balance = 20) {
  const user = "offline-" + randomUUID();
  const jobs = new Map<string, AnalysisJob>();
  const prices = new Map<string, { credits: number; fingerprint: string }>();
  const runs = new Map<string, Promise<HermesRun>>();
  let available = balance, reserved = 0, executions = 0;
  let lastResult: Record<string, unknown> | null = null;
  const entries = [{kind: "grant", delta: balance, reason: "Saldo fictício inicial", jobId: null as string | null, createdAt: new Date().toISOString()}];
  const copy = <T,>(value: T): T => structuredClone(value);
  const store: AnalysisStore = {
    async ready() { return true; },
    async wallet(owner) { if(owner !== user) throw Error("UNKNOWN_OWNER"); return copy({available, reserved, entries}); },
    async list(owner) { return copy(Array.from(jobs.values()).filter(j => j.user_id === owner)); },
    async get(owner, id) { const job = jobs.get(id); return job?.user_id === owner ? copy(job) : null; },
    async reserve(owner, key, ticker, model, limit, globalLimit, globalConcurrent, price) {
      if(owner !== user) throw Error("UNKNOWN_OWNER");
      const old = Array.from(jobs.values()).find(j => j.idempotency_key === key);
      if(old) {
        if(old.ticker !== ticker || old.model_id !== model || prices.get(old.id)?.fingerprint !== price.executionFingerprint) throw Error("IDEMPOTENCY_CONFLICT");
        return copy(old);
      }
      if(Array.from(jobs.values()).some(j => j.status === "submitting" || j.status === "running")) throw Error("ANALYSIS_ACTIVE");
      if(jobs.size >= Math.min(limit, globalLimit)) throw Error("DAILY_LIMIT");
      if(globalConcurrent < 1) throw Error("GLOBAL_BUSY");
      if((jobs.size + 1) * price.maxCostMicroUsd > price.dailyBudgetMicroUsd) throw Error("FINANCIAL_BUDGET");
      if(available < price.credits) throw Error("INSUFFICIENT_CREDITS");
      const now = new Date().toISOString();
      const job: AnalysisJob = {id:randomUUID(),user_id:owner,idempotency_key:key,ticker,model_id:model,status:"submitting",run_id:null,output:null,runtime:null,created_at:now,updated_at:now};
      jobs.set(job.id, job); prices.set(job.id,{credits:price.credits,fingerprint:price.executionFingerprint});
      available -= price.credits; reserved += price.credits;
      entries.unshift({kind:"reserve",delta:-price.credits,reason:"Reserva fictícia",jobId:job.id,createdAt:now});
      return copy(job);
    },
    async attach(owner, id, runId) { const job=jobs.get(id); if(job?.user_id !== owner) throw Error("UNKNOWN_OWNER"); if(job.status === "submitting") {job.status="running";job.run_id=runId;} },
    async update(owner,id,result) {
      const job=jobs.get(id); if(job?.user_id !== owner) throw Error("UNKNOWN_OWNER");
      if(job.status !== "running") return;
      Object.assign(job,result,{updated_at:new Date().toISOString()});
      if(result.status === "running") return;
      const credits=prices.get(id)!.credits; reserved-=credits;
      if(result.status === "failed") available+=credits;
      entries.unshift({kind:result.status === "failed" ? "refund" : "consume",delta:result.status === "failed" ? credits : 0,reason:"Liquidação fictícia",jobId:id,createdAt:job.updated_at});
    },
  };
  const config: HermesConfig = {url:"https://offline.invalid",key:"offline-fixture-only",models:[{id:"deepseek-fixture",label:"DeepSeek V4.1 Flash · simulado",provider:"offline-fixture",model:"synthetic-only",credits:2,maxCostMicroUsd:1000}],tickers:["BBDC3","BBAS3"],users:[user],dailyLimit:10,globalLimit:10,globalConcurrent:1,dailyBudgetMicroUsd:10000};
  async function execute(): Promise<HermesRun> {
    const folder=await mkdtemp(path.join(tmpdir(),"committee-local-"));
    try {
      const {stdout}=await promisify(execFile)("python3",["executor/b3/simulation_cli.py","--offline-fixture",path.join(folder,"budget.sqlite"),scenario],{cwd:process.cwd(),timeout:10000,maxBuffer:64000,env:{PATH:process.env.PATH,PYTHONDONTWRITEBYTECODE:"1"}});
      const result=JSON.parse(stdout);
      if(result.simulation !== true || result.live_enabled !== false || result.network_calls !== 0 || result.portal_wallet_connected !== false) throw Error("INVALID_FIXTURE");
      lastResult=result;
      const runtime={provider:"offline-fixture",model:"synthetic-only"};
      if(result.outcome === "USAGE_UNVERIFIED") return {status:"running",output:null,runtime};
      if(result.outcome === "simulated_complete" && result.settled_responses === 21) return {status:"completed",output:"SIMULAÇÃO: 21 etapas fictícias executadas pelo Python. Nenhuma chamada a LLM. Este resultado não é uma análise financeira.",runtime};
      if(["incomplete_response","COST_LIMIT"].includes(result.outcome)) return {status:"failed",output:null,runtime};
      throw Error("UNKNOWN_FIXTURE_OUTCOME");
    } catch { return {status:"running",output:null,runtime:{provider:"offline-fixture",model:"uncertain"}}; }
    finally { await rm(folder,{recursive:true,force:true}); }
  }
  const client = {
    async start(id: string) {
      if(!jobs.has(id) || reserved < prices.get(id)!.credits) throw Error("RESERVATION_REQUIRED");
      if(!runs.has(id)) {executions++;runs.set(id,execute());}
      return id;
    },
    async poll(id: string) { const run=runs.get(id); if(!run) throw Error("UNKNOWN_RUN"); return run; },
  };
  return {store,config,client,diagnostics:()=>copy({simulation:true,scenario,executions,lastResult})};
}

export function createLocalCommitteeApp() {
  const app=express();app.use(express.json({limit:"4kb"}));
  // Loopback demo, fixed synthetic identity, no credentials or client-selected owner.
  app.use((req,res,next)=>{
    if(req.get("X-Committee-Demo") !== "offline-only" || (req.get("origin") && req.get("origin") !== "http://127.0.0.1:19622")) return res.status(403).json({error:"Acesso restrito ao teste local."});
    next();
  });
  function session(scenario: FixtureScenario = "success") {
    const fixture=createLocalFixture(scenario), routes=express();
    registerHermesRoutes(routes,(req,_res,next)=>{req.userId=fixture.config.users[0];next();},{config:()=>fixture.config,store:fixture.store,client:fixture.client});
    return {fixture,routes};
  }
  let current=session();
  app.post("/reset",(req,res)=>{
    if(!scenarios.includes(req.body.scenario)) return res.status(400).json({error:"Cenário inválido."});
    current=session(req.body.scenario);res.json({simulation:true});
  });
  app.get("/diagnostics",(_req,res)=>res.json(current.fixture.diagnostics()));
  app.use((req,res,next)=>current.routes(req,res,next));
  return app;
}
