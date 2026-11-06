// Disposable PostgreSQL. Administrative score fixtures test settlement/backfill;
// actual replay tests below separately verify that clients cannot submit totals.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHarness} from './major-harness.mjs';
import {replayDevice,replayRpc,tick,queued} from './replay-fixture.mjs';
import {prepare} from '../../scripts/prepare-supabase.mjs';
import {replayEngine} from '../functions/_shared/replay.js';
const results=[];
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
const migration=await readFile('supabase/migrations/011_personal_best.sql','utf8');
const h=await createHarness(10);
async function execute(harness,sql){await harness.admin('reset role');return harness.db.exec(sql);}
async function row(sql,args=[]){return (await h.admin(sql,args)).rows[0];}
async function scoreRun(user,score,status='dead'){
 const r=await h.rpc(user,'hf_start_run_v6',{p_map:1});
 await h.admin('update hf_private.runs set score=$2,status=$3 where id=$1',[r.id,score,status]);return r.id;
}
try{
 const a=await h.identity(),b=await h.identity();await h.rpc(a,'hf_wallet_profile');await h.rpc(b,'hf_wallet_profile');
 await h.rpc(a,'hf_profile',{p_name:'Best keeper'});await h.rpc(b,'hf_profile',{p_name:'Other keeper'});
 const runs=[];for(const score of [5000,8000,6000])runs.push(await scoreRun(a,score));
 await scoreRun(b,7000);
 const old=await h.identity();await h.rpc(old,'hf_wallet_profile');const oldRun=await h.rpc(old,'hf_start_run_v6',{p_map:1});
 await replayRpc(h,old,oldRun.id,[{kind:'forage',source:'basket',frame:15,seq:1,inputs:[
  {frame:0,ticks:15,held:2,pressed:0,touch:false,x:0,y:0,weapon:'shell'},
  {frame:15,ticks:1,held:0,pressed:16,touch:false,x:0,y:0,weapon:'shell'}]}]);
 await h.admin("update hf_private.profiles set sqk=150,highest_map=3,cosmetics='{"+'"costume":"costume-batman"'+"}'::jsonb where user_id=$1",[a.id]);
 await h.admin("insert into hf_private.purchases(user_id,item,paid) values($1,'costume-batman',50)",[a.id]);
 const snapshot=async()=>({
  profiles:(await h.admin("select user_id,to_jsonb(p)-'total_score'-'updated_at' as data from hf_private.profiles p order by user_id")).rows,
  runs:(await h.admin("select id,to_jsonb(r)-'replay_engine' as data from hf_private.runs r order by id")).rows,
  wallets:(await h.admin('select * from hf_private.wallet_profiles order by profile_id')).rows,
  purchases:(await h.admin('select * from hf_private.purchases order by user_id,item')).rows,
  ledger:(await h.admin('select * from hf_private.lifetime_entries order by run_id')).rows
 });
 const before=await snapshot();assert.equal((await h.rpc(a,'hf_profile')).total_score,19000);
 await check('011 backfills 5000/8000/6000 to 8000 and archives the original 19000 without changing identity, SQK, inventory, runs or ledger',async()=>{
  await execute(h,migration);assert.equal((await h.rpc(a,'hf_profile')).total_score,8000);
  assert.deepEqual(await snapshot(),before);
  const baseline=await row('select * from hf_private.personal_best_baselines where profile_id=$1',[a.id]);
  assert.equal(baseline.previous_total_score,19000);assert.equal(baseline.reconstructed_best,8000);assert.equal(baseline.history_runs,3);
 });
 await check('a lower, tied, then higher run only changes the best on the higher score; growth still accumulates',async()=>{
  const growth=(await h.rpc(a,'hf_profile')).produce_points;
  await scoreRun(a,4000);assert.equal((await h.rpc(a,'hf_profile')).total_score,8000);
  await scoreRun(a,8000);assert.equal((await h.rpc(a,'hf_profile')).total_score,8000);
  await scoreRun(a,9000);const p=await h.rpc(a,'hf_profile');assert.equal(p.total_score,9000);assert.equal(p.produce_points,growth+21000);
 });
 await check('pending rewards compare each paid run independently and settlement retries cannot sum runs into the best',async()=>{
  const high=await scoreRun(a,8990),low=await scoreRun(a,20);
  await h.admin('update hf_private.runs set pending_score=case when id=$1 then 30 else 60 end where id=any($2::uuid[])',[high,[high,low]]);
  await h.admin('update hf_private.profiles set reward_tokens=150,reward_at=clock_timestamp() where user_id=$1',[a.id]);
  const p=await h.rpc(a,'hf_settle_rewards');assert.equal(p.profile.total_score,9020);assert.equal(p.profile.pending_rewards,0);
  assert.deepEqual(await h.rpc(a,'hf_settle_rewards'),p);assert.equal((await row('select score from hf_private.runs where id=$1',[low])).score,80);
 });
 await check('terminal state transitions and duplicate run updates cannot credit score or growth twice',async()=>{
  const p=await h.rpc(a,'hf_profile');await h.admin("update hf_private.runs set status='abandoned',score=score where id=$1",[runs[0]]);
  assert.deepEqual(await h.rpc(a,'hf_profile'),p);
 });
 await check('existing 010 replay hashes/checkpoints continue with engine 1; new runs select engine 2',async()=>{
  const oldContext=await h.rpc(old,'hf_replay_context',{p_run:oldRun.id});assert.equal(oldContext.engineVersion,1);assert.equal(oldContext.engineHash,replayEngine(1).hash);
  const result=await replayRpc(h,old,oldRun.id,[{kind:'checkpoint',seq:2,frame:17,inputs:[{frame:16,ticks:1,held:0,pressed:0,touch:true,x:0,y:0,weapon:'shell'}]}]);
  assert.equal(result.ack,2);assert.equal(result.profile.total_score,2);
  const current=await h.rpc(old,'hf_start_run_v6',{p_map:1,p_engine:2});assert.equal(current.engineVersion,2);assert.equal((await h.rpc(old,'hf_replay_context',{p_run:current.id})).engineVersion,2);
  const cached=await h.rpc(old,'hf_start_run_v6',{p_map:1});assert.equal((await h.rpc(old,'hf_replay_context',{p_run:cached.id})).engineVersion,1);
 });
 await check('both leaderboard RPCs rank single-run bests and expose no wallet identifiers',async()=>{
  const board=await h.rpc(null,'hf_lifetime_top100');assert.equal(board.scoreMode,'personal-best');
  assert.equal(board.rows[0].name,'Best keeper');assert.equal(board.rows[0].score,9020);assert.equal(board.rows[1].score,7000);
  assert(!JSON.stringify(board).includes(a.wallet));
  const rows=(await h.admin('select * from public.hf_top100()')).rows;assert.equal(rows[0].total_score,9020);
 });
 await check('same wallet with a different verified Auth UUID recovers the original profile and personal best',async()=>{
  const alias=await h.identity(a.wallet.toUpperCase().replace('0X','0x'));
  assert.deepEqual(await h.rpc(alias,'hf_wallet_profile'),await h.rpc(a,'hf_profile'));
  assert.equal((await row('select count(*) as n from hf_private.wallet_profiles where wallet=$1',[a.wallet])).n,1);
 });
 await check('retention, private RLS/grants, server-only commit and all owner verification queries remain enforced',async()=>{
  await assert.rejects(()=>h.admin('update hf_private.profiles set total_score=0 where user_id=$1',[a.id]),/cannot decrease/);
  await assert.rejects(()=>h.admin('delete from hf_private.profiles where user_id=$1',[a.id]),/must be retained/);
  for(const file of ['verify_production.sql','verify_personal_best.sql','verify_major.sql']){
   await h.admin('reset role');for(const result of await h.db.exec(await readFile('supabase/'+file,'utf8')))for(const r of result.rows)for(const v of Object.values(r))if(typeof v==='boolean')assert.equal(v,true,file+JSON.stringify(r));
  }
  await execute(h,await readFile('supabase/test_access.sql','utf8'));
  await h.rpc(a,'hf_profile');await assert.rejects(()=>h.db.query('update hf_private.profiles set total_score=999999'),/permission denied/);
  await assert.rejects(()=>h.db.query('select * from hf_private.personal_best_baselines'),/permission denied/);
  await assert.rejects(()=>h.db.query('select public.hf_replay_commit(null,null,0,\'[]\',\'{}\',null)'),/permission denied/);
 });
 await check('forged score events and another wallet run are rejected by authoritative validation',async()=>{
  const r=await h.rpc(a,'hf_start_run_v6',{p_map:1});
  await assert.rejects(()=>h.rpc(a,'hf_progress',{p_run:r.id,p_events:[{kind:'forage',source:'chest',seq:1,frame:0}]}),/Movement replay/);
  await assert.rejects(()=>replayRpc(h,b,r.id,[{kind:'checkpoint',frame:0,seq:1,inputs:[]}]),/does not belong/);
  await assert.rejects(()=>replayRpc(h,a,r.id,[{kind:'set_score',score:999999,frame:0,seq:1,inputs:[]}]),/Unknown game event/);
  assert.equal((await h.rpc(a,'hf_profile')).total_score,9020);
 });
 await check('real game controls save a run once, survive offline reload and disconnect/reconnect, and a tied run leaves the best unchanged',async()=>{
  const user=await h.identity();await h.rpc(user,'hf_wallet_profile');
  async function basket(d){
   await d.t.startGame(1,true);d.net.offline=true;for(let i=0;i<15;i++)tick(d,['right']);d.t.release();d.t.render();
   assert.equal(d.nodes.get('context-interact').textContent,'Open');d.nodes.get('context-interact').dispatchEvent({type:'click'});d.t.tick();
   while(d.t.game.state==='dialogue')d.t.advanceDialogue();d.save.record('checkpoint',{},d.t.game.frames);await d.save.flush();
   assert.equal(d.t.game.collected,2);assert(queued(d).some(e=>e.source==='basket'));
  }
  const d=await replayDevice(h,user,new Map(),{touch:true});await basket(d);
  const restored=await replayDevice(h,user,d.storage,{offline:true,touch:true});assert.equal(restored.save.snapshot().cloud,false);
  restored.net.offline=false;await restored.save.retry();assert.equal(restored.save.snapshot().profile.total_score,2);assert.equal(restored.save.snapshot().pendingEvents,0);
  await restored.save.setWallet('');await restored.save.setWallet(user.wallet);assert.equal(restored.save.snapshot().profile.total_score,2);
  const fresh=await replayDevice(h,user);assert.equal(fresh.save.snapshot().profile.total_score,2);
  await basket(fresh);fresh.net.offline=false;await fresh.save.retry();assert.equal(fresh.save.snapshot().profile.total_score,2);
  assert.equal(fresh.save.snapshot().profile.produce_points,4);assert.deepEqual(fresh.errors,[]);
 });
 await check('prepared upgrade from inspected 010 applies only 011 and rejects reapplying to 011',async()=>{
  const sql=await prepare(10);assert(!sql.includes('-- 010_authoritative_replay.sql'));assert(sql.includes('-- 011_personal_best.sql'));
  const fresh=await createHarness(10);try{await execute(fresh,sql);assert.equal((await fresh.rpc(null,'hf_service_status')).migration,11);}finally{await fresh.close();}
  await assert.rejects(()=>execute(h,sql),/Installed service version differs/);await h.db.exec('rollback;reset role');
 });
}finally{await h.close();}

