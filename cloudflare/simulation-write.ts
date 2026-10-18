import {PORTFOLIO_DEMO_VERSION,presentPortfolioStudy} from '../shared/portfolio-simulation';
import {publicSimulation} from '../shared/investment-simulation';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class DemoError extends Error{constructor(public code:string,public status:number){super(code)}}
export async function createDemo(request:Request,env:any,owner:string,services:any){
 if(request.headers.get('Origin')!==env.INVEST_MIGRATION_ORIGIN||new URL(request.url).origin!==env.INVEST_MIGRATION_ORIGIN)throw new DemoError('ORIGIN_NOT_ALLOWED',403);
 if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))throw new DemoError('INVALID_SIMULATION',400);
 const reader=request.body?.getReader();if(!reader)throw new DemoError('INVALID_SIMULATION',400);let bytes=0,raw='';const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2048){await reader.cancel();throw new DemoError('INVALID_SIMULATION',413)}raw+=decoder.decode(value,{stream:true})}raw+=decoder.decode();
 let input:any;try{input=JSON.parse(raw)}catch{throw new DemoError('INVALID_SIMULATION',400)}
 const portfolio=new URL(request.url).pathname==='/api/investments/portfolio-simulations';
 const expected=portfolio?['requestKey']:['requestKey','ticker'];
 if(!input||Array.isArray(input)||Object.keys(input).length!==expected.length||Object.keys(input).some(k=>!expected.includes(k))||!uuid.test(input.requestKey)||(!portfolio&&!['BBDC3','BBAS3'].includes(input.ticker)))throw new DemoError('INVALID_SIMULATION',400);
 const table=portfolio?'portfolio_simulation_studies':'investment_simulation_studies';
 return services.db(env,async(c:any)=>{
  await c.query('BEGIN');try{
   await c.query("SET LOCAL statement_timeout='5s'");
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`migration-demo:${owner}:${table}`]);
   const existing=(await c.query(`SELECT * FROM ${table} WHERE user_id=$1 AND request_key=$2`,[owner,input.requestKey])).rows[0];
   if(existing){if(!portfolio&&existing.ticker!==input.ticker)throw new DemoError('SIMULATION_CONFLICT',409);await c.query('COMMIT');return portfolio?presentPortfolioStudy(existing):publicSimulation(existing)}
   const limits=(await c.query(`SELECT count(*) FILTER(WHERE created_at>now()-interval '12 seconds')::int AS active,count(*) FILTER(WHERE created_at>now()-interval '24 hours')::int AS daily FROM ${table} WHERE user_id=$1`,[owner])).rows[0];
   if(limits.active>0)throw new DemoError('SIMULATION_ACTIVE',409);if(limits.daily>=30)throw new DemoError('SIMULATION_LIMIT',429);
   const id=crypto.randomUUID();const row=(await c.query(portfolio?'INSERT INTO portfolio_simulation_studies(id,user_id,request_key,scenario_version) VALUES($1,$2,$3,$4) RETURNING *':'INSERT INTO investment_simulation_studies(id,user_id,request_key,ticker) VALUES($1,$2,$3,$4) RETURNING *',[id,owner,input.requestKey,portfolio?PORTFOLIO_DEMO_VERSION:input.ticker])).rows[0];
   await c.query('COMMIT');return portfolio?presentPortfolioStudy(row):publicSimulation(row);
  }catch(error){await c.query('ROLLBACK');throw error}
 });
}
