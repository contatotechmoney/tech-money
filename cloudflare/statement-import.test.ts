import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
import {statementImport,validatedStatement} from './statement-import';import {migrationPortal} from './portal';
const env={INVEST_MIGRATION_ORIGIN:'https://migration.example.invalid',INVEST_STATEMENT_IMPORT_WRITES:'enabled',PORTFOLIO_PILOT_PRODUCTION_OWNER_REFERENCE:'owner-a'};
const reviewer='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const input={format:'b3-xlsx-v1',statementDate:'2026-01-01',reviewed:true,positions:[{sheet:'Acoes',row:2,product:'Ativo fictício',institution:'Banco exemplo',quantity:2,price:10,value:20,nature:'',valuation:'Valor Atualizado'}],totals:[{sheet:'Acoes',declaredTotal:20}]};
const req=(data:unknown=input,origin=env.INVEST_MIGRATION_ORIGIN)=>new Request(env.INVEST_MIGRATION_ORIGIN+'/api/investments/statement-imports',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)});
test('disabled saving refuses before parsing or querying and does not enable analyses',async()=>{let queried=false;const s={db:async()=>{queried=true}};await assert.rejects(statementImport(req(),{},'owner',reviewer,s),(e:any)=>e.code==='STATEMENT_SAVING_BLOCKED');assert.equal(queried,false)});
test('server rejects absent review, foreign identities, dates, inconsistent totals and repeated rows',()=>{for(const data of [{...input,reviewed:false},{...input,userId:'foreign'},{...input,statementDate:'2999-01-01'},{...input,totals:[{sheet:'Acoes',declaredTotal:21}]},{...input,positions:[input.positions[0],input.positions[0]]}])assert.throws(()=>validatedStatement(data));});
test('cross-origin request cannot write',async()=>{await assert.rejects(statementImport(req(input,'https://other.invalid'),env,'owner',reviewer,{}),(e:any)=>e.code==='ORIGIN_NOT_ALLOWED')});
test('unverified and unlinked users cannot reach snapshot database',async()=>{for(const s of [{verify:async()=>null},{verify:async()=>({subject:reviewer}),binding:async()=>({bound:false})}]){const r=await migrationPortal(req(),env,{...s,db:async()=>{throw Error('must not query')}});assert.ok([401,403].includes(r.status));}});
test('append-only positions are idempotent, owner scoped, private and never create trade history',async()=>{
 const pg=new PGlite();try{
 let sql=await readFile(new URL('../supabase/statement-imports.sql',import.meta.url),'utf8');sql=sql.replace('REVOKE ALL ON public.invest_statement_imports FROM PUBLIC,anon,authenticated;','REVOKE ALL ON public.invest_statement_imports FROM PUBLIC;');await pg.exec(sql);await pg.exec(sql);
 const services={db:async(_env:any,fn:any)=>fn({query:(sql:string,args:any[])=>pg.query(sql,args)})};
 const a=await statementImport(req(),env,'owner-a',reviewer,services);const again=await statementImport(req({...input,totals:[...input.totals]}),env,'owner-a',reviewer,services);assert.equal(a.record.id,again.record.id);assert.equal(again.duplicate,true);assert.equal(a.realAnalysisEnabled,false);assert.equal(a.costApproved,false);assert.equal(a.tradeHistoryChanged,false);
 const read=new Request(env.INVEST_MIGRATION_ORIGIN+'/api/investments/statement-imports');const other=await statementImport(read,env,'owner-b',reviewer,services);assert.equal(other.imports.length,0);
 const owner=await statementImport(read,env,'owner-a',reviewer,services);assert.equal(owner.imports.length,1);assert.equal(JSON.stringify(owner).includes('owner-a'),false);assert.equal(JSON.stringify(owner).includes('Ativo fictício'),false);
 const detailReq=new Request(env.INVEST_MIGRATION_ORIGIN+'/api/investments/statement-imports/'+a.record.id);const detail=await statementImport(detailReq,env,'owner-a',reviewer,services);assert.equal(detail.record.payload.positions[0].product,'Ativo fictício');assert.equal('user_id' in detail.record,false);await assert.rejects(statementImport(detailReq,env,'owner-b',reviewer,services),(e:any)=>e.code==='STATEMENT_NOT_FOUND');
 const tables=await pg.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");assert.equal(tables.rows.length,1);
 }finally{await pg.close();}
});
