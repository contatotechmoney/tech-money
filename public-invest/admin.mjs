const statuses=['novo','contatado','reuniao','proposta','concluido','arquivado'];
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const decode=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
let cached;
export async function ownerIdentity(request,env,fetcher=fetch){
 const issuer=env.INTEREST_ACCESS_ISSUER,aud=env.INTEREST_ACCESS_AUD,owner=env.INTEREST_OWNER_EMAIL;
 if(!issuer||!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)||!aud||!owner)return null;
 try{
 const token=request.headers.get('Cf-Access-Jwt-Assertion');if(!token||token.length>16000)return null;
 const parts=token.split('.');if(parts.length!==3)return null;
 const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))),claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
 const now=Math.floor(Date.now()/1000);
 if(header.alg!=='RS256'||typeof header.kid!=='string'||claims.iss!==issuer||!Array.isArray(claims.aud)||!claims.aud.includes(aud)||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+30||(claims.nbf!==undefined&&claims.nbf>now)||typeof claims.sub!=='string'||claims.email?.toLowerCase()!==owner.toLowerCase())return null;
 if(!cached||cached.issuer!==issuer||cached.expires<Date.now()){const r=await fetcher(issuer+'/cdn-cgi/access/certs',{signal:AbortSignal.timeout(5000)});if(!r.ok)return null;cached={issuer,expires:Date.now()+300000,keys:(await r.json()).keys};}
 const jwk=cached.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)return null;
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))return null;
 return {subject:claims.sub,email:claims.email};
 }catch{return null;}
}
export async function adminRequest(request,env,store,identity){
 if(!identity)return json({error:'Acesso exclusivo. Entre com sua conta autorizada.'},403);
 const url=new URL(request.url);
 try{
 if(request.method==='GET'){
  const status=url.searchParams.get('status')||'';if(status&&!statuses.includes(status))return json({error:'Filtro inválido.'},400);
  const page=Number(url.searchParams.get('page')||1);if(!Number.isSafeInteger(page)||page<1||page>10000)return json({error:'Página inválida.'},400);
  return json(await store.list({status,page,search:(url.searchParams.get('q')||'').trim().slice(0,120)},env));
 }
 if(request.method!=='PATCH')return json({error:'Método inválido.'},405);
 if(request.headers.get('Origin')!==env.INTEREST_ORIGIN||url.origin!==env.INTEREST_ORIGIN||!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Origem inválida.'},403);
 const reader=request.body?.getReader();if(!reader)return json({error:'Pedido inválido.'},400);let text='',size=0;const decoder=new TextDecoder();
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>10000){await reader.cancel();return json({error:'Pedido muito grande.'},413)}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
 let data;try{data=JSON.parse(text)}catch{return json({error:'Pedido inválido.'},400)}
 if(!data||Object.keys(data).some(k=>!['id','status','notes','version'].includes(k))||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(data.id)||!statuses.includes(data.status)||typeof data.notes!=='string'||data.notes.length>2000||!Number.isSafeInteger(data.version)||data.version<0)return json({error:'Dados inválidos.'},400);
 const saved=await store.update(data,identity,env);return saved?json({saved:true}):json({error:'O registro mudou. Atualize a lista antes de salvar.'},409);
 }catch{return json({error:'Não foi possível acessar os contatos. Tente novamente.'},503)}
}
