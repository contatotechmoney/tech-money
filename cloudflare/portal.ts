import {publicSimulation} from '../shared/investment-simulation';
import {verifiedSupabaseIdentity} from './supabase-auth/identity.mjs';
import {supabaseIdentityStore,db} from './supabase-auth/store.mjs';
import {reportPresentation,informationalReport} from '../server/report-policy';
import {PORTFOLIO_AGENTS,portfolioScenario,portfolioMetrics,presentPortfolioStudy} from '../shared/portfolio-simulation';
import {QUESTOES} from '../shared/suitability-questionnaire';
const closed={realAnalysisEnabled:false,executable:false,costApprovalRequired:true,migrationReadOnly:true};
const json=(data:unknown,status=200)=>Response.json({...data as object,...closed},{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const camel=(row:any)=>Object.fromEntries(Object.entries(row).filter(([k])=>k!=='user_id').map(([k,v])=>[k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),v instanceof Date?v.toISOString():v]));
export function historicalReport(row:any){const r=camel(row);for(const k of ['price','changePercent','riskScore'])if(r[k]!==null)r[k]=Number(r[k]);return informationalReport(r as any,reportPresentation(r as any,{historical:true}));}
export async function migrationPortal(request:Request,env:any,services:any={verify:verifiedSupabaseIdentity,binding:supabaseIdentityStore.binding,db}){
 try{
 const identity=await services.verify(request,env);if(!identity)return json({error:'VERIFIED_OWNER_SIGN_IN_REQUIRED'},401);
 const binding=await services.binding(identity,env);if(!binding.bound||!binding.originalOwnerPreserved)return json({error:'OWNER_LINK_REQUIRED'},403);
 const path=new URL(request.url).pathname;
 if(request.method!=='GET')return json({error:'MIGRATION_READ_ONLY',message:'Alterações e análises reais estão bloqueadas nesta prévia. Use o portal atual.'},423);
 if(path==='/api/migration/session')return json({ownerBound:true,user:{id:identity.subject,email:identity.email}});
 const owner=env.PORTFOLIO_PILOT_PRODUCTION_OWNER_REFERENCE;
 const query=async(sql:string,args:any[]=[owner])=>services.db(env,async(c:any)=>(await c.query(sql,args)).rows);
 if(path==='/api/investments/review-access')return json({assignments:[],canManageAssignments:false});
 if(path==='/api/investments/review-pending')return json({items:[]});
 if(path==='/api/investments/reports'){
  const rows=await query('SELECT DISTINCT ON(ticker) * FROM investment_reports WHERE user_id=$1 ORDER BY ticker,generated_at DESC,id DESC');
  return json({reports:rows.map(historicalReport),source:'Histórico restaurado; documentos datados sem recomendação aprovada'});
 }
 const report=path.match(/^\/api\/investments\/reports\/([A-Za-z0-9]{1,12})$/);
 if(report){const rows=await query('SELECT * FROM investment_reports WHERE user_id=$1 AND ticker=$2 ORDER BY generated_at DESC,id DESC LIMIT 100',[owner,report[1].toUpperCase()]);if(!rows.length)return json({error:'REPORT_NOT_FOUND'},404);return json({latest:historicalReport(rows[0]),history:rows.slice(1).map(historicalReport),source:rows[0].source});}
 if(path==='/api/suitability/questionario')return json({questoes:QUESTOES});
 if(path==='/api/suitability/perfil'){const rows=await query('SELECT * FROM suitability_profiles WHERE user_id=$1 ORDER BY data_avaliacao DESC,id DESC LIMIT 1');const r=rows[0];return json({perfil:r?{id:r.id,userId:identity.subject,perfil:r.perfil,pontuacaoMedia:Number(r.pontuacao_media),dataAvaliacao:r.data_avaliacao,dataProximaReavaliacao:r.data_proxima_reavaliacao}:null,avaliado:!!r});}
 if(path.startsWith('/api/suitability/conformidade/'))return json({ok:false,riscoIndisponivel:true,motivo:'Documento histórico; nenhuma recomendação individualizada está liberada na migração.'});
 if(path==='/api/investments/portfolio'){
 const holdings=await query('SELECT * FROM portfolio_holdings WHERE user_id=$1');const transactions=await query('SELECT * FROM portfolio_transactions WHERE user_id=$1 ORDER BY operation_date,id');
 // Do not invent current prices or returns. Empty source is faithfully represented.
 return json({items:holdings.map((r:any)=>({id:r.id,ticker:r.ticker,quantity:Number(r.quantity),averagePrice:Number(r.average_price),investedValue:Number(r.quantity)*Number(r.average_price),currentValue:null,returnValue:null,returnPercent:null,realizedProfit:0})),transactions:transactions.map(camel),summary:{totalInvested:holdings.reduce((s:number,r:any)=>s+Number(r.quantity)*Number(r.average_price),0),totalCurrent:null,realizedProfit:null,unrealizedReturnValue:null,returnValue:null,returnPercent:null},source:'Posições restauradas; cotações não consultadas na migração',updatedAt:new Date().toISOString()});
 }
 if(path==='/api/investments/portfolio-simulation/scenario')return json({mode:'simulation',scenario:portfolioScenario(),metrics:portfolioMetrics(),agents:PORTFOLIO_AGENTS,tokensUsed:0,creditsDebited:0});
 if(path==='/api/investments/simulation-options')return json({mode:'simulation',tickers:['BBDC3','BBAS3'],tokensUsed:0,creditsDebited:0});
 const studies=path.match(/^\/api\/investments\/(portfolio-simulations|simulations)(?:\/([0-9a-f-]{36}))?$/i);
 if(studies){const table=studies[1]==='portfolio-simulations'?'portfolio_simulation_studies':'investment_simulation_studies';const present=studies[1]==='portfolio-simulations'?presentPortfolioStudy:publicSimulation;const rows=await query(`SELECT * FROM ${table} WHERE user_id=$1${studies[2]?' AND id=$2':''} ORDER BY created_at DESC,id DESC LIMIT 30`,studies[2]?[owner,studies[2]]:[owner]);if(studies[2])return rows[0]?json(present(rows[0])):json({error:'STUDY_NOT_FOUND'},404);return json({studies:rows.map((r:any)=>present(r))});}
 if(path==='/api/investments/report-deliveries')return json({items:[],nextCursor:null});
 return json({error:'MIGRATION_NOT_READY'},503);
 }catch{return json({error:'MIGRATION_PORTAL_UNAVAILABLE'},503)}
}
