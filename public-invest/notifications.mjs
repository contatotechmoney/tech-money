export async function deliverPending(env,queue){
 if(!env.INVEST_NOTIFICATIONS)return {delivered:0,failed:0};
 let delivered=0,failed=0;
 for(let i=0;i<10;i++){
  const item=await queue.claim(env);if(!item)break;
  let ok=false;try{ok=(await env.INVEST_NOTIFICATIONS.notifyInvest(false))?.delivered===true}catch{}
  await queue.finish(item,ok,env);if(ok)delivered++;else failed++;
 }
 return {delivered,failed};
}
export async function testNotice(request,env,identity){
 const headers={'Cache-Control':'no-store'};
 if(!identity)return Response.json({error:'Acesso exclusivo.'},{status:403,headers});
 if(request.method!=='POST')return new Response(null,{status:405,headers});
 if(request.headers.get('Origin')!==env.INTEREST_ORIGIN||new URL(request.url).origin!==env.INTEREST_ORIGIN)return Response.json({error:'Origem inválida.'},{status:403,headers});
 try{const result=await env.INVEST_NOTIFICATIONS?.notifyInvest(true);if(!result?.delivered)throw Error();return Response.json({delivered:true},{headers})}catch{return Response.json({error:'Não foi possível entregar o teste no Telegram.'},{status:503,headers})}
}
