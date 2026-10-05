import {test} from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {randomUUID} from "node:crypto";
import {registerAuthenticatedSimulation,simulationUsers} from "./committee-authenticated-simulation";

test("simulation is disabled by default and always disabled in production",()=>{
  assert.deepEqual(simulationUsers({}),[]);
  assert.deepEqual(simulationUsers({NODE_ENV:"production",COMMITTEE_AUTH_SIMULATION:"offline-only",COMMITTEE_SIMULATION_USERS:"user_Alpha"}),[]);
  assert.deepEqual(simulationUsers({NODE_ENV:"development",COMMITTEE_AUTH_SIMULATION:"true",COMMITTEE_SIMULATION_USERS:"user_Alpha"}),[]);
  assert.deepEqual(simulationUsers({NODE_ENV:"development",COMMITTEE_AUTH_SIMULATION:"offline-only",COMMITTEE_SIMULATION_USERS:"*"}),[]);
});
test("authenticated identity selects a separate wallet and cannot read another job",async()=>{
  const app=express();app.use(express.json());
  // Test double for verified auth, not a substitute for Clerk in the application.
  registerAuthenticatedSimulation(app,(req,res,next)=>{const user=req.get("x-test-verified-user");if(!user)return res.status(401).end();req.userId=user;next();},{NODE_ENV:"development",COMMITTEE_AUTH_SIMULATION:"offline-only",COMMITTEE_SIMULATION_USERS:"user_Alpha,user_Beta"});
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(r=>server.once("listening",r));
  const prefix=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/investments/simulation`;
  async function send(owner:string|undefined,path:string,body?:unknown) {return fetch(prefix+path,{method:body?"POST":"GET",headers:{"Content-Type":"application/json",...(owner?{"x-test-verified-user":owner}:{})},...(body?{body:JSON.stringify(body)}:{})});}
  try {
    assert.equal((await send(undefined,"/api/investments/credits")).status,401);
    assert.equal((await send("user_Unlisted","/api/investments/credits")).status,403);
    assert.equal((await send("user_Alpha","/reset",{scenario:"success"})).status,404);
    const options=await (await send("user_Alpha","/api/investments/analysis-options")).json(),model=options.models[0];
    const payload={ticker:"BBDC3",modelId:model.id,idempotencyKey:randomUUID(),confirmedCredits:2,priceVersion:model.priceVersion};
    assert.equal((await send("user_Alpha","/api/investments/analyses",{...payload,userId:"user_Beta"})).status,400);
    const job=await (await send("user_Alpha","/api/investments/analyses",payload)).json();
    assert.equal((await send("user_Beta","/api/investments/analyses/"+job.id)).status,404);
    const beta=await (await send("user_Beta","/api/investments/credits")).json();assert.equal(beta.available,20);assert.equal(beta.reserved,0);
    const finished=await (await send("user_Alpha","/api/investments/analyses/"+job.id)).json();assert.equal(finished.status,"completed");
    const alpha=await (await send("user_Alpha","/api/investments/credits")).json();assert.equal(alpha.available,18);assert.equal(alpha.reserved,0);
    assert.equal((await (await send("user_Beta","/api/investments/analyses")).json()).jobs.length,0);
    const diagnostics=await (await send("user_Alpha","/diagnostics")).json();assert.equal(diagnostics.executions,1);assert.equal(diagnostics.lastResult.network_calls,0);
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
