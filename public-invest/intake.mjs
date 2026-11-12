export const interests = new Set(['carteira','planejamento','conhecer','empresarial']);
const teamSizes = new Set(['1-5','6-20','21-50','51+','unknown']);
export function parseInterest(body) {
 const enterprise=body?.interest==='empresarial';
 const keys=['name','email','interest','contactConsent','marketingOptIn','website',
  ...(enterprise?['companyName','teamSize','enterpriseGoal']:[])];
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!keys.includes(k)))throw new Error('INVALID_INTEREST');
 const name=typeof body.name==='string'?body.name.trim():'';
 const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
 if(name.length<2||name.length>120||/[\x00-\x1f\x7f]/.test(name)||email.length>254||!/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)||!interests.has(body.interest)||body.contactConsent!==true||typeof body.marketingOptIn!=='boolean'||typeof body.website!=='string'||body.website.length)throw new Error('INVALID_INTEREST');
 const base={name,email,interest:body.interest,marketingOptIn:body.marketingOptIn};
 if(!enterprise)return base;
 const companyName=typeof body.companyName==='string'?body.companyName.trim():'';
 const enterpriseGoal=typeof body.enterpriseGoal==='string'?body.enterpriseGoal.trim():'';
 if(companyName.length<2||companyName.length>150||/[\x00-\x1f\x7f]/.test(companyName)||
  !teamSizes.has(body.teamSize)||enterpriseGoal.length>500||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(enterpriseGoal)||
  (body.enterpriseGoal!==undefined&&typeof body.enterpriseGoal!=='string')||body.marketingOptIn)throw new Error('INVALID_ENTERPRISE');
 return {...base,companyName,teamSize:body.teamSize,enterpriseGoal:enterpriseGoal||null};
}
export async function interestRequest(request,env,store) {
 const headers={'Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8','X-Content-Type-Options':'nosniff'};
 const result=(body,status)=>new Response(JSON.stringify(body),{status,headers});
 if(request.method!=='POST')return result({error:'Método não permitido.'},405);
 if(!env.INTEREST_ORIGIN||(env.INTEREST_TEST_MODE!=='true'&&new URL(request.url).origin!==env.INTEREST_ORIGIN)||request.headers.get('Origin')!==env.INTEREST_ORIGIN)return result({error:'Envie o cadastro pela página do Invest.'},403);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return result({error:'Formato inválido.'},415);
 if(Number(request.headers.get('Content-Length')||0)>4096)return result({error:'Cadastro muito longo.'},413);
 let data;
 try{const reader=request.body?.getReader();if(!reader)throw new Error('EMPTY');let bytes=0;const parts=[];while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>4096){await reader.cancel();return result({error:'Cadastro muito longo.'},413);}parts.push(chunk.value);}const content=new Uint8Array(bytes);let offset=0;for(const part of parts){content.set(part,offset);offset+=part.length;}data=parseInterest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(content)));}catch(error){return result({error:error.message==='INVALID_ENTERPRISE'?'Confira o nome da empresa e o tamanho da equipe.':'Confira nome, e-mail e autorização de contato.'},400);}
 try{await store.capture(data,request,env);return result({accepted:true},202);}catch(error){if(error.message==='RATE_LIMIT')return result({error:'Muitas tentativas. Aguarde alguns minutos e tente novamente.'},429);return result({error:'Não foi possível salvar seu interesse agora. Seus dados continuam no formulário; tente novamente.'},503);}
}
