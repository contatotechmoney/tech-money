export const interests = new Set(['carteira','planejamento','conhecer']);
export function parseInterest(body) {
 const keys=['name','email','interest','contactConsent','marketingOptIn','website'];
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!keys.includes(k)))throw new Error('INVALID_INTEREST');
 const name=typeof body.name==='string'?body.name.trim():'';
 const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
 if(name.length<2||name.length>120||/[\x00-\x1f\x7f]/.test(name)||email.length>254||!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)||!interests.has(body.interest)||body.contactConsent!==true||typeof body.marketingOptIn!=='boolean'||typeof body.website!=='string'||body.website.length)throw new Error('INVALID_INTEREST');
 return {name,email,interest:body.interest,marketingOptIn:body.marketingOptIn};
}
export async function interestRequest(request,env,store) {
 const headers={'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};
 const result=(body,status)=>new Response(JSON.stringify(body),{status,headers});
 if(request.method!=='POST')return result({error:'Método não permitido.'},405);
 if(!env.INTEREST_ORIGIN||(env.INTEREST_TEST_MODE!=='true'&&new URL(request.url).origin!==env.INTEREST_ORIGIN)||request.headers.get('Origin')!==env.INTEREST_ORIGIN)return result({error:'Envie o cadastro pela página do Invest.'},403);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return result({error:'Formato inválido.'},415);
 if(Number(request.headers.get('Content-Length')||0)>4096)return result({error:'Cadastro muito longo.'},413);
 let data;
 try{const reader=request.body?.getReader();if(!reader)throw new Error('EMPTY');let bytes=0;const parts=[];while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>4096){await reader.cancel();return result({error:'Cadastro muito longo.'},413);}parts.push(chunk.value);}const content=new Uint8Array(bytes);let offset=0;for(const part of parts){content.set(part,offset);offset+=part.length;}data=parseInterest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(content)));}catch{return result({error:'Confira nome, e-mail e autorização de contato.'},400);}
 try{await store.capture(data,request,env);return result({accepted:true},202);}catch(error){if(error.message==='RATE_LIMIT')return result({error:'Muitas tentativas. Aguarde alguns minutos e tente novamente.'},429);return result({error:'Não foi possível salvar seu interesse agora. Seus dados continuam no formulário; tente novamente.'},503);}
}
