import {z} from 'zod';
import {calculatePortfolioSnapshot,PortfolioValidationError,type PortfolioTransaction} from '../shared/portfolio-ledger';
import {respostasSaoValidas,classificarPerfil,pontuacaoMedia} from '../shared/suitability-scoring';
export class RecordError extends Error{constructor(public code:string,public status:number){super(code)}}
const transactionInput=z.object({ticker:z.string().trim().regex(/^[A-Za-z]{4}[0-9]{1,2}$/).transform(x=>x.toUpperCase()),transactionType:z.enum(['buy','sell']),quantity:z.coerce.number().positive().finite().lt(1e12),price:z.coerce.number().positive().finite().lt(1e10),operationDate:z.string().date()}).strict();
export function transactionRow(row:any):PortfolioTransaction{return {id:row.id,userId:row.user_id,ticker:row.ticker,transactionType:row.transaction_type,quantity:Number(row.quantity),price:Number(row.price),operationDate:row.operation_date instanceof Date?row.operation_date.toISOString().slice(0,10):String(row.operation_date).slice(0,10),createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString()}}
export async function writeRecord(request:Request,env:any,owner:string,services:any){
 // This is a recording function, never an order, provider call, payment or cost approval.
 if(env.INVEST_MIGRATION_RECORD_WRITES!=='enabled')throw new RecordError('MIGRATION_READ_ONLY',423);
 if(request.headers.get('Origin')!==env.INVEST_MIGRATION_ORIGIN||new URL(request.url).origin!==env.INVEST_MIGRATION_ORIGIN)throw new RecordError('ORIGIN_NOT_ALLOWED',403);
 const path=new URL(request.url).pathname;let input:any;
 if(request.method!=='DELETE'){
 if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))throw new RecordError('INVALID_RECORD',400);
 const reader=request.body?.getReader();let size=0,raw='';if(!reader)throw new RecordError('INVALID_RECORD',400);while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw new RecordError('INVALID_RECORD',413)}raw+=new TextDecoder().decode(value)}try{input=JSON.parse(raw)}catch{throw new RecordError('INVALID_RECORD',400)}
 }
 if(path==='/api/suitability/perfil'&&request.method==='POST'){
 if(!input||Array.isArray(input)||Object.keys(input).length!==1||!input.respostas||typeof input.respostas!=='object'||Array.isArray(input.respostas)||!respostasSaoValidas(input.respostas))throw new RecordError('INVALID_SUITABILITY_ANSWERS',400);
 return services.db(env,async(c:any)=>{const next=new Date();next.setUTCMonth(next.getUTCMonth()+24);const r=(await c.query('INSERT INTO suitability_profiles(id,user_id,perfil,pontuacao_media,respostas,data_proxima_reavaliacao) VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING *',[crypto.randomUUID(),owner,classificarPerfil(input.respostas),pontuacaoMedia(input.respostas),JSON.stringify(input.respostas),next])).rows[0];return {id:r.id,perfil:r.perfil,pontuacaoMedia:Number(r.pontuacao_media),dataAvaliacao:r.data_avaliacao,dataProximaReavaliacao:r.data_proxima_reavaliacao}});
 }
 const route=path.match(/^\/api\/investments\/portfolio\/transactions(?:\/([A-Za-z0-9-]{1,80}))?$/);if(!route)throw new RecordError('RECORD_NOT_FOUND',404);
 const id=route[1];if((request.method==='POST'&&id)||(['PATCH','DELETE'].includes(request.method)&&!id)||!['POST','PATCH','DELETE'].includes(request.method))throw new RecordError('METHOD_NOT_ALLOWED',405);
 let values:any;if(request.method!=='DELETE'){if(!input||typeof input!=='object'||Array.isArray(input))throw new RecordError('INVALID_TRANSACTION',400);if(input&&(['quantity','price'] as const).some(k=>k in input&&typeof input[k]!=='string'&&typeof input[k]!=='number'))throw new RecordError('INVALID_TRANSACTION',400);const parsed=(request.method==='PATCH'?transactionInput.partial():transactionInput).safeParse(input);if(!parsed.success||Object.keys(parsed.data).length===0)throw new RecordError('INVALID_TRANSACTION',400);values=parsed.data;if(values.quantity!==undefined)values.quantity=Math.round(values.quantity*1e6)/1e6;if(values.price!==undefined)values.price=Math.round(values.price*1e4)/1e4;if(values.quantity===0||values.price===0||values.quantity>=1e12||values.price>=1e10)throw new RecordError('INVALID_TRANSACTION',400)}
 return services.db(env,async(c:any)=>{await c.query('BEGIN');try{
 await c.query("SET LOCAL statement_timeout='5s'");await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`portfolio-record:${owner}`]);
 const old:PortfolioTransaction[]=(await c.query('SELECT * FROM portfolio_transactions WHERE user_id=$1 ORDER BY operation_date,created_at,id',[owner])).rows.map(transactionRow);const previous=old.find(r=>r.id===id);if(id&&!previous)throw new RecordError('RECORD_NOT_FOUND',404);
 if(request.method==='DELETE'){calculatePortfolioSnapshot(old.filter(r=>r.id!==id));await c.query('DELETE FROM portfolio_transactions WHERE id=$1 AND user_id=$2',[id,owner]);await c.query('COMMIT');return {deleted:true}}
 const candidate={...(previous??{id:crypto.randomUUID(),userId:owner,createdAt:new Date().toISOString()}),...values,updatedAt:new Date().toISOString()} as PortfolioTransaction;
 calculatePortfolioSnapshot(id?old.map(r=>r.id===id?candidate:r):[...old,candidate]);
 const args=[candidate.id,owner,candidate.ticker,candidate.transactionType,candidate.quantity,candidate.price,candidate.operationDate];
 const row=(await c.query(id?'UPDATE portfolio_transactions SET ticker=$3,transaction_type=$4,quantity=$5,price=$6,operation_date=$7,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *':'INSERT INTO portfolio_transactions(id,user_id,ticker,transaction_type,quantity,price,operation_date) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',args)).rows[0];await c.query('COMMIT');return transactionRow(row);
 }catch(error){await c.query('ROLLBACK');if(error instanceof PortfolioValidationError)throw new RecordError('PORTFOLIO_VALIDATION',400);throw error}});
}
