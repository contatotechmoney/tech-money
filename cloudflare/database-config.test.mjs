import test from 'node:test';import assert from 'node:assert/strict';
import {supabaseDatabaseConfig as config} from './database-config.mjs';
const valid='postgresql://postgres:synthetic@db.igxtlcbyucshupsldijj.supabase.co:5432/postgres?sslmode=verify-full';
test('refuses unconfigured and unrelated databases',()=>{assert.throws(()=>config({}));assert.throws(()=>config({INVEST_DATABASE_URL:valid.replace('igxtlcbyucshupsldijj','anotherproject')}))});
test('does not weaken certificate checks',()=>{for(const mode of ['disable','require','prefer'])assert.throws(()=>config({INVEST_DATABASE_URL:valid.replace('verify-full',mode)}));assert.equal(config({INVEST_DATABASE_URL:valid}).ssl.rejectUnauthorized,true)});
test('pooler must identify exact project and require credentials',()=>{const pool=valid.replace('postgres:synthetic@db.igxtlcbyucshupsldijj.supabase.co','postgres.igxtlcbyucshupsldijj:synthetic@aws-0-us-east-1.pooler.supabase.com');assert.equal(config({INVEST_DATABASE_URL:pool}).max,2);assert.throws(()=>config({INVEST_DATABASE_URL:pool.replace('postgres.igxtlcbyucshupsldijj','postgres.other')}));});

import {migrationDatabaseConfig} from './database-config.mjs';
test('missing sslmode defaults to full certificate verification',()=>{
 const result=config({INVEST_DATABASE_URL:valid.split('?')[0]});
 assert.equal(new URL(result.connectionString).searchParams.get('sslmode'),'verify-full');
 assert.equal(result.ssl.rejectUnauthorized,true);
});
test('Hyperdrive requires project attestation and never falls back to direct secrets',()=>{
 assert.throws(()=>migrationDatabaseConfig({INVEST_DATABASE_URL:valid}));
 assert.throws(()=>migrationDatabaseConfig({INVEST_DATABASE:{connectionString:'postgresql://synthetic'},INVEST_DATABASE_PROJECT:'other'}));
 assert.equal(migrationDatabaseConfig({INVEST_DATABASE:{connectionString:'postgresql://synthetic'},INVEST_DATABASE_PROJECT:'igxtlcbyucshupsldijj'}).connectionString,'postgresql://synthetic');
});
