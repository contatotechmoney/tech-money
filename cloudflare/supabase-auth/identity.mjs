import {readVerifiedSupabaseUser,sessionCookie} from "./supabase-user.mjs";
export const OWNER_SUPABASE_PROJECT_URL='https://igxtlcbyucshupsldijj.supabase.co';
export function authConfiguration(env){
 if(env.INVEST_SUPABASE_URL!==OWNER_SUPABASE_PROJECT_URL||!env.INVEST_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')||!env.INVEST_MIGRATION_ORIGIN?.startsWith('https://')||!env.INVEST_MIGRATION_OWNER_EMAIL||!env.PORTFOLIO_PILOT_PRODUCTION_OWNER_REFERENCE)throw new Error('AUTH_CONFIGURATION_REQUIRED');
 return {url:OWNER_SUPABASE_PROJECT_URL,key:env.INVEST_SUPABASE_PUBLISHABLE_KEY,origin:env.INVEST_MIGRATION_ORIGIN,owner:env.INVEST_MIGRATION_OWNER_EMAIL.toLowerCase()};
}
export async function verifiedSupabaseIdentity(request,env,fetcher=fetch){
 const config=authConfiguration(env);if(new URL(request.url).origin!==config.origin)return null;
 const token=sessionCookie(request,'__Host-invest-migration');if(!token)return null;
 const identity=await readVerifiedSupabaseUser(config,token,fetcher);
 return identity?.email===config.owner?identity:null;
}
const closed={realAnalysisEnabled:false,costApprovalRequired:true,executable:false};
export async function supabaseMigrationStatus(request,env,services){
 const json=(data,status=200)=>Response.json({...data,...closed},{status,headers:{'Cache-Control':'no-store'}});
 if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
 try{authConfiguration(env);const identity=await verifiedSupabaseIdentity(request,env,services.fetch);if(!identity)return json({error:'VERIFIED_OWNER_SIGN_IN_REQUIRED'},401);
 const state=await services.binding(identity,env);return json({authenticationReady:true,ownerBound:state.bound===true,originalOwnerPreserved:state.originalOwnerPreserved===true,migrationState:state.bound?'OWNER_LINKED_EXECUTION_BLOCKED':'OWNER_LINK_CONFIRMATION_REQUIRED'});
 }catch{return json({error:'MIGRATION_VERIFICATION_UNAVAILABLE'},503)}
}
export async function confirmSupabaseOwner(request,env,services){
 const json=(data,status=200)=>Response.json({...data,...closed},{status,headers:{'Cache-Control':'no-store'}});
 if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
 try{const config=authConfiguration(env);if(request.headers.get('Origin')!==config.origin||new URL(request.url).origin!==config.origin)return json({error:'ORIGIN_NOT_ALLOWED'},403);
 const identity=await verifiedSupabaseIdentity(request,env,services.fetch);if(!identity)return json({error:'VERIFIED_OWNER_SIGN_IN_REQUIRED'},401);
 // The authenticated browser cannot choose the legacy subject, email or account.
 const reader=request.body?.getReader();if(!reader)return json({error:'INVALID_CONFIRMATION'},400);let raw='',size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>100){await reader.cancel();return json({error:'INVALID_CONFIRMATION'},400)}raw+=new TextDecoder().decode(value);}let body;try{body=JSON.parse(raw)}catch{return json({error:'INVALID_CONFIRMATION'},400)}
 if(!body||Object.keys(body).length!==1||body.confirm!==true)return json({error:'EXPLICIT_CONFIRMATION_REQUIRED'},400);
 const linked=await services.confirm(identity,env);if(!linked)return json({error:'OWNER_LINK_CONFLICT'},409);return json({ownerBound:true,originalOwnerPreserved:true});
 }catch{return json({error:'OWNER_LINK_UNAVAILABLE'},503)}
}
