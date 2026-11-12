import test from 'node:test';import assert from 'node:assert/strict';import {loginRequest,migrationLoginAsset} from './login.mjs';
const env={INVEST_SUPABASE_URL:'https://igxtlcbyucshupsldijj.supabase.co',INVEST_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',INVEST_MIGRATION_ORIGIN:'https://migration.example.invalid',INVEST_MIGRATION_OWNER_EMAIL:'owner@example.invalid',PORTFOLIO_PILOT_PRODUCTION_OWNER_REFERENCE:'legacy-test',INVEST_MIGRATION_RATE_KEY:'test-key'};
const req=(path,body={},origin=env.INVEST_MIGRATION_ORIGIN)=>new Request(env.INVEST_MIGRATION_ORIGIN+'/api/migration/auth/'+path,{method:'POST',headers:{Origin:origin},body:JSON.stringify(body)});
test('email is server-selected and callback is fixed to migration origin',async()=>{const r=await loginRequest(req('request-link',{email:'attacker@example.invalid'}),env,{rate:async()=>true,fetch:async(url,init)=>{assert.equal(new URL(url).origin,env.INVEST_SUPABASE_URL);assert.equal(new URL(url).searchParams.get('redirect_to'),env.INVEST_MIGRATION_ORIGIN+'/migration/callback');assert.equal(JSON.parse(init.body).email,env.INVEST_MIGRATION_OWNER_EMAIL);assert.equal(init.redirect,'manual');return Response.json({})}});assert.equal(r.status,200);assert.equal((await r.json()).realAnalysisEnabled,false)});
test('cross-origin and exhausted rate limits never call provider',async()=>{const services={rate:async()=>false,fetch:()=>assert.fail()};assert.equal((await loginRequest(req('request-link',{},'https://evil.invalid'),env,services)).status,403);assert.equal((await loginRequest(req('request-link'),env,services)).status,429)});
test('session exchange verifies owner and returns HttpOnly cookie without exposing tokens',async()=>{const token='x'.repeat(30);const r=await loginRequest(req('exchange',{access_token:token}),env,{rate:async()=>true,fetch:async()=>Response.json({id:'12345678-1234-1234-1234-123456789012',role:'authenticated',email:env.INVEST_MIGRATION_OWNER_EMAIL,email_confirmed_at:'2026-01-01T00:00:00Z'})});assert.equal(r.status,200);assert.match(r.headers.get('Set-Cookie'),/Secure; HttpOnly; SameSite=Strict/);assert.equal((await r.text()).includes(token),false)});
test('invalid session and provider failure fail closed',async()=>{assert.equal((await loginRequest(req('exchange',{access_token:'bad'}),env,{rate:async()=>true,fetch:()=>assert.fail()})).status,400);assert.equal((await loginRequest(req('request-link'),env,{rate:async()=>true,fetch:async()=>{throw Error('private')}})).status,503)});
test('migration login has no external assets or cache and blocks framing',()=>{const r=migrationLoginAsset(new Request('https://migration.example.invalid/migration/login'));assert.equal(r.headers.get('Cache-Control'),'no-store');assert.match(r.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/)});
test('final Invest origin fixes callback and rejects the former preview origin',async()=>{
 const finalEnv={...env,INVEST_MIGRATION_ORIGIN:'https://invest.techmoney.com.br'};
 const finalRequest=origin=>new Request(finalEnv.INVEST_MIGRATION_ORIGIN+'/api/migration/auth/request-link',{method:'POST',headers:{Origin:origin},body:JSON.stringify({redirect:'https://evil.invalid',email:'other@example.invalid'})});
 let calls=0;
 const services={rate:async()=>true,fetch:async(url,init)=>{calls++;assert.equal(new URL(url).searchParams.get('redirect_to'),'https://invest.techmoney.com.br/migration/callback');assert.equal(JSON.parse(init.body).email,env.INVEST_MIGRATION_OWNER_EMAIL);return Response.json({})}};
 assert.equal((await loginRequest(finalRequest(finalEnv.INVEST_MIGRATION_ORIGIN),finalEnv,services)).status,200);
 assert.equal((await loginRequest(finalRequest(env.INVEST_MIGRATION_ORIGIN),finalEnv,services)).status,403);
 assert.equal(calls,1);
});
test('owner production login removes obsolete preview links without enabling execution',async()=>{
 const config={...env,INVEST_PORTAL_MODE:'owner-production',INVEST_MIGRATION_ORIGIN:'https://invest.techmoney.com.br'};
 const html=await migrationLoginAsset(new Request(config.INVEST_MIGRATION_ORIGIN+'/migration/login'),config).text();
 assert.match(html,/Entrar no Invest/);assert.doesNotMatch(html,/Abrir portal atual|Ambiente de migração/);assert.match(html,/análises reais e cobranças permanecem bloqueadas/);
 const script=await migrationLoginAsset(new Request(config.INVEST_MIGRATION_ORIGIN+'/migration/login.js'),config).text();assert.match(script,/análises reais continuam bloqueadas/);assert.doesNotMatch(script,/O portal completo ainda está em migração/);
});
test('email provider quota is explicit and never exposes provider response or weakens limits',async()=>{
 const r=await loginRequest(req('request-link'),env,{rate:async()=>true,fetch:async()=>Response.json({private:'provider-detail'},{status:429})});
 assert.equal(r.status,429);const body=await r.json();assert.equal(body.error,'EMAIL_RATE_LIMITED');assert.equal(body.executable,false);assert.equal(JSON.stringify(body).includes('provider-detail'),false);
 const script=await migrationLoginAsset(new Request('https://migration.example.invalid/migration/login.js')).text();assert.match(script,/EMAIL_RATE_LIMITED/);assert.match(script,/limite temporário/);
});
