import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const journal=JSON.parse(readFileSync('migrations/meta/_journal.json','utf8'));
const entries=journal.entries.map(entry=>{
 const file=`migrations/${entry.tag}.sql`;
 const sql=readFileSync(file,'utf8');
 if(/\b(?:TRUNCATE|DROP\s+DATABASE)\b/i.test(sql))throw new Error('Unsafe baseline statement: '+file);
 return {file,sql,sha256:createHash('sha256').update(sql).digest('hex')};
});
const header='-- NEW EMPTY MIGRATION PROJECT ONLY. Not an incremental production migration.\n-- Historical SQL includes internal table rebuilds: never run against existing data.\n-- Apply only after isolated replay and verified backup/restore. No credentials or owner grants.\nBEGIN;\n';
const body=entries.map(e=>`\n-- Source: ${e.file}; SHA256: ${e.sha256}\n${e.sql.replaceAll('--> statement-breakpoint','')}`).join('\n');
// Defense in depth: Data API stays disabled, and its roles receive no table access.
const lockdown=`\nREVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;\nREVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;\nREVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;\nALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;\nALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;\nALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;\nCOMMIT;\n`;
writeFileSync('supabase/empty-project-baseline.sql',header+body+lockdown);
writeFileSync('supabase/baseline-manifest.json',JSON.stringify({projectRef:'igxtlcbyucshupsldijj',sourceCommit:'5ebdbffa405bf6d059353d14a48461f1028ea72a',applied:false,requiresEmptyDatabase:true,entries:entries.map(({sql,...e})=>e)},null,2)+'\n');
console.log(`Prepared ${entries.length} migrations in journal order; not applied.`);
