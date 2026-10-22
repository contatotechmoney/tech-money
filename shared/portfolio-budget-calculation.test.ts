import test from 'node:test';import assert from 'node:assert/strict';
import {preliminaryBudget} from './portfolio-budget-calculation';
test('six-agent reference uses separate input/output rates, rounds up and never approves or debits',()=>{
 const d=preliminaryBudget({inputUsdMicrosPerMillion:106000,outputUsdMicrosPerMillion:513000},14);
 assert.equal(d.agents.length,6);assert.equal(d.agents.reduce((s,a)=>s+a.inputTokens,0),64000);assert.equal(d.agents.reduce((s,a)=>s+a.outputTokens,0),13000);
 assert.equal(d.providerUsdMicros,13453);assert.equal(d.referenceUsdMicros,17489);assert.equal(d.credits,null);assert.equal(d.executable,false);assert.equal(d.approved,false);assert.equal(d.creditsDebited,0);assert.equal(d.tokensUsed,0);
});
test('invalid snapshot sizes or rates cannot produce a monetary reference',()=>{
 for(const n of [0,2001,1.5])assert.throws(()=>preliminaryBudget({inputUsdMicrosPerMillion:1,outputUsdMicrosPerMillion:1},n));
 for(const n of [-1,NaN,Infinity,.3])assert.throws(()=>preliminaryBudget({inputUsdMicrosPerMillion:n,outputUsdMicrosPerMillion:1},14));
});
