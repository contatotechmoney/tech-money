import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
// Real PostgreSQL in an isolated WASM database. No connection to production.
const db = new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE TABLE public.leads(id uuid DEFAULT gen_random_uuid(),email text UNIQUE,nome text,cooperativa text,cargo text,whatsapp text,created_at timestamptz DEFAULT now());
  INSERT INTO public.leads(email,nome,cooperativa,cargo,whatsapp) VALUES('pessoa@empresa.com.br','Contato Coop','Coop Exemplo','Diretor','00000000');`);
const migration = await readFile(new URL('../../sql/supabase_portal_leads.sql',import.meta.url),'utf8');
await db.exec(migration);
await db.exec(migration); // Re-running the migration is safe.
const get = async id => (await db.query('SELECT public.techmoney_portal_lead_profile($1) AS result',[id])).rows[0].result;
const save = async (id,email='pessoa@empresa.com.br',opt=false,nome='Contato Invest') => (await db.query(
  'SELECT public.techmoney_capture_portal_lead($1,$2,$3,$4::timestamptz,$5) AS result',
  [id,email,nome,'2026-10-01T00:00:00Z',opt])).rows[0].result;
assert.equal((await get('user_alpha')).registered,false);
assert.equal((await save('user_alpha')).registered,true);
await Promise.all(Array.from({length:6},()=>save('user_alpha')));
let stored=(await db.query('SELECT * FROM public.techmoney_portal_leads')).rows;
assert.equal(stored.length,1);assert.equal(stored[0].origem,'invest');
assert.equal(stored[0].marketing_opt_in,false);assert.equal(stored[0].marketing_consent_at,null);
const first=stored[0].created_at;
await save('user_alpha','pessoa@empresa.com.br',true);
stored=(await db.query('SELECT * FROM public.techmoney_portal_leads')).rows;
const consent=stored[0].marketing_consent_at;
assert.ok(consent);assert.equal(stored[0].marketing_consent_version,'invest-insights-v1');
await save('user_alpha','pessoa@empresa.com.br',true);
stored=(await db.query('SELECT * FROM public.techmoney_portal_leads')).rows;
assert.equal(stored[0].created_at.toISOString(),first.toISOString());
assert.equal(stored[0].marketing_consent_at.toISOString(),consent.toISOString());
await save('user_alpha','pessoa@empresa.com.br',false);
stored=(await db.query('SELECT * FROM public.techmoney_portal_leads')).rows;
assert.equal(stored[0].marketing_consent_at,null);
await assert.rejects(()=>save('user_beta'), error=>error.code==='23505');
assert.equal((await get('user_beta')).registered,false);
assert.equal((await db.query('SELECT count(*) AS n FROM public.leads')).rows[0].n,1);
assert.equal((await db.query('SELECT cooperativa FROM public.leads')).rows[0].cooperativa,'Coop Exemplo');
const consolidated=(await db.query('SELECT * FROM public.techmoney_leads_consolidados')).rows;
assert.equal(consolidated.length,1);assert.deepEqual(consolidated[0].origens,['coop','invest']);
await save('user_gamma','outro@outraempresa.com.br');
assert.equal((await db.query('SELECT count(*) AS n FROM public.leads')).rows[0].n,1);
assert.equal((await db.query('SELECT count(*) AS n FROM public.techmoney_leads_consolidados')).rows[0].n,2);
for(const role of ['anon','authenticated']){
  await db.exec(`SET ROLE ${role}`);
  await assert.rejects(()=>get('user_alpha'),error=>error.code==='42501');
  await assert.rejects(()=>save('user_alpha'),error=>error.code==='42501');
  await assert.rejects(()=>db.query('SELECT * FROM public.techmoney_portal_leads'),error=>error.code==='42501');
  await assert.rejects(()=>db.query('SELECT * FROM public.techmoney_leads_consolidados'),error=>error.code==='42501');
  await db.exec('RESET ROLE');
}
await db.exec('SET ROLE service_role');
assert.equal((await get('user_alpha')).registered,true);
await db.exec('RESET ROLE');
await db.close();
console.log('POSTGRES_LEAD_TESTS_OK: migration rerun, concurrent upsert, email collision, consent, unified view, Coop isolation and role permissions');
