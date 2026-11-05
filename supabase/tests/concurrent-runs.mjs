// Independent browser stores, actual engine/save client and PostgreSQL RPCs.
// Auth identities, elapsed time and HTTP are explicit local test fixtures.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fixture} from '../../scripts/major-fixture.mjs';
import {createHarness} from './major-harness.mjs';
const h=await createHarness(6),results=[];
const config={supabaseUrl:'https://fixture.invalid',supabasePublishableKey:'fixture-public'};
const prefix='hamster-friendship-v2';
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
async function device(user,storage=new Map()){
 storage.set(prefix+'-wallet-session-'+user.wallet.toLowerCase(),JSON.stringify({access_token:user.id,refresh_token:user.id,expires_at:Date.now()/1000+3600}));
 const net={offline:false,loseReply:false};
 const f=await fixture({storage,config,fetch:async(url,options)=>{
  if(net.offline)throw Error('Test device is offline');
  const name=new URL(url).pathname.split('/').pop(),body=JSON.parse(options.body||'{}');
  try {
   const data=await h.rpc(options.headers.Authorization?user:null,name,body);
   if(net.loseReply&&name==='hf_progress'){net.loseReply=false;throw Error('Test reply lost after commit');}
   return {ok:true,json:async()=>data};
  }catch(error){return {ok:false,json:async()=>({message:error.message})};}
 }});
 await f.ctx.HamsterSave.setWallet(user.wallet);
 return {...f,net,save:f.ctx.HamsterSave};
}
const queue=d=>JSON.parse([...d.storage.entries()].find(([key])=>key.includes('-run-outbox-'))[1]);
async function fruit(d,source='trail-0'){
 const food=d.t.pickups.find(k=>k.forage===source);d.t.game.frames=90;d.t.player.x=food.x;d.t.player.y=food.y;d.t.updatePickups();await d.save.flush();
}
try {
 const a=await h.identity(),alias=await h.identity(a.wallet.toUpperCase().replace('0X','0x'));
 await h.rpc(a,'hf_wallet_profile');await h.rpc(alias,'hf_wallet_profile');
 await h.admin("update hf_private.profiles set name='Preserved Friend',total_score=1400,sqk=275,highest_map=4 where user_id=$1",[a.id]);
 const old=await h.rpc(a,'hf_start_run_v4',{p_map:1});
 await h.rpc(a,'hf_progress',{p_run:old.id,p_events:[{kind:'forage',source:'basket',seq:1,frame:0}]});
 await check('007 preserves populated records, pending legacy run, validator and RLS/grants',async()=>{
  const snapshot=await readFile('supabase/preservation_snapshot.sql','utf8');await h.admin('select 1');
  const before=await h.db.exec(snapshot),runs=await h.admin('select to_jsonb(r) as record from hf_private.runs r order by id');
  const validator=await h.admin("select pg_get_functiondef('public.hf_progress(uuid,jsonb)'::regprocedure) as definition");
  await h.db.exec(await readFile('supabase/migrations/007_concurrent_runs.sql','utf8'));
  assert.deepEqual(await h.db.exec(snapshot),before);assert.deepEqual(await h.admin('select to_jsonb(r) as record from hf_private.runs r order by id'),runs);
  assert.deepEqual(await h.admin("select pg_get_functiondef('public.hf_progress(uuid,jsonb)'::regprocedure) as definition"),validator);
  const checks=await h.db.exec(await readFile('supabase/verify_major.sql','utf8'));for(const result of checks)for(const row of result.rows)for(const value of Object.values(row))if(typeof value==='boolean')assert.equal(value,true);
 });
 const one=await device(a),two=await device(alias);let first,second;
 await check('another device starting and saving cannot abandon an offline run or strand its actual fruit event',async()=>{
  await one.t.startGame(1,true);one.net.offline=true;await fruit(one);first=queue(one);
  assert.equal(first.events.length,1);assert.deepEqual(first.events[0],{source:'trail-0',kind:'forage',frame:90,seq:1});
  assert.equal(one.save.snapshot().pendingEvents,1);
  await two.t.startGame(1,true);two.net.offline=true;await fruit(two,'trail-1');second=queue(two);two.net.offline=false;await two.save.retry();
  assert.equal((await h.rpc(a,'hf_run_state',{p_run:first.id})).status,'active');
  assert.equal((await h.rpc(a,'hf_run_state',{p_run:second.id})).status,'active');
  one.net.offline=false;await one.save.retry();
  assert.equal(one.save.snapshot().pendingEvents,0);assert.equal(one.save.snapshot().runConflict,false);assert.equal(one.save.snapshot().recoveryEvents,0);
  const p=await h.rpc(a,'hf_wallet_profile');assert.equal(p.total_score,1402);assert.equal(p.produce_points,2);assert.equal(p.sqk,275);
 });
 await check('independent run retries and lost replies credit each source once into the shared lifetime ledger',async()=>{
  one.net.loseReply=true;await fruit(one,'trail-2');assert.equal(one.save.snapshot().pendingEvents,1);
  await one.save.retry();await one.save.retry();await two.save.retry();
  assert.equal((await h.rpc(a,'hf_wallet_profile')).total_score,1403);
  await h.rpc(alias,'hf_progress',{p_run:first.id,p_events:first.events});
  assert.equal((await h.rpc(a,'hf_wallet_profile')).total_score,1403);
  const ledger=await h.admin('select sum(points)::int as n,count(*)::int as runs from hf_private.lifetime_entries where profile_id=$1',[a.id]);
  assert.deepEqual(ledger.rows[0],{n:3,runs:2});assert.equal(one.save.snapshot().recoveryEvents,0);
 });
 await check('another run finishing leaves a refreshed offline queue uploadable and both totals permanent',async()=>{
  one.net.offline=true;await fruit(one,'trail-7');const saved=queue(one);
  await h.admin("update hf_private.runs set started_at=clock_timestamp()-interval '2 hours',hp[31]=0 where id=$1",[second.id]);
  await h.rpc(alias,'hf_progress',{p_run:second.id,p_events:[{kind:'finish',seq:2,frame:3600}]});
  const third=await h.rpc(alias,'hf_start_run_v6',{p_map:2});
  assert.equal((await h.rpc(a,'hf_run_state',{p_run:first.id})).status,'active');
  const reload=await device(a,one.storage);assert.equal(reload.save.snapshot().pendingEvents,0);assert.equal(reload.save.snapshot().runConflict,false);
  assert.equal((await h.rpc(a,'hf_wallet_profile')).total_score,1404);
  assert.equal((await h.rpc(a,'hf_run_state',{p_run:first.id})).ack,saved.events.at(-1).seq);
  await h.rpc(a,'hf_progress',{p_run:first.id,p_events:[{kind:'death',seq:4,frame:90}]});
  assert.equal((await h.rpc(alias,'hf_run_state',{p_run:third.id})).status,'active');
  await h.rpc(alias,'hf_progress',{p_run:first.id,p_events:[{kind:'death',seq:4,frame:90}]});
  assert.equal((await h.rpc(a,'hf_wallet_profile')).total_score,1404);
 });
 await check('legacy starts preserve new devices while retaining legacy settlement and its single-active-run constraint',async()=>{
  const run=await h.rpc(a,'hf_start_run_v6',{p_map:1});
  assert.equal((await h.rpc(a,'hf_run_state',{p_run:old.id})).status,'active');
  await h.rpc(a,'hf_progress',{p_run:old.id,p_events:[{kind:'forage',source:'log',seq:2,frame:0},{kind:'death',seq:3,frame:0}]});
  assert.equal((await h.rpc(a,'hf_wallet_profile')).total_score,1408);
  const legacy=await h.rpc(alias,'hf_start_run_v4',{p_map:1});
  await h.rpc(a,'hf_progress',{p_run:legacy.id,p_events:[{kind:'forage',source:'basket',seq:1,frame:0}]});
  await h.rpc(alias,'hf_start_run_v4',{p_map:1});
  assert.equal((await h.rpc(a,'hf_run_state',{p_run:legacy.id})).status,'abandoned');
  assert.equal((await h.rpc(a,'hf_run_state',{p_run:run.id})).status,'active');
  assert.equal((await h.rpc(a,'hf_wallet_profile')).total_score,1410);
  assert.equal((await h.admin("select count(*)::int as n from hf_private.runs where user_id=$1 and rules_version<>6 and status='active'",[a.id])).rows[0].n,1);
 });
 await check('interleaved runs retain ownership, timing, ordered sequence, score and terminal checks',async()=>{
  const foreign=await h.identity();await h.rpc(foreign,'hf_wallet_profile');
  const r=await h.rpc(a,'hf_start_run_v6',{p_map:1}),s=await h.rpc(alias,'hf_start_run_v6',{p_map:1});
  await assert.rejects(()=>h.rpc(foreign,'hf_progress',{p_run:r.id,p_events:[{kind:'forage',source:'chest',seq:1,frame:0}]}),/does not belong/);
  for(const ev of [{kind:'forage',source:'chest',seq:2,frame:0},{kind:'forage',source:'chest',seq:1,frame:1000000},{kind:'set_score',score:999999,seq:1,frame:0},{kind:'forage',source:'made-up',seq:1,frame:0}])await assert.rejects(()=>h.rpc(a,'hf_progress',{p_run:r.id,p_events:[ev]}));
  await Promise.all([r,s].map(run=>h.rpc(a,'hf_progress',{p_run:run.id,p_events:[{kind:'forage',source:'chest',seq:1,frame:0}]})));
  await assert.rejects(()=>h.rpc(a,'hf_progress',{p_run:r.id,p_events:[{kind:'forage',source:'chest',seq:2,frame:0}]}),/already collected/);
  await h.rpc(a,'hf_progress',{p_run:r.id,p_events:[{kind:'death',seq:2,frame:0}]});
  await assert.rejects(()=>h.rpc(a,'hf_progress',{p_run:r.id,p_events:[{kind:'forage',source:'log',seq:3,frame:0}]}),/already ended/);
  const p=await h.rpc(a,'hf_wallet_profile');assert.equal(p.total_score,1422);assert.equal(p.produce_points,16);
  const board=await h.rpc(null,'hf_lifetime_top100');assert.equal(board.rows.length,1);assert.equal(board.rows[0].score,p.total_score);
  assert.equal((await h.admin('select count(*)::int as n from hf_private.wallet_profiles where profile_id=$1',[a.id])).rows[0].n,1);
 });
 await mkdir('test/scratch/revision',{recursive:true});await writeFile('test/scratch/revision/concurrent-results.json',JSON.stringify({results,limitations:['Auth, HTTP, position and time fixtures; actual engine/save/SQL functions.','Single PostgreSQL connection: interleaving tested, independent connection lock contention not exercised.']},null,2));
 console.log(results.length+' concurrent-run checks passed.');
}finally{await h.close();}
