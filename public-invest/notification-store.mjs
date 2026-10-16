import pg from 'pg';
async function db(env,fn){const c=new pg.Client({connectionString:env.INTEREST_DATABASE.connectionString,connectionTimeoutMillis:15000,query_timeout:8000});try{await c.connect();return await fn(c)}finally{c.end().catch(()=>{})}}
export const notificationQueue={
 async claim(env){return db(env,async c=>{const result=await c.query("WITH candidate AS (SELECT interest_id FROM invest_interest_notifications WHERE sent_at IS NULL AND attempts<8 AND next_attempt_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE invest_interest_notifications n SET attempts=n.attempts+1,next_attempt_at=now()+interval '5 minutes' FROM candidate WHERE n.interest_id=candidate.interest_id RETURNING n.interest_id,n.attempts");return result.rows[0]})},
 async finish(item,ok,env){return db(env,c=>ok?c.query('UPDATE invest_interest_notifications SET sent_at=now() WHERE interest_id=$1 AND attempts=$2',[item.interest_id,item.attempts]):c.query("UPDATE invest_interest_notifications SET next_attempt_at=now()+least(attempts*5,60)*interval '1 minute' WHERE interest_id=$1 AND attempts=$2",[item.interest_id,item.attempts]))}
};
