import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const keys={suitability_profiles:'id',portfolio_simulation_studies:'id',investment_simulation_studies:'id',investment_reports:'id'};
// Offline SQL generator. Only reviewed tables; no connection, grants, owner rewrite or execution toggle.
export function prepareRecordRestore(archive){
 if(!archive||typeof archive!=='object'||Array.isArray(archive)||Object.keys(archive).some(k=>!keys[k]))throw Error('UNSUPPORTED_ARCHIVE');
 let sql="BEGIN;\nSET LOCAL statement_timeout='30s';\nSET LOCAL lock_timeout='5s';\n";
 for(const [table,rows] of Object.entries(archive)){
  if(!Array.isArray(rows)||rows.some(r=>!r||typeof r.id!=='string'||typeof r.user_id!=='string')||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('INVALID_RECORDS');
  const data=JSON.stringify(rows);if(data.includes('$restore_data$'))throw Error('INVALID_DELIMITER');
  sql+=`LOCK TABLE public.${table} IN SHARE ROW EXCLUSIVE MODE;\nCREATE TEMP TABLE restore_${table} ON COMMIT DROP AS SELECT * FROM jsonb_populate_recordset(NULL::public.${table},$restore_data$${data}$restore_data$::jsonb);\n`;
  sql+=`DO $check$ BEGIN IF EXISTS(SELECT 1 FROM restore_${table} i JOIN public.${table} d USING(id) WHERE to_jsonb(i) IS DISTINCT FROM to_jsonb(d)) THEN RAISE EXCEPTION 'RESTORE_CONFLICT_${table}'; END IF; END $check$;\n`;
  sql+=`INSERT INTO public.${table} SELECT i.* FROM restore_${table} i WHERE NOT EXISTS(SELECT 1 FROM public.${table} d WHERE d.id=i.id);\n`;
  sql+=`DO $check$ BEGIN IF EXISTS(SELECT * FROM restore_${table} EXCEPT SELECT * FROM public.${table}) THEN RAISE EXCEPTION 'RESTORE_MISMATCH_${table}'; END IF; END $check$;\n`;
 }
 return sql+'COMMIT;\n';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv.length!==4)throw Error('Use input-private.json output-private.sql');writeFileSync(process.argv[3],prepareRecordRestore(JSON.parse(readFileSync(process.argv[2],'utf8'))),{mode:0o600});console.log('Private transaction prepared; not applied.');}
