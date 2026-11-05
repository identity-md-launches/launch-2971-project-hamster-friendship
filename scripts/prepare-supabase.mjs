// Produce exact SQL Editor input from the unchanged historical migrations.
// --after is the version an administrator verified with inspect_production.sql.
// This script has no database connection and executes no production SQL.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const names=['001_friendship','002_seasons_dice_badges','003_squeek','004_lifetime_persistence','005_verified_wallet_recovery','006_four_worlds','007_concurrent_runs','008_reward_guard','009_deferred_rewards'];
// 009 keeps the browser's schemaVersion 7 contract and reports itself as "migration".
const FINAL='{"schemaVersion":7,"rulesVersion":6,"leaderboard":"lifetime","migration":9}';
export async function prepare(after) {
 if(!Number.isInteger(after)||after<0||after>8)throw Error('Specify --after 0–8, using the inspected installed version (9 is current: nothing to apply).');
 const marker=after===0 ? `if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='hf_private' or (n.nspname='public' and c.relname in ('profiles','players','player_profiles','leaderboard','inventory','purchases','runs'))) or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','hf_private') and left(p.proname,3)='hf_') then raise exception 'Expected an empty application schema. Inspect existing objects; do not replay migration 001.'; end if;`
 : after<4 ? `if to_regclass('hf_private.profiles') is null or to_regclass('hf_private.runs') is null then raise exception 'Expected the installed base schema.'; end if;
 if (to_regclass('hf_private.badges') is not null) <> ${after>=2} or (to_regclass('hf_private.wallet_profiles') is not null) <> ${after>=3} or exists(select 1 from information_schema.columns where table_schema='hf_private' and table_name='runs' and column_name='lifetime_credited') or to_regprocedure('public.hf_service_status()') is not null then raise exception 'Installed schema differs from the selected version. Inspect before applying.'; end if;`
 : `if to_regprocedure('public.hf_service_status()') is null then raise exception 'Expected service status for schema ${after}.'; end if;
 execute 'select public.hf_service_status()' into service;
 if coalesce(service->>'migration',service->>'schemaVersion') is distinct from '${after}' or service->>'leaderboard' is distinct from 'lifetime' then raise exception 'Installed service version differs from ${after}: %',service; end if;`;
 let sql=`-- Project: nhtlwcukeyhvkrjveots. Run ONLY in this project's SQL Editor.\n-- Generated from unchanged migration sources; no credentials are required.\n-- Administrator inspected installed version: ${after}.\n-- Back up and save inspect_production.sql results before running.\n-- One transaction: a wrong version, partial schema, lock timeout or SQL error rolls back.\nbegin;\nset local lock_timeout='5s';\nset local statement_timeout='120s';\nselect pg_advisory_xact_lock(hashtextextended('squeek:schema-migrations',0));\ndo $guard$\ndeclare service jsonb;\nbegin\n ${marker}\nend;\n$guard$;\n`;
 for(const name of names.slice(after)){
  const source=await readFile(new URL('../supabase/migrations/'+name+'.sql',import.meta.url),'utf8');
  if(!/^begin;$/mi.test(source)||!/^commit;\s*$/mi.test(source))throw Error('Unexpected migration transaction format: '+name);
  const body=source.replace(/^begin;\s*$/mi,'').replace(/^commit;\s*$/mi,'');
  sql+=`\n-- ${name}.sql · SHA-256 ${createHash('sha256').update(source).digest('hex')}\n${body}\n`;
 }
 sql+=`\n-- Assert the final version before committing any change.\ndo $verify$\nbegin\n if public.hf_service_status() <> '${FINAL}'::jsonb then raise exception 'Unexpected final service version.'; end if;\nend;\n$verify$;\nnotify pgrst,'reload schema';\ncommit;\n`;
 return sql;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),v=args.indexOf('--after'),o=args.indexOf('--out');
 if(v<0||!/^[0-8]$/.test(args[v+1]||''))throw Error('Usage: node scripts/prepare-supabase.mjs --after <inspected version 0–8> [--out artifacts/supabase-apply-missing.sql]');
 const path=resolve(o<0?'artifacts/supabase-apply-missing.sql':args[o+1]);
 const sql=await prepare(Number(args[v+1]));await mkdir(dirname(path),{recursive:true});await writeFile(path,sql);
 console.log('Prepared '+path+'; production SQL was NOT executed.');
}
