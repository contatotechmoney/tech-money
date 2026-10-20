import {consultantAsset} from './consultant-asset.mjs';
import {deliverPending,testNotice} from './notifications.mjs';
import {notificationQueue} from './notification-store.mjs';
import {ownerIdentity,adminRequest} from './admin.mjs';
import {adminStore} from './admin-store.mjs';
import pg from 'pg';
import {interestRequest} from './intake.mjs';
export const store={async capture(data,request,env){
 if(!env.INTEREST_DATABASE?.connectionString||!env.INTEREST_RATE_KEY)throw new Error('NOT_CONFIGURED');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.INTEREST_RATE_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const window=Math.floor(Date.now()/600000);
 const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${window}:${request.headers.get('CF-Connecting-IP')||'unknown'}`));
 const bucket=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const client=new pg.Client({connectionString:env.INTEREST_DATABASE.connectionString,connectionTimeoutMillis:15000,query_timeout:8000});let transaction=false;let connected=false;let stage='connect';
 try{await client.connect();connected=true;stage='transaction';await client.query('BEGIN');transaction=true;stage='settings';await client.query("SET LOCAL statement_timeout='5s'");
 stage='cleanup';await client.query('DELETE FROM invest_interest_rate_limits WHERE expires_at<now()');
 stage='rate';const rate=await client.query("INSERT INTO invest_interest_rate_limits(bucket,hits,expires_at) VALUES($1,1,now()+interval '11 minutes') ON CONFLICT(bucket) DO UPDATE SET hits=invest_interest_rate_limits.hits+1 RETURNING hits",[bucket]);
 if(rate.rows[0].hits>8){await client.query('COMMIT');transaction=false;throw new Error('RATE_LIMIT');}
 stage='insert';const inserted=await client.query('INSERT INTO invest_interest_requests(name,email,interest,contact_consent,marketing_opt_in,is_test) VALUES($1,$2,$3,true,$4,$5) ON CONFLICT(email,is_test) DO NOTHING RETURNING id',[data.name,data.email,data.interest,data.marketingOptIn,env.INTEREST_TEST_MODE==='true']);
 if(inserted.rowCount&&env.INTEREST_TEST_MODE!=='true')await client.query('INSERT INTO invest_interest_notifications(interest_id) VALUES($1) ON CONFLICT DO NOTHING',[inserted.rows[0].id]);
 await client.query('COMMIT');transaction=false;
 }catch(error){console.error(JSON.stringify({component:'interest',stage,code:/^[A-Z0-9_]{3,40}$/.test(error.code||'')?error.code:'unavailable',timeout:/timeout|terminated/i.test(error.message||'')}));throw error;}finally{if(transaction)await client.query('ROLLBACK').catch(()=>{});if(connected)client.end().catch(()=>{});else client.connection?.stream?.destroy();}
}};
export default {async scheduled(event,env,ctx){ctx.waitUntil(deliverPending(env,notificationQueue));},async fetch(request,env,ctx){
 const sharedProfile=await consultantAsset(request);if(sharedProfile)return sharedProfile;
const url=new URL(request.url);
 if(url.pathname==='/'){url.pathname='/index.html';request=new Request(url,request);}
 if(url.pathname==='/api/admin/telegram-test')return testNotice(request,env,await ownerIdentity(request,env));
 if(url.pathname==='/api/admin/interessados')return adminRequest(request,env,adminStore,await ownerIdentity(request,env));
 if(url.pathname==='/contatos'||url.pathname==='/contatos.html'){if(!await ownerIdentity(request,env))return new Response('Área exclusiva. Acesso não autorizado.',{status:403,headers:{'Cache-Control':'no-store'}});url.pathname='/contatos.html';request=new Request(url,request);}
 if(url.pathname==='/api/interesse'){const response=await interestRequest(request,env,store);if(response.status===202&&env.INTEREST_TEST_MODE!=='true')ctx.waitUntil(deliverPending(env,notificationQueue).catch(()=>{}));return response;}
 if(url.pathname.startsWith('/api/'))return Response.json({error:'Não disponível.',realAnalysisEnabled:false},{status:404,headers:{'Cache-Control':'no-store'}});
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
 if(!['/','/index.html','/style.css','/form.js','/logo.svg','/contatos','/contatos.html','/contatos.css','/contatos.js'].includes(url.pathname))return new Response('Página não encontrada',{status:404});
 const response=await env.ASSETS.fetch(request);const h=new Headers(response.headers);
 h.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
 h.set('Referrer-Policy','strict-origin-when-cross-origin');h.set('X-Content-Type-Options','nosniff');
 let body=response.body;if(request.method!=='HEAD'&&h.get('Content-Type')?.includes('text/html')){h.set('Cache-Control','no-store');if(env.INTEREST_TEST_MODE==='true')body=(await response.text()).replace('<body>','<body><div class="preview-banner">Prévia de validação · cadastros de teste · sem análises reais</div>');}return new Response(body,{status:response.status,headers:h});
}};

