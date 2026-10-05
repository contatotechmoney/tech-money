import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createLocalCommitteeApp, createLocalFixture, type FixtureScenario} from "./committee-local-fixture";
import {analysisPriceVersion} from "./hermes-routes";

for(const scenario of ["success","truncated","budget_exhausted","unknown_usage"] as FixtureScenario[]) test(`HTTP and Python offline: ${scenario}`,async()=>{
  const app=createLocalCommitteeApp(), server=app.listen(0,"127.0.0.1");
  await new Promise<void>(r=>server.once("listening",r));
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  async function send(route:string,body?:unknown,headers:Record<string,string>={"X-Committee-Demo":"offline-only"}) {return fetch(url+route,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json",...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});}
  try {
    assert.equal((await send("/diagnostics",undefined,{})).status,403);
    assert.equal((await send("/diagnostics",undefined,{"X-Committee-Demo":"offline-only",Origin:"https://evil.invalid"})).status,403);
    assert.equal((await send("/reset",{scenario})).status,200);
    const options=await (await send("/api/investments/analysis-options")).json(),model=options.models[0];
    const payload={ticker:"BBDC3",modelId:model.id,idempotencyKey:randomUUID(),confirmedCredits:model.credits,priceVersion:model.priceVersion};
    assert.equal((await send("/api/investments/analyses",{...payload,confirmedCredits:1})).status,409);
    assert.equal((await (await send("/diagnostics")).json()).executions,0);
    const response=await send("/api/investments/analyses",payload);assert.equal(response.status,202);
    const job=await response.json();
    assert.equal((await (await send("/api/investments/credits")).json()).reserved,2);
    const duplicate=await (await send("/api/investments/analyses",payload)).json();assert.equal(duplicate.id,job.id);
    const result=await (await send("/api/investments/analyses/"+job.id)).json();
    assert.equal(result.status,scenario==="success"?"completed":scenario==="unknown_usage"?"running":"failed");
    await send("/api/investments/analyses/"+job.id);
    const wallet=await (await send("/api/investments/credits")).json();
    assert.equal(wallet.available,["success","unknown_usage"].includes(scenario)?18:20);
    assert.equal(wallet.reserved,scenario==="unknown_usage"?2:0);
    assert.equal(wallet.entries.filter((e:{kind:string})=>e.kind==="reserve").length,1);
    const diagnostics=await (await send("/diagnostics")).json();
    assert.equal(diagnostics.executions,1);assert.equal(diagnostics.lastResult.network_calls,0);assert.equal(diagnostics.lastResult.live_enabled,false);
    if(scenario==="success") assert.equal(diagnostics.lastResult.settled_responses,21);
    if(scenario==="unknown_usage") assert.equal((await send("/api/investments/analyses",{...payload,idempotencyKey:randomUUID()})).status,409);
  } finally {server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
test("isolated owner and insufficient balance never start the executor",async()=>{
  const fixture=createLocalFixture("success",0), model=fixture.config.models[0];
  await assert.rejects(fixture.store.reserve(fixture.config.users[0],randomUUID(),"BBDC3",model.id,10,10,1,{credits:2,maxCostMicroUsd:1000,dailyBudgetMicroUsd:10000,executionFingerprint:analysisPriceVersion(fixture.config,model)}),/INSUFFICIENT_CREDITS/);
  assert.equal(await fixture.store.get("other-user",randomUUID()),null);
  assert.equal(fixture.diagnostics().executions,0);
});
