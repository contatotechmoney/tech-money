import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';
const env={ASSETS:{fetch:async()=>new Response('asset')}};
test('health does not claim migrated auth/database or real analysis',async()=>{
 const r=await worker.fetch(new Request('https://stage.test/api/migration/health'),env);
 const b=await r.json(); assert.equal(b.realAnalysisEnabled,false);assert.equal(b.databaseReady,false);assert.equal(b.authenticationReady,false);
});
test('all existing APIs fail closed without calling assets',async()=>{
 for(const path of ['/api','/api/investments/portfolio-pilot/execute','/api/auth/session','/api/__clerk','/api/leads/profile']){
  for(const method of ['GET','POST']){
   const r=await worker.fetch(new Request('https://stage.test'+path,{method}),{ASSETS:{fetch(){throw Error('must not forward')}}});
   assert.equal(r.status,503);assert.equal(r.headers.get('Cache-Control'),'no-store');
  }
 }
});
test('non API writes never reach assets',async()=>{assert.equal((await worker.fetch(new Request('https://stage.test/dashboard',{method:'POST'}),env)).status,405)});
test('read assets remain available',async()=>{assert.equal(await (await worker.fetch(new Request('https://stage.test/'),env)).text(),'asset')});
