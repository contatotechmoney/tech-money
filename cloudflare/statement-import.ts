import {z} from 'zod';
export class StatementError extends Error{constructor(public code:string,public status:number){super(code)}}
const label=z.string().trim().min(1).max(250);
const amount=z.number().finite().min(0).max(1e12);
const position=z.object({sheet:z.enum(['Acoes','Empréstimos','Renda Fixa','Tesouro Direto']),row:z.number().int().min(2).max(2005),product:label,institution:label,quantity:amount,price:amount.nullable(),value:amount.nullable(),nature:z.enum(['','Doador','Tomador']),valuation:z.enum(['Valor Atualizado','CURVA'])}).strict();
const inputSchema=z.object({format:z.literal('b3-xlsx-v1'),statementDate:z.string().date(),reviewed:z.literal(true),positions:z.array(position).min(1).max(2000),totals:z.array(z.object({sheet:position.shape.sheet,declaredTotal:amount}).strict()).min(1).max(4)}).strict();
export function validatedStatement(input:unknown){
 const result=inputSchema.safeParse(input);if(!result.success)throw new StatementError('INVALID_STATEMENT',400);
 const data=result.data;
 if(data.statementDate>new Date().toISOString().slice(0,10)||data.statementDate<'1900-01-01')throw new StatementError('INVALID_STATEMENT_DATE',400);
 const keys=new Set<string>(),sheets=new Set<string>();
 for(const p of data.positions){
  const key=`${p.sheet}:${p.row}`;if(keys.has(key))throw new StatementError('REPEATED_SOURCE_ROW',400);keys.add(key);sheets.add(p.sheet);
  if((p.sheet==='Empréstimos')!==!!p.nature||(p.sheet==='Renda Fixa'?p.valuation!=='CURVA':p.valuation!=='Valor Atualizado'))throw new StatementError('INVALID_POSITION_CLASSIFICATION',400);
 }
 if(data.totals.length!==sheets.size||new Set(data.totals.map(t=>t.sheet)).size!==sheets.size)throw new StatementError('INVALID_STATEMENT_TOTALS',400);
 for(const t of data.totals){const rows=data.positions.filter(p=>p.sheet===t.sheet);if(!rows.length||rows.some(p=>p.value===null)||Math.abs(rows.reduce((s,p)=>s+p.value!,0)-t.declaredTotal)>0.011)throw new StatementError('STATEMENT_TOTAL_MISMATCH',400);}
 // Canonical ordering makes retries and renamed copies converge on one snapshot.
 data.positions.sort((a,b)=>a.sheet.localeCompare(b.sheet)||a.row-b.row);data.totals.sort((a,b)=>a.sheet.localeCompare(b.sheet));
 return data;
}
async function body(request:Request){
 if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))throw new StatementError('INVALID_STATEMENT',400);
 const reader=request.body?.getReader();if(!reader)throw new StatementError('INVALID_STATEMENT',400);
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>1_000_000){await reader.cancel();throw new StatementError('STATEMENT_TOO_LARGE',413)}chunks.push(r.value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw new StatementError('INVALID_STATEMENT',400)}
}
export async function statementImport(request:Request,env:any,owner:string,reviewer:string,services:any){
 const enabled=env.INVEST_STATEMENT_IMPORT_WRITES==='enabled';
 const id=new URL(request.url).pathname.match(/\/statement-imports\/([0-9a-f-]{36})$/)?.[1];
 if(request.method==='GET'&&id){const row=await services.db(env,async(c:any)=>(await c.query('SELECT id,statement_date,position_count,reviewed_at,payload FROM invest_statement_imports WHERE user_id=$1 AND id=$2',[owner,id])).rows[0]);if(!row)throw new StatementError('STATEMENT_NOT_FOUND',404);return {savingEnabled:enabled,record:row};}
 if(id)throw new StatementError('METHOD_NOT_ALLOWED',405);
 if(request.method==='GET')return {savingEnabled:enabled,imports:enabled?await services.db(env,async(c:any)=>(await c.query('SELECT id,statement_date,position_count,reviewed_at FROM invest_statement_imports WHERE user_id=$1 ORDER BY reviewed_at DESC,id DESC LIMIT 50',[owner])).rows):[]};
 if(!enabled)throw new StatementError('STATEMENT_SAVING_BLOCKED',423);
 if(request.method!=='POST')throw new StatementError('METHOD_NOT_ALLOWED',405);
 if(new URL(request.url).origin!==env.INVEST_MIGRATION_ORIGIN||request.headers.get('Origin')!==env.INVEST_MIGRATION_ORIGIN)throw new StatementError('ORIGIN_NOT_ALLOWED',403);
 const data=validatedStatement(await body(request));
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)));const fingerprint=Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
 return services.db(env,async(c:any)=>{
  const saved=(await c.query('INSERT INTO invest_statement_imports(id,user_id,reviewer_subject,statement_date,fingerprint,position_count,payload) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(user_id,fingerprint) DO NOTHING RETURNING id,statement_date,position_count,reviewed_at',[crypto.randomUUID(),owner,reviewer,data.statementDate,fingerprint,data.positions.length,JSON.stringify(data)])).rows[0];
  const row=saved??(await c.query('SELECT id,statement_date,position_count,reviewed_at FROM invest_statement_imports WHERE user_id=$1 AND fingerprint=$2',[owner,fingerprint])).rows[0];
  if(!row)throw new StatementError('STATEMENT_UNAVAILABLE',503);
  return {saved:true,duplicate:!saved,record:row,tradeHistoryChanged:false,realAnalysisEnabled:false,costApproved:false};
 });
}
