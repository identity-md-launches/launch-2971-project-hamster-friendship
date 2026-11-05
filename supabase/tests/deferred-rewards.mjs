// Regression for 8591f286…: actual SQL + shipped save.js, explicit Auth/HTTP
// fixtures. Run timestamps/refill are accelerated only where marked below.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHarness} from './major-harness.mjs';
import {walk,sources,device,runQueues,backdateRun,refill} from './reward-fixture.mjs';
const h=await createHarness(9),results=[];
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
const profile=u=>h.rpc(u,'hf_wallet_profile');
async function user(){const u=await h.identity();await profile(u);return u;}
async function runs(u,count=4){const rows=[];for(let i=0;i<count;i++){const r=await h.rpc(u,'hf_start_run_v6',{p_map:1});await backdateRun(h,r.id);rows.push(r);}return rows;}
async function totals(u){return (await h.admin('select total_score,produce_points,(select coalesce(sum(pending_score),0) from hf_private.runs where user_id=$1) as pending from hf_private.profiles where user_id=$1',[u.id])).rows[0];}
try{
 let a,rows;
 await check('four valid offline runs conserve all 280 points: 150 paid + 130 durably pending',async()=>{
  a=await user();rows=await runs(a);const replies=[];for(const r of rows)replies.push(await h.rpc(a,'hf_progress',{p_run:r.id,p_events:walk()}));
  const t=await totals(a);assert.equal(Number(t.total_score),150);assert.equal(Number(t.produce_points),150);assert.equal(Number(t.pending),130);
  assert.deepEqual(replies.map(r=>r.ack),[46,46,46,46]);assert.deepEqual(replies.map(r=>r.pendingPoints),[0,0,60,70]);
  const state=await h.rpc(a,'hf_run_state',{p_run:rows[3].id});assert.equal(state.status,'dead');assert.equal(state.pendingPoints,70);
 });
 await check('replay before refill neither loses nor duplicates pending rewards',async()=>{
  for(const r of rows)await h.rpc(a,'hf_progress',{p_run:r.id,p_events:walk()});
  const t=await totals(a);assert.equal(Number(t.total_score)+Number(t.pending),280);assert.equal(Number(t.total_score),150);
 });
 await check('partial refill pays exactly the budget; final refill pays all terminal runs exactly once',async()=>{
  await refill(h,a,11);let p=(await h.rpc(a,'hf_settle_rewards')).profile;
  assert.equal(p.total_score,161);assert.equal(p.pending_rewards,119);assert.equal(p.produce_points,161);
  await refill(h,a,150);p=(await h.rpc(a,'hf_settle_rewards')).profile;assert.equal(p.total_score,280);assert.equal(p.pending_rewards,0);assert.equal(p.produce_points,280);
  for(const r of rows)assert.equal((await h.rpc(a,'hf_progress',{p_run:r.id,p_events:walk()})).pendingPoints,0);
  for(let i=0;i<3;i++)await h.rpc(a,'hf_settle_rewards');assert.equal((await profile(a)).total_score,280);
  const ledger=await h.admin('select count(*)::int as n,sum(points)::int as points from hf_private.lifetime_entries where profile_id=$1',[a.id]);assert.deepEqual(ledger.rows[0],{n:4,points:280});
  const board=await h.rpc(null,'hf_lifetime_top100');assert.equal(board.rows[0].score,280);
 });
 await check('four independent save clients keep unpaid durable batches and pending status until settled',async()=>{
  const b=await user(),clients=[];
  for(let i=0;i<4;i++){
   const c=await device(h,b);await c.save.beginMap(1);c.net.offline=true;
   for(const e of walk())c.save.record(e.kind,e.source?{source:e.source}:{},e.frame);await c.save.flush();
   assert.equal(c.save.snapshot().pendingEvents,46);await backdateRun(h,runQueues(c.storage)[0].id);clients.push(c);
  }
  for(const c of clients){c.net.offline=false;await c.save.retry();}
  assert.equal((await profile(b)).total_score,150);
  for(const c of clients.slice(2)){
   assert.equal(c.save.snapshot().pendingEvents,46);assert.equal(runQueues(c.storage).length,1);assert.match(c.save.snapshot().status,/Save pending/);assert(!/Wallet profile saved/.test(c.save.snapshot().status));
  }
  const reload=await device(h,b,clients[2].storage);assert.equal(reload.save.snapshot().pendingEvents,46);assert.equal(reload.save.snapshot().pendingRewards,130);
  // Refill fixture: test partial settlement and a lost commit response.
  await refill(h,b,30);clients[3].net.loseReply=true;await clients[3].save.flush();
  assert.equal((await profile(b)).total_score,180);assert.equal(clients[3].save.snapshot().pendingEvents,46);
  await refill(h,b,150);await reload.save.retry();await clients[3].save.retry();
  for(const c of [reload,clients[3]]){assert.equal(c.save.snapshot().pendingEvents,0);assert.equal(c.save.snapshot().pendingRewards,0);assert.equal(runQueues(c.storage).length,0);assert.equal(c.save.snapshot().status,'Wallet profile saved.');}
  assert.equal((await profile(b)).total_score,280);
 });
 await check('a stale same-tab acknowledgement preserves newer durable events from another tab',async()=>{
  const b=await user(),writer=await device(h,b);await writer.save.beginMap(1);writer.net.offline=true;
  writer.save.record('forage',{source:'basket'},60);await writer.save.flush();const q=runQueues(writer.storage)[0];await backdateRun(h,q.id);
  let arrived,release;const waiting=new Promise(done=>arrived=done),held=new Promise(done=>release=done);
  const reading=device(h,b,writer.storage,{afterProgress:async()=>{arrived();await held;}});await waiting;
  writer.save.record('forage',{source:'trail-0'},120);await writer.save.flush();release();await reading;
  assert(runQueues(writer.storage)[0].events.some(e=>e.seq===2&&e.source==='trail-0'));
  const restored=await device(h,b,writer.storage);assert.equal(restored.save.snapshot().pendingEvents,0);assert.equal(restored.save.snapshot().profile.total_score,3);
 });
 await check('validated produce drops defer points while SQK pickup remains immediate and idempotent',async()=>{
  const b=await user();let r,fruit,coin;
  for(let i=0;i<8;i++){r=await h.rpc(b,'hf_start_run_v6',{p_map:1});fruit=r.loot.findIndex((k,i)=>i<30&&['small','big'].includes(k));coin=r.loot.findIndex((k,i)=>i<30&&k==='coin');if(fruit>=0&&coin>=0)break;}
  assert(fruit>=0&&coin>=0);await backdateRun(h,r.id);
  const expected=r.loot[fruit]==='big'?5:1;let seq=0,frame=0,attack=0;const events=[];
  for(const target of [fruit,coin]){
   for(let hp=r.monsters[target].hp;hp>0;hp-=25){frame+=16;events.push({kind:'attack',weapon:'shell',attack:++attack,seq:++seq,frame},{kind:'hit',target,attack,seq:++seq,frame});}
   events.push({kind:'pickup',target,seq:++seq,frame});
  }
  events.push({kind:'death',seq:++seq,frame});
  await h.admin('update hf_private.profiles set reward_tokens=0,reward_at=clock_timestamp() where user_id=$1',[b.id]);
  const result=await h.rpc(b,'hf_progress',{p_run:r.id,p_events:events});assert.equal(result.pendingPoints,expected);assert.equal(result.profile.sqk,1);assert.equal(result.profile.total_score,0);
  await h.rpc(b,'hf_progress',{p_run:r.id,p_events:events});assert.equal((await profile(b)).sqk,1);await refill(h,b,150);
  const p=(await h.rpc(b,'hf_settle_rewards')).profile;assert.equal(p.total_score,expected);assert.equal(p.produce_points,expected);assert.equal(p.sqk,1);assert.equal(p.pending_rewards,0);
 });
 await check('retained reward batches do not label already-credited SQK as pending after refresh',async()=>{
  const b=await user(),c=await device(h,b);let setup,fruit,coin;
  for(let i=0;i<8;i++){setup=await c.save.beginMap(1);fruit=setup.loot.findIndex((k,i)=>i<30&&['small','big'].includes(k));coin=setup.loot.findIndex((k,i)=>i<30&&k==='coin');if(fruit>=0&&coin>=0)break;}
  assert(fruit>=0&&coin>=0);const expected=setup.loot[fruit]==='big'?5:1;c.net.offline=true;let frame=0,attack=0;
  for(const target of [fruit,coin]){
   for(let hp=setup.monsters[target].hp;hp>0;hp-=25){frame+=16;c.save.record('attack',{weapon:'shell',attack:++attack},frame);c.save.record('hit',{target,attack},frame);}
   c.save.record('defeat',{target},frame);c.save.record('pickup',{target},frame);
  }
  c.save.record('death',{},frame);await c.save.flush();const q=runQueues(c.storage)[0];assert.equal(c.save.snapshot().pendingCoins,1);await backdateRun(h,q.id);
  await h.admin('update hf_private.profiles set reward_tokens=0,reward_at=clock_timestamp() where user_id=$1',[b.id]);
  c.net.offline=false;await c.save.retry();assert.equal(c.save.snapshot().profile.sqk,1);assert.equal(c.save.snapshot().pendingCoins,0);assert.equal(c.save.snapshot().pendingRewards,expected);assert(c.save.snapshot().pendingEvents>0);
  const reload=await device(h,b,c.storage);assert.equal(reload.save.snapshot().pendingCoins,0);assert.equal(reload.save.snapshot().profile.sqk,1);await refill(h,b,150);await reload.save.retry();assert.equal(reload.save.snapshot().profile.total_score,expected);assert.equal(reload.save.snapshot().profile.sqk,1);assert.equal(reload.save.snapshot().pendingEvents,0);
 });
 await check('fresh device and canonical wallet alias recover unpaid rewards with no browser queue',async()=>{
  const b=await user(),r=await runs(b,1);await h.admin('update hf_private.profiles set reward_tokens=0,reward_at=clock_timestamp() where user_id=$1',[b.id]);
  await h.rpc(b,'hf_progress',{p_run:r[0].id,p_events:walk()});const alias=await h.identity(b.wallet.toUpperCase().replace('0X','0x'));await profile(alias);
  const c=await device(h,alias);assert.equal(c.save.snapshot().pendingEvents,0);assert.equal(c.save.snapshot().pendingRewards,70);assert.match(c.save.snapshot().status,/Save pending/);
  await refill(h,b,150);c.net.loseSettlement=true;await c.save.retry();await c.save.retry();
  assert.equal(c.save.snapshot().pendingRewards,0);assert.equal(c.save.snapshot().profile.total_score,70);assert.equal((await profile(b)).total_score,70);
  assert.equal((await h.admin('select count(*)::int as n from hf_private.wallet_profiles where profile_id=$1',[b.id])).rows[0].n,1);
 });
 await check('ended-run error reconciliation cannot discard a validated but unpaid batch',async()=>{
  const b=await user(),c=await device(h,b);await c.save.beginMap(1);c.net.offline=true;
  for(const e of walk())c.save.record(e.kind,e.source?{source:e.source}:{},e.frame);await c.save.flush();const q=runQueues(c.storage)[0];await backdateRun(h,q.id);
  await h.admin('update hf_private.profiles set reward_tokens=0,reward_at=clock_timestamp() where user_id=$1',[b.id]);
  await h.rpc(b,'hf_progress',{p_run:q.id,p_events:q.events});c.net.offline=false;c.net.loseReply=true;await c.save.retry();assert.equal(c.save.snapshot().pendingEvents,46);assert.match(c.save.snapshot().status,/Save pending/);assert(!c.save.snapshot().runConflict);
  await refill(h,b,150);await c.save.retry();assert.equal(c.save.snapshot().pendingEvents,0);assert.equal(c.save.snapshot().profile.total_score,70);
 });
 await check('missing payment confirmations and malformed lost-reply state fail closed without retiring a batch',async()=>{
  const b=await user(),c=await device(h,b);await c.save.beginMap(1);c.net.offline=true;
  for(const e of walk())c.save.record(e.kind,e.source?{source:e.source}:{},e.frame);await c.save.flush();const q=runQueues(c.storage)[0];await backdateRun(h,q.id);
  await h.admin('update hf_private.profiles set reward_tokens=0,reward_at=clock_timestamp() where user_id=$1',[b.id]);
  c.net.offline=false;c.net.invalidPayment=true;await c.save.retry();assert.equal(c.save.snapshot().pendingEvents,46);assert.match(c.save.snapshot().status,/confirm reward settlement/);
  c.net.invalidPayment=false;c.net.loseReply=true;c.net.invalidState=true;await c.save.retry();assert.equal(c.save.snapshot().pendingEvents,46);assert.equal(runQueues(c.storage).length,1);assert.match(c.save.snapshot().status,/Save pending/);
  c.net.invalidState=false;await refill(h,b,150);await c.save.retry();assert.equal(c.save.snapshot().pendingEvents,0);assert.equal(c.save.snapshot().profile.total_score,70);
 });
 await check('abandoned and completed runs retain unpaid rewards and settle without new events',async()=>{
  const b=await user(),rs=await runs(b);await h.admin('update hf_private.profiles set reward_tokens=0,reward_at=clock_timestamp() where user_id=$1',[b.id]);
  const forage=walk().slice(0,-1);await h.rpc(b,'hf_progress',{p_run:rs[0].id,p_events:forage});await h.rpc(b,'hf_start_run_v6',{p_map:1});
  assert.equal((await h.rpc(b,'hf_run_state',{p_run:rs[0].id})).status,'abandoned');
  await h.admin('update hf_private.runs set hp[31]=0 where id=$1',[rs[1].id]); // Fixture: already defeated boss, isolates terminal settlement.
  await h.rpc(b,'hf_progress',{p_run:rs[1].id,p_events:[...forage,{kind:'finish',seq:46,frame:4360}]});
  assert.equal((await h.rpc(b,'hf_run_state',{p_run:rs[1].id})).status,'complete');
  await refill(h,b,150);const p=(await h.rpc(b,'hf_settle_rewards')).profile;assert.equal(p.pending_rewards,0);assert.equal(p.total_score,140);assert.equal(p.produce_points,140);assert.equal(p.highest_map,2);
 });
 await check('legacy v4 settlement still waits for death, then pays deferred deltas exactly once without produce growth',async()=>{
  const b=await user(),r=await h.rpc(b,'hf_start_run_v4',{p_map:1});await backdateRun(h,r.id);
  await h.admin('update hf_private.profiles set reward_tokens=0,reward_at=clock_timestamp() where user_id=$1',[b.id]);
  await h.rpc(b,'hf_progress',{p_run:r.id,p_events:walk().slice(0,-1)});await refill(h,b,10);
  await h.rpc(b,'hf_settle_rewards');assert.equal((await profile(b)).total_score,0);
  await h.rpc(b,'hf_progress',{p_run:r.id,p_events:[{kind:'death',seq:46,frame:4360}]});assert.equal((await profile(b)).total_score,10);
  await refill(h,b,150);await h.rpc(b,'hf_settle_rewards');const p=await profile(b);assert.equal(p.total_score,70);assert.equal(p.pending_rewards,0);assert.equal(p.produce_points,0);
  await h.rpc(b,'hf_progress',{p_run:r.id,p_events:walk()});assert.equal((await profile(b)).total_score,70);
 });
 await check('reachability, teleport, elapsed-time, sequence and server-owned score checks remain enforced',async()=>{
  const b=await user(),r=await h.rpc(b,'hf_start_run_v6',{p_map:1});
  await assert.rejects(()=>h.rpc(b,'hf_progress',{p_run:r.id,p_events:sources.map((source,i)=>({kind:'forage',source,seq:i+1,frame:0}))}),/cannot be reached/);
  await assert.rejects(()=>h.rpc(b,'hf_progress',{p_run:r.id,p_events:[{kind:'forage',source:'trail-33',seq:1,frame:1600}]}),/Invalid game timing/);
  await backdateRun(h,r.id);
  await assert.rejects(()=>h.rpc(b,'hf_progress',{p_run:r.id,p_events:[{kind:'forage',source:'trail-33',seq:1,frame:1600},{kind:'forage',source:'basket',seq:2,frame:1610}]}),/too far apart/);
  await assert.rejects(()=>h.rpc(b,'hf_progress',{p_run:r.id,p_events:[{kind:'set_score',score:99999,seq:1,frame:0}]}),/Unknown game event/);
  await assert.rejects(()=>h.rpc(b,'hf_progress',{p_run:r.id,p_events:[{kind:'death',seq:2,frame:0}]}),/in order/);
  assert.equal((await profile(b)).pending_rewards,0);assert.equal((await profile(b)).total_score,0);
 });
 await check('RLS/grants and verified ownership protect the new entitlement/settlement path',async()=>{
  const b=await user(),foreign=await user(),unverified=await h.identity(undefined,false),r=await runs(b,1);
  await assert.rejects(()=>h.rpc(foreign,'hf_progress',{p_run:r[0].id,p_events:walk()}),/does not belong/);
  await assert.rejects(()=>h.rpc(null,'hf_settle_rewards'),/permission denied/);
  await assert.rejects(()=>h.rpc(unverified,'hf_settle_rewards'),/Sign in with your wallet/);
  await h.admin('select 1');
  for(const file of ['supabase/verify_production.sql','supabase/verify_major.sql'])for(const result of await h.db.exec(await readFile(file,'utf8')))for(const row of result.rows)for(const v of Object.values(row))if(typeof v==='boolean')assert.equal(v,true,file+' '+JSON.stringify(row));
  await h.db.exec(await readFile('supabase/test_access.sql','utf8'));
 });
 await check('008 → 009 recovers already discarded rewards without changing historical balances/inventory',async()=>{
  const old=await createHarness(8);try{
   const b=await old.identity();await old.rpc(b,'hf_wallet_profile');await old.admin("update hf_private.profiles set sqk=275,total_score=1400,name='Preserved Friend',cosmetics='{}' where user_id=$1",[b.id]);
   await old.admin("insert into hf_private.purchases(user_id,item,paid) values($1,'costume-batman',50)",[b.id]);
   const rs=[];for(let i=0;i<4;i++){const r=await old.rpc(b,'hf_start_run_v6',{p_map:1});await backdateRun(old,r.id);rs.push(r);}
   for(const r of rs)await old.rpc(b,'hf_progress',{p_run:r.id,p_events:walk()});
   const p=await old.rpc(b,'hf_wallet_profile');assert.equal(p.total_score,1550);
   const before=(await old.admin('select to_jsonb(p) as row from hf_private.profiles p')).rows;
   await old.db.exec(await readFile('supabase/migrations/009_deferred_rewards.sql','utf8'));
   assert.deepEqual((await old.admin('select to_jsonb(p) as row from hf_private.profiles p')).rows,before);
   assert.equal((await old.rpc(b,'hf_wallet_profile')).pending_rewards,130);
   await refill(old,b,150);const recovered=await device(old,b);assert.equal(recovered.save.snapshot().profile.total_score,1680);assert.equal(recovered.save.snapshot().profile.produce_points,280);assert.equal(recovered.save.snapshot().profile.sqk,275);assert.deepEqual([...recovered.save.snapshot().profile.purchases],['costume-batman']);assert.equal(recovered.save.snapshot().pendingRewards,0);
  }finally{await old.close();}
 });
 await check('an old migration-8 backend is rejected before any signed-in save or wallet prompt',async()=>{
  const old=await createHarness(8);try{const b=await old.identity();await old.rpc(b,'hf_wallet_profile');const c=await device(old,b);assert.equal(c.save.snapshot().cloud,false);assert.equal(c.save.snapshot().backendState,'unavailable');let signs=0;await assert.rejects(()=>c.save.signIn({request:async()=>{signs++;}},b.wallet),/finish cloud setup/);assert.equal(signs,0);}finally{await old.close();}
 });
}finally{await h.close();}
await mkdir('test/scratch/deferred',{recursive:true});await writeFile('test/scratch/deferred/results.json',JSON.stringify({results,limitations:['Disposable PGlite PostgreSQL, fixture Auth/HTTP; not Supabase production.','Run elapsed time and budget refill accelerated explicitly for fast edge cases. Real-clock regression is separate.','Single connection; independent database-connection lock contention not exercised.']},null,2));console.log(results.length+' deferred reward checks passed.');
