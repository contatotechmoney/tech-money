// Fixed public component only: never forward cookies, query strings or credentials.
export async function consultantAsset(request){
 const path=new URL(request.url).pathname;
 const file=({'/tm-consultant.js':'consultant.js','/tm-consultant.css':'consultant.css'})[path];
 if(!file)return null;
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
 try{const upstream=await fetch('https://finance.techmoney.com.br/components/consultant/v1/'+file,{signal:AbortSignal.timeout(8000)});
 if(!upstream.ok)return new Response('Componente temporariamente indisponível',{status:503});
 return new Response(request.method==='HEAD'?null:upstream.body,{headers:{'Content-Type':file.endsWith('.js')?'application/javascript; charset=utf-8':'text/css; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response('Componente temporariamente indisponível',{status:503})}
}
