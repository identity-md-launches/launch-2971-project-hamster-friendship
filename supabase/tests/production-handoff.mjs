// Real local PostgreSQL only. These are NOT hosted production test results.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHarness} from './major-harness.mjs';
import {prepare} from '../../scripts/prepare-supabase.mjs';
const results=[];
for(const version of [0,1,2,3,4,5,6,7]){
 const h=await createHarness(version);
 try{
  await h.db.exec(await readFile('supabase/inspect_production.sql','utf8'));
  let before;
  if(version>=3){
   const user=await h.identity();
   // 003–004 stored old flat claims; exercise each historical schema as installed.
   if(version<=4)await h.admin("update auth.identities set identity_data=jsonb_build_object('address',$1::text,'chain','ethereum') where user_id=$2",[user.wallet,user.id]);
   await h.rpc(user,'hf_wallet_profile');
   await h.admin("update hf_private.profiles set sqk=275,total_score=1400,name='Retained Player' where user_id=$1",[user.id]);
   await h.admin("insert into hf_private.purchases(user_id,item,paid) values($1,'costume-batman',50)",[user.id]);
   before=(await h.admin('select user_id,name,sqk,total_score,cosmetics from hf_private.profiles')).rows;
  }
  await h.db.exec(await prepare(version));
  assert.deepEqual((await h.admin('select public.hf_service_status() as s')).rows[0].s,{schemaVersion:7,rulesVersion:6,leaderboard:'lifetime'});
  if(before)assert.deepEqual((await h.admin('select user_id,name,sqk,total_score,cosmetics from hf_private.profiles')).rows,before);
  for(const file of ['supabase/verify_major.sql','supabase/verify_production.sql']){
   const checks=await h.db.exec(await readFile(file,'utf8'));
   for(const result of checks)for(const row of result.rows)for(const value of Object.values(row))if(typeof value==='boolean')assert.equal(value,true,file+' '+JSON.stringify(row));
  }
  await h.db.exec(await readFile('supabase/test_access.sql','utf8'));
  if(version<7){const replay=await prepare(version);await assert.rejects(()=>h.db.exec(replay),/Expected|differs/);await h.db.exec('rollback');}
  results.push({name:'Inspect and upgrade schema '+version+' → 7; preserve existing records; reject replay',passed:true});console.log('ok',results.at(-1).name);
 }finally{await h.close();}
}
const h=await createHarness(2);
try{
 const empty=await prepare(0),one=await prepare(1);
 await assert.rejects(()=>h.db.exec(empty),/Expected an empty/);await h.db.exec('rollback');
 await assert.rejects(()=>h.db.exec(one),/differs/);await h.db.exec('rollback');
 assert.equal((await h.admin("select count(*)::int as n from information_schema.columns where table_schema='hf_private' and column_name='lifetime_credited'")).rows[0].n,0);
 results.push({name:'Wrong version selection aborts without applying later columns',passed:true});console.log('ok',results.at(-1).name);
}finally{await h.close();}
await mkdir('test/scratch/integration',{recursive:true});await writeFile('test/scratch/integration/handoff.json',JSON.stringify({results,limitations:['Disposable PostgreSQL with explicit Auth fixtures; no production SQL executed.']},null,2));
