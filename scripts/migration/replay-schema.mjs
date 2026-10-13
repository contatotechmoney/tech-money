import { PGlite } from '@electric-sql/pglite';
import { readFileSync, writeFileSync } from 'node:fs';
const db=new PGlite();
try {
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
 await db.exec(readFileSync('supabase/empty-project-baseline.sql','utf8'));
 const tables=await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
 const controls=await db.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname");
 writeFileSync('supabase/replay-result.json',JSON.stringify({passed:true,synthetic:true,productionChanged:false,tables:tables.rows,triggers:controls.rows},null,2));
 console.log(JSON.stringify({passed:true,tables:tables.rows.length,triggers:controls.rows.length}));
}finally{await db.close()}
