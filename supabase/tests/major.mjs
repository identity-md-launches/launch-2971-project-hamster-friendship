import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHarness} from './major-harness.mjs';
const h=await createHarness(5),results=[];
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
try {
 const a=await h.identity(),alias=await h.identity(a.wallet.toUpperCase().replace('0X','0x')),b=await h.identity(),unverified=await h.identity(undefined,false);
 await h.rpc(a,'hf_wallet_profile');await h.admin("update hf_private.profiles set name='Preserved Friend',sqk=275,total_score=1400,highest_map=8,cosmetics='{\"costume\":\"costume-batman\"}' where user_id=$1",[a.id]);
 await h.admin("insert into hf_private.purchases(user_id,item,paid) values($1,'costume-batman',50)",[a.id]);
 const oldRun=await h.rpc(a,'hf_start_run_v4',{p_map:1});await h.rpc(a,'hf_progress',{p_run:oldRun.id,p_events:[{kind:'forage',source:'chest',seq:1,frame:0}]});
 const snapshot=await readFile('supabase/preservation_snapshot.sql','utf8');await h.admin('select 1');const before=await h.db.exec(snapshot);
 await check('006 and 007 preserve every profile, wallet, balance, inventory and historical score fingerprint',async()=>{
  await h.db.exec(await readFile('supabase/migrations/006_four_worlds.sql','utf8'));assert.deepEqual(await h.db.exec(snapshot),before);
  await h.db.exec(await readFile('supabase/migrations/007_concurrent_runs.sql','utf8'));assert.deepEqual(await h.db.exec(snapshot),before);
  const p=await h.rpc(a,'hf_wallet_profile');assert.equal(p.sqk,275);assert.equal(p.total_score,1400);assert.equal(p.highest_map,8);assert.deepEqual(p.purchases,['costume-batman']);assert.equal(p.produce_points,0);
 });
 await check('pre-upgrade pending events still settle once through the original v4 protocol',async()=>{
  const events=[{kind:'forage',source:'basket',seq:2,frame:0},{kind:'death',seq:3,frame:0}];
  assert.equal((await h.rpc(a,'hf_progress',{p_run:oldRun.id,p_events:events})).profile.total_score,1408);
  assert.equal((await h.rpc(a,'hf_progress',{p_run:oldRun.id,p_events:events})).profile.total_score,1408);
 });
 await check('same verified wallet and concurrent profile opens return one original profile',async()=>{
  const profiles=await Promise.all(Array.from({length:12},(_,i)=>h.rpc(i%2?a:alias,'hf_wallet_profile')));assert(profiles.every(p=>p.name==='Preserved Friend'&&p.sqk===275));
  assert.equal((await h.admin('select count(*)::int as n from hf_private.wallet_profiles where wallet=$1',[a.wallet])).rows[0].n,1);
 });
 await check('unverified users, forged metadata and anonymous clients cannot create ranked profiles',async()=>{
  await h.admin('update auth.users set raw_user_meta_data=$2::jsonb where id=$1',[unverified.id,JSON.stringify({address:a.wallet,chain:'ethereum'})]);
  for(const u of [null,unverified])await assert.rejects(()=>h.rpc(u,'hf_wallet_profile'),/permission denied|Sign in with your wallet/);
 });
 const run=await h.rpc(a,'hf_start_run_v6',{p_map:1});
 await check('acknowledged produce points checkpoint immediately and replay cannot double-credit',async()=>{
  const events=[{kind:'forage',source:'chest',seq:1,frame:0}];const p=(await h.rpc(a,'hf_progress',{p_run:run.id,p_events:events})).profile;
  assert.equal(p.total_score,1414);assert.equal(p.produce_points,6);assert.equal((await h.rpc(alias,'hf_wallet_profile')).total_score,1414);
  assert.deepEqual((await h.rpc(a,'hf_progress',{p_run:run.id,p_events:events})).profile,p);
  assert.equal((await h.rpc(null,'hf_lifetime_top100')).rows[0].score,1414);
 });
 await check('second-device start leaves the first run active; its own death settles points only once',async()=>{
  await h.rpc(alias,'hf_start_run_v6',{p_map:2});assert.equal((await h.rpc(a,'hf_wallet_profile')).total_score,1414);
  const state=await h.rpc(a,'hf_run_state',{p_run:run.id});assert.equal(state.status,'active');assert.equal(state.ack,1);
  await h.rpc(a,'hf_progress',{p_run:run.id,p_events:[{kind:'death',seq:2,frame:0}]});
  await h.rpc(a,'hf_progress',{p_run:run.id,p_events:[{kind:'death',seq:2,frame:0}]});
  assert.equal((await h.rpc(a,'hf_wallet_profile')).total_score,1414);
  await assert.rejects(()=>h.rpc(a,'hf_progress',{p_run:run.id,p_events:[{kind:'forage',source:'log',seq:3,frame:0}]}),/already ended/);
 });
 await check('all four SQL maps match their duration, enemy families, HP and boss-only progression',async()=>{
  const families=[['moth','wasp','gnat'],['frost','penguinling'],['drake','cinder'],['reef','ray']];
  for(let map=1;map<=4;map++) {
   const r=await h.rpc(a,'hf_start_run_v6',{p_map:map});assert.equal(r.rulesVersion,6);assert.equal(r.monsters.length,30);assert(r.monsters.every(m=>families[map-1].includes(m.type)));
   assert(r.monsters.every(m=>m.hp===Math.ceil((m.size==='small'?50:100)*1.2**(map-1))));
   const duration=[60,90,120,150][map-1]*60;
   await h.admin("update hf_private.runs set started_at=clock_timestamp()-interval '1 hour',hp[31]=0 where id=$1",[r.id]);
   await assert.rejects(()=>h.rpc(a,'hf_progress',{p_run:r.id,p_events:[{kind:'finish',seq:1,frame:duration-1}]}),/Defeat this map boss/);
   const result=await h.rpc(a,'hf_progress',{p_run:r.id,p_events:[{kind:'finish',seq:1,frame:duration}]});assert.equal(result.ack,1);
   assert.equal((await h.rpc(a,'hf_run_state',{p_run:r.id})).status,'complete');
  }
  await assert.rejects(()=>h.rpc(a,'hf_start_run_v6',{p_map:5}),/unlocked map/);
 });
 await check('RLS and grants deny direct writes; event validators reject arbitrary totals, repeats and foreign runs',async()=>{
  await h.rpc(b,'hf_wallet_profile');const r=await h.rpc(a,'hf_start_run_v6',{p_map:1});
  await assert.rejects(()=>h.rpc(b,'hf_progress',{p_run:r.id,p_events:[{kind:'death',seq:1,frame:0}]}),/does not belong/);
  for(const ev of [{kind:'set_score',score:999999,seq:1,frame:0},{kind:'forage',source:'invented',seq:1,frame:0},{kind:'forage',source:'chest',seq:2,frame:0},{kind:'forage',source:'chest',seq:1,frame:100000}]) await assert.rejects(()=>h.rpc(a,'hf_progress',{p_run:r.id,p_events:[ev]}));
  await h.rpc(a,'hf_progress',{p_run:r.id,p_events:[{kind:'forage',source:'chest',seq:1,frame:0}]});
  await assert.rejects(()=>h.rpc(a,'hf_progress',{p_run:r.id,p_events:[{kind:'forage',source:'chest',seq:2,frame:0}]}),/already collected/);
  await h.exclusive(async()=>{await h.db.exec('reset role; set role authenticated');for(const sql of ['update hf_private.profiles set total_score=999999','select * from hf_private.runs',"insert into hf_private.lifetime_entries(run_id,profile_id,points) values(gen_random_uuid(),gen_random_uuid(),999)"])await assert.rejects(()=>h.db.query(sql),/permission denied/);});
  const policies=await h.admin("select bool_and(relrowsecurity) as protected from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='hf_private' and c.relkind='r'");assert.equal(policies.rows[0].protected,true);
 });
 await check('Top 100 is global, capped and ordered by permanent SQL totals without wallet disclosure',async()=>{
  for(let i=0;i<105;i++){const u=await h.identity();await h.rpc(u,'hf_wallet_profile');await h.admin('update hf_private.profiles set name=$2,total_score=$3 where user_id=$1',[u.id,'SQL Fixture '+i,3000+i]);}
  const board=await h.rpc(null,'hf_lifetime_top100');assert.equal(board.rows.length,100);assert.equal(board.rows[0].score,3104);assert.equal(board.rows.at(-1).score,3005);assert(!JSON.stringify(board).includes(a.wallet));
 });
 await check('legacy ticket migration retains a verified server balance; existing wallet always wins',async()=>{
  const legacy=await h.identity(undefined,false);await h.admin("insert into hf_private.profiles(user_id,name,total_score,sqk) values($1,'Legacy Friend',510,60)",[legacy.id]);
  const {ticket}=await h.rpc(legacy,'hf_prepare_legacy');const fresh=await h.identity();const linked=await h.rpc(fresh,'hf_wallet_profile',{p_legacy:ticket});assert.equal(linked.total_score,510);assert.equal(linked.sqk,60);
  const original=await h.rpc(a,'hf_wallet_profile',{p_legacy:ticket});assert.equal(original.name,'Preserved Friend');assert.equal(original.sqk,275);
 });
 await check('the delivered read-only owner verification SQL passes every permission and checkpoint assertion',async()=>{
  await h.admin('select 1');const checks=await h.db.exec(await readFile('supabase/verify_major.sql','utf8'));let booleans=0;for(const result of checks)for(const row of result.rows)for(const value of Object.values(row))if(typeof value==='boolean'){assert.equal(value,true);booleans++;}assert(booleans>=10);
 });
 await mkdir('test/scratch/major',{recursive:true});await writeFile('test/scratch/major/sql-results.json',JSON.stringify({results,limitations:['Auth identity fixtures; no hosted Supabase/signature validation.','Single PostgreSQL connection; independent-connection lock contention not exercised.']},null,2));
 console.log(results.length+' major SQL checks passed.');
} finally {await h.close();}