await check('unreconstructable positive totals roll back the entire migration without changing player data',async()=>{
 const db=await createHarness(10);try{
  const a=await db.identity();await db.rpc(a,'hf_wallet_profile');await db.admin('update hf_private.profiles set total_score=73 where user_id=$1',[a.id]);
  await assert.rejects(()=>execute(db,migration),/Incomplete run history/);await db.db.exec('rollback;reset role');
  assert.equal((await db.rpc(a,'hf_profile')).total_score,73);assert.equal((await db.rpc(null,'hf_service_status')).migration,10);
  assert.equal((await db.admin("select to_regclass('hf_private.personal_best_baselines') as t")).rows[0].t,null);
 }finally{await db.close();}
});
await check('historical rules 2/3 HP/completion records reconstruct their actual per-run points',async()=>{
 const db=await createHarness(10);try{
  const a=await db.identity();await db.rpc(a,'hf_wallet_profile');
  await db.admin("insert into hf_private.runs(user_id,map,hp,loot,rules_version,status) values($1,1,array_fill(0::float8,array[31]),array_fill('small'::text,array[31]),2,'complete')",[a.id]);
  await db.admin('update hf_private.profiles set total_score=4500 where user_id=$1',[a.id]);await execute(db,migration);
  assert.equal((await db.rpc(a,'hf_profile')).total_score,4500);
 }finally{await db.close();}
});
await mkdir('test/scratch/personal-best',{recursive:true});await writeFile('test/scratch/personal-best/sql-results.json',JSON.stringify({results,limitations:['Disposable PGlite PostgreSQL with explicit Auth/HTTP fixtures; no hosted SQL or real wallet signatures.','Large score examples are administrative test fixtures. Gameplay/reconnect tests separately use the real engine and replay.','Concurrent statements are serialized by the local harness; independent PostgreSQL connections were not tested.']},null,2)+'\n');
console.log(results.length+' personal-best groups passed.');
