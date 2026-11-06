// Real PostgreSQL + unchanged game physics + shipped save client. Auth, HTTP,
// elapsed clock and deterministic encounter setup are explicit local fixtures.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHarness} from './major-harness.mjs';
import {replayDevice,replayRpc,tick,queued} from './replay-fixture.mjs';
import {validateReplay,engineHash,createReplay} from '../functions/_shared/replay.js';
const results=[];
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
const original=await createHarness(9);let preserved,legacy,oldUser;
try{
 await check('migration 009 reproduces distant reward and forty zero-frame basket runs without engine or clock edits',async()=>{
  oldUser=await original.identity();await original.rpc(oldUser,'hf_wallet_profile');
  let r,target;for(let n=0;n<80;n++){r=await original.rpc(oldUser,'hf_start_run_v6',{p_map:1});target=r.loot.findIndex((k,i)=>i>=20&&i<30&&k==='big');if(target>=0)break;}assert(target>=0);
  const events=[];let seq=0,attack=0;
  for(let hp=r.monsters[target].hp;hp>0;hp-=25){const frame=attack*16;events.push({kind:'attack',weapon:'shell',attack:++attack,frame,seq:++seq},{kind:'hit',attack,target,frame,seq:++seq});}
  for(const kind of ['defeat','pickup','death'])events.push({kind,target,frame:48,seq:++seq});
  const reply=await original.rpc(oldUser,'hf_progress',{p_run:r.id,p_events:events});assert.equal(reply.profile.total_score,5);
  const farmer=await original.identity();await original.rpc(farmer,'hf_wallet_profile');
  for(let n=0;n<40;n++){r=await original.rpc(farmer,'hf_start_run_v6',{p_map:1});await original.rpc(farmer,'hf_progress',{p_run:r.id,p_events:[{kind:'forage',source:'basket',seq:1,frame:0},{kind:'death',seq:2,frame:0}]});}
  assert.equal((await original.rpc(farmer,'hf_wallet_profile')).total_score,80);
 });
 await check('009 → 010 preserves every credited balance, inventory, ledger and unpaid reward; old acknowledgements still settle',async()=>{
  legacy=await original.rpc(oldUser,'hf_start_run_v6',{p_map:1});
  await original.admin("update hf_private.profiles set reward_tokens=0,reward_at=clock_timestamp(),sqk=275 where user_id=$1",[oldUser.id]);
  await original.admin("insert into hf_private.purchases(user_id,item,paid) values($1,'costume-batman',50)",[oldUser.id]);
  await original.rpc(oldUser,'hf_progress',{p_run:legacy.id,p_events:[{kind:'forage',source:'basket',seq:1,frame:30}]});
  preserved=(await original.admin("select jsonb_build_object('profiles',(select jsonb_agg(p) from hf_private.profiles p),'ledger',(select jsonb_agg(l) from hf_private.lifetime_entries l),'purchases',(select jsonb_agg(p) from hf_private.purchases p),'rewards',(select jsonb_agg(jsonb_build_object('id',id,'score',score,'pending',pending_score)) from hf_private.runs)) as data")).rows[0].data;
  await original.admin('select 1');await original.db.exec(await readFile('supabase/migrations/010_authoritative_replay.sql','utf8'));
  assert.deepEqual((await original.admin("select jsonb_build_object('profiles',(select jsonb_agg(p) from hf_private.profiles p),'ledger',(select jsonb_agg(l) from hf_private.lifetime_entries l),'purchases',(select jsonb_agg(p) from hf_private.purchases p),'rewards',(select jsonb_agg(jsonb_build_object('id',id,'score',score,'pending',pending_score)) from hf_private.runs)) as data")).rows[0].data,preserved);
  await original.admin('update hf_private.profiles set reward_tokens=150 where user_id=$1',[oldUser.id]);
  const ack=await original.rpc(oldUser,'hf_progress',{p_run:legacy.id,p_events:[{seq:1}]});assert.equal(ack.profile.total_score,7);assert.equal(ack.profile.sqk,275);assert.equal(ack.pendingPoints,0);
  await original.rpc(oldUser,'hf_progress',{p_run:legacy.id,p_events:[{seq:1}]});assert.equal((await original.rpc(oldUser,'hf_wallet_profile')).total_score,7);
 });
 await check('legacy unsent events stay in the durable recovery record and no longer block a new verified run',async()=>{
  const storage=new Map(),prefix='hamster-friendship-v2';storage.set(prefix+'-wallet-session-'+oldUser.wallet,JSON.stringify({access_token:oldUser.id,refresh_token:oldUser.id,expires_at:Date.now()/1000+3600}));
  const event={kind:'forage',source:'trail-0',seq:2,frame:100};storage.set(prefix+'-run-outbox-'+oldUser.wallet+'-'+legacy.id,JSON.stringify({id:legacy.id,loot:legacy.loot,events:[event]}));
  const d=await replayDevice(original,oldUser,storage);assert(d.save.snapshot().runConflict);await d.save.recover();assert.equal(d.save.snapshot().recoveryEvents,1);assert.deepEqual(JSON.parse(JSON.stringify(d.save.recoveryRecord().runs[0].events[0])),event);assert.equal(d.save.snapshot().profile.total_score,7);await d.save.beginMap(1);assert(d.save.snapshot().ranked);
 });
}finally{await original.close();}
const h=await createHarness(10);
const makeUser=async()=>{const u=await h.identity();await h.rpc(u,'hf_wallet_profile');return u;};
const start=async u=>h.rpc(u,'hf_start_run_v6',{p_map:1});
const input=(frame,overrides={})=>({frame,ticks:1,held:0,pressed:0,touch:false,x:0,y:0,weapon:'shell',...overrides});
try{
 await check('raw SQL distant hits, coin claims and forty zero-frame restart attempts earn zero score, SQK, growth or pending credit',async()=>{
  const u=await makeUser();for(let n=0;n<40;n++){
   const r=await start(u);
   await assert.rejects(()=>h.rpc(u,'hf_progress',{p_run:r.id,p_events:[{kind:'forage',source:'basket',seq:1,frame:0},{kind:'death',seq:2,frame:0}]}),/Movement replay/);
   const target=21,events=[];let seq=0,attack=0;for(let hp=r.monsters[target].hp;hp>0;hp-=25){const frame=attack*16;events.push({kind:'attack',weapon:'shell',attack:++attack,frame,seq:++seq},{kind:'hit',attack,target,frame,seq:++seq});}for(const kind of ['defeat','pickup','death'])events.push({kind,target,frame:48,seq:++seq});
   await assert.rejects(()=>h.rpc(u,'hf_progress',{p_run:r.id,p_events:events}),/Movement replay/);
   assert.equal((await h.rpc(u,'hf_run_state',{p_run:r.id})).ack,0);
  }
  const p=await h.rpc(u,'hf_wallet_profile');for(const k of ['total_score','produce_points','sqk','pending_rewards'])assert.equal(p[k],0);assert.equal((await h.rpc(null,'hf_lifetime_top100')).rows.length,0);
 });
 await check('replay rejects invented first-frame collisions and baskets even with syntactically valid controls',async()=>{
  const u=await makeUser(),r=await start(u);
  await assert.rejects(()=>replayRpc(h,u,r.id,[{kind:'attack',weapon:'shell',attack:1,frame:0,seq:1,inputs:[input(0,{pressed:8})]},{kind:'hit',target:21,attack:1,frame:0,seq:2,inputs:[]}]),/does not match/);
  await assert.rejects(()=>replayRpc(h,u,r.id,[{kind:'forage',source:'basket',frame:0,seq:1,inputs:[input(0,{pressed:16})]},{kind:'death',frame:0,seq:2,inputs:[]}]),/does not match/);
  await assert.rejects(()=>replayRpc(h,u,r.id,[{kind:'pickup',target:21,frame:0,seq:1,inputs:[]}]),/does not match/);
  assert.equal((await h.rpc(u,'hf_run_state',{p_run:r.id})).ack,0);assert.equal((await h.rpc(u,'hf_wallet_profile')).total_score,0);
 });
 await check('teleports, excessive vectors, skipped frames, unowned weapons, omitted events and excessive work fail closed',async()=>{
  const u=await makeUser(),r=await start(u);
  for(const bad of [input(0,{x:10000,touch:true}),input(0,{position:{x:2064}}),input(1),input(0,{weapon:'gun'}),input(0,{ticks:61}),input(0,{pressed:8,ticks:2})])
   await assert.rejects(()=>replayRpc(h,u,r.id,[{kind:'checkpoint',frame:1,seq:1,inputs:[bad]}]));
  await assert.rejects(()=>replayRpc(h,u,r.id,[{kind:'checkpoint',frame:1,seq:1,inputs:[input(0,{pressed:8})]}]),/does not match/);
  const context=await h.rpc(u,'hf_replay_context',{p_run:r.id});context.maxFrame=99999;
  await assert.rejects(()=>validateReplay(context,[{kind:'checkpoint',frame:1860,seq:1,inputs:Array.from({length:31},(_,i)=>input(i*60,{ticks:60}))}]),/too large/);
  assert.equal((await h.rpc(u,'hf_run_state',{p_run:r.id})).ack,0);
 });
 await check('authenticated/anonymous callers cannot commit replay state or reach private reward functions; cross-wallet context is denied',async()=>{
  const u=await makeUser(),other=await makeUser(),r=await start(u);
  await assert.rejects(()=>h.rpc(other,'hf_replay_context',{p_run:r.id}),/does not belong/);
  await assert.rejects(()=>h.rpc(null,'hf_replay_context',{p_run:r.id}),/permission denied/);
  const grants=(await h.admin("select has_function_privilege('authenticated','public.hf_replay_commit(uuid,uuid,integer,jsonb,jsonb,text)','execute') as browser,has_function_privilege('anon','public.hf_replay_commit(uuid,uuid,integer,jsonb,jsonb,text)','execute') as anon,has_function_privilege('service_role','public.hf_replay_commit(uuid,uuid,integer,jsonb,jsonb,text)','execute') as service")).rows[0];assert.deepEqual(grants,{browser:false,anon:false,service:true});
  await h.db.exec('set role authenticated');await assert.rejects(()=>h.db.query("select public.hf_replay_commit(null,null,0,'[]','{}','x')"),/permission denied/);await h.db.exec('reset role');
  const privateGrants=(await h.admin("select bool_and(not has_function_privilege('authenticated',p.oid,'execute') and not has_function_privilege('anon',p.oid,'execute')) as denied from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='hf_private'")).rows[0];assert(privateGrants.denied);
 });
 let player,device,transcript;
 await check('actual controls, collisions, produce/SQK/weapon pickups and dialogue replay exactly; offline queue is durable',async()=>{
  player=await makeUser();device=await replayDevice(h,player,new Map(),{touch:true,onStart:async(h,u,data)=>{
   // Controlled encounter data belongs to the server fixture, not event claims.
   data.monsters=Array.from({length:30},()=>({type:'gnat',size:'small',hp:50}));data.loot=Array(31).fill('small');data.loot[12]='big';data.loot[13]='coin';data.loot[0]='gun';data.loot[14]='bomb';data.loot[15]='sword';
   await h.admin('update hf_private.runs set monsters=$2::jsonb,loot=$3::text[],hp=$4::double precision[] where id=$1',[data.id,JSON.stringify(data.monsters),data.loot,[...Array(30).fill(50),300]]);
  }});
  await device.t.startGame(1,true);device.net.offline=true;
  for(let i=0;i<2000&&device.t.game.state==='playing';i++){
   device.t.release();const p=device.t.player,e=device.t.enemies.filter(e=>!e.dead&&e.x>p.x-25).sort((a,b)=>a.x-b.x)[0];let x=0,y=0;
   const loot=device.t.pickups.find(k=>k.target!==undefined&&!k.taken);
   if(loot){x=Math.sign(loot.x-p.x);y=Math.sign(loot.y-p.y);device.t.press('interact');}
   else if(e){const dx=e.x-p.x;x=dx>85?1:dx<60?-1:0;y=Math.abs(e.y-p.y-5)>2?Math.sign(e.y-p.y-5):0;if(dx<130&&p.dir>0&&i%16===0)device.t.press('throw');if(x===0&&p.dir<0)x=.05;}
   const len=Math.hypot(x,y);if(len>1){x/=len;y/=len;}Object.assign(device.t.movement,{pointer:1,x,y,amount:Math.hypot(x,y)});device.t.tick();while(device.t.game.state==='dialogue')device.t.advanceDialogue();
  }
  // End through the normal restart path later; force a boundary now with all
  // controls preserved, using the same harmless checkpoint as the live client.
  device.save.record('checkpoint',{},device.t.game.frames);await device.save.flush();transcript=structuredClone(queued(device));
  for(const kind of ['attack','hit','defeat','pickup','forage'])assert(transcript.some(e=>e.kind===kind),kind);
  assert(transcript.some(e=>e.kind==='pickup'&&e.target===13),'real coin pickup');assert(transcript.some(e=>e.kind==='pickup'&&e.target===0),'real gun pickup');
  assert(device.save.snapshot().pendingEvents>0);assert.equal((await h.rpc(player,'hf_wallet_profile')).total_score,0);
  device.net.offline=false;await device.save.retry();assert.equal(device.save.snapshot().pendingEvents,0,device.save.snapshot().status);assert.deepEqual(device.errors,[]);
  const p=device.save.snapshot().profile;assert(p.total_score>=5);assert.equal(p.sqk,1);assert(device.t.player.weapons.includes('gun'));
  const server=await h.rpc(player,'hf_replay_context',{p_run:device.run});assert.equal(server.state.world.player.x,device.t.player.x);assert.equal(server.state.world.player.y,device.t.player.y);assert.deepEqual(server.state.world.player.ammo,JSON.parse(JSON.stringify(device.t.player.ammo)));
 });
 await check('partial replay checkpoints, lost replies and duplicate queues cannot double-credit',async()=>{
  const before=await h.rpc(player,'hf_wallet_profile');await replayRpc(h,player,device.run,transcript.slice(-20));assert.deepEqual(await h.rpc(player,'hf_wallet_profile'),before);
  // New inputs are validated after a restored checkpoint, not replayed from a
  // client position. A committed reply is lost once, then the queue retries.
  const beforeCollected=device.t.game.collected; device.net.loseReply=true;for(let i=0;i<75;i++)tick(device);await device.save.flush();await device.save.retry();assert.equal(device.save.snapshot().pendingEvents,0,device.save.snapshot().status);
  assert.equal((await h.rpc(player,'hf_wallet_profile')).total_score,before.total_score+device.t.game.collected-beforeCollected);
 });
 await check('same wallet on a fresh device recovers SQL scores, inventory and growth without the old local queue',async()=>{
  await h.admin('update hf_private.profiles set sqk=60 where user_id=$1',[player.id]); // purchase funds fixture
  await h.rpc(player,'hf_purchase',{p_item:'costume-batman'});await h.rpc(player,'hf_equip',{p_slot:'costume',p_item:'costume-batman'});
  const alias=await h.identity(player.wallet.toUpperCase().replace('0X','0x'));await h.rpc(alias,'hf_wallet_profile');const other=await replayDevice(h,alias);
  assert.deepEqual(JSON.parse(JSON.stringify(other.save.snapshot().profile)),await h.rpc(player,'hf_wallet_profile'));assert.equal(other.save.snapshot().pendingEvents,0);assert.equal(other.save.snapshot().profile.cosmetics.costume,'costume-batman');
  const board=await h.rpc(null,'hf_lifetime_top100');assert(board.rows.some(row=>row.score===other.save.snapshot().profile.total_score));
 });
 await check('validated rewards defer without loss, settle on another device, and retain offline batches until payment',async()=>{
  const u=await makeUser(),d=await replayDevice(h,u);await d.t.startGame(1,true);d.net.offline=true;
  for(let i=0;i<15;i++)tick(d,['right']);tick(d,[],['interact']);await d.save.flush();
  await h.admin('update hf_private.profiles set reward_tokens=0,reward_at=clock_timestamp() where user_id=$1',[u.id]);d.net.offline=false;await d.save.retry();
  assert.equal(d.save.snapshot().profile.total_score,0);assert.equal(d.save.snapshot().pendingRewards,2);assert(d.save.snapshot().pendingEvents>0);
  const fresh=await replayDevice(h,u);assert.equal(fresh.save.snapshot().pendingRewards,2);assert.equal(fresh.save.snapshot().pendingEvents,0);
  await h.admin('update hf_private.profiles set reward_tokens=150 where user_id=$1',[u.id]);await fresh.save.retry();await d.save.retry();assert.equal(fresh.save.snapshot().profile.total_score,2);assert.equal(d.save.snapshot().pendingEvents,0);assert.equal((await h.rpc(u,'hf_wallet_profile')).produce_points,2);
 });
 await check('an offline reload retains its signed session and inputs, then online recovery uploads them',async()=>{
  const u=await makeUser(),d=await replayDevice(h,u);await d.t.startGame(1,true);d.net.offline=true;for(let i=0;i<15;i++)tick(d,['right']);tick(d,[],['interact']);await d.save.flush();
  const restored=await replayDevice(h,u,d.storage,{offline:true});assert.equal(restored.save.snapshot().cloud,false);assert(restored.save.snapshot().pendingEvents>0);restored.net.offline=false;restored.ctx.dispatchEvent(new Event('online'));for(let i=0;i<200&&(!restored.save.snapshot().cloud||restored.save.snapshot().pendingEvents);i++)await new Promise(done=>setTimeout(done,10));assert.equal(restored.save.snapshot().profile.total_score,2);assert.equal(restored.save.snapshot().pendingEvents,0);
 });
 await check('stale concurrent replay commits fail atomically; independent wallet runs retain valid queues',async()=>{
  const u=await makeUser(),r=await start(u),events=[{kind:'checkpoint',seq:1,frame:1,inputs:[input(0)]}];
  const context=await h.rpc(u,'hf_replay_context',{p_run:r.id}),result=await validateReplay(context,events);await replayRpc(h,u,r.id,events);
  await assert.rejects(()=>h.admin('select public.hf_replay_commit($1,$2,0,$3::jsonb,$4::jsonb,$5)',[u.id,r.id,JSON.stringify(result.events),JSON.stringify(result.state),engineHash]),/changed during replay/);
  const r2=await start(u);await replayRpc(h,u,r2.id,events);assert.equal((await h.rpc(u,'hf_run_state',{p_run:r.id})).status,'active');assert.equal((await h.rpc(u,'hf_run_state',{p_run:r2.id})).ack,1);
 });
 await check('trusted mid-boss checkpoints replay real hits, then save automatic completion on all four maps',async()=>{
  for(let map=1;map<=4;map++){
   const u=await makeUser();await h.admin('update hf_private.profiles set highest_map=4 where user_id=$1',[u.id]);const d=await replayDevice(h,u);await d.t.startGame(map,true);d.net.offline=true;
   // Explicit trusted checkpoint fixture: isolates resume/finish transport,
   // not a claim to have played an entire map. All subsequent hits/collisions
   // and completion come from actual controls through both real engines.
   const c=await h.rpc(u,'hf_replay_context',{p_run:d.run});const replay=await createReplay(c.config);const state=replay.snapshot();
   for(const world of [state.world,{player:d.t.player,boss:d.t.boss,game:d.t.game}]){
    world.game.frames=[60,90,120,150][map-1]*60;world.game.arenaLocked=true;
    world.boss.state='stunned';world.boss.t=200;world.boss.hp=25;
    world.player.x=world.boss.x-60;world.player.y=146;
   }
   const oldRun=d.run;await h.admin('update hf_private.runs set replay_state=$2::jsonb,replay_hash=$3,hp[31]=25 where id=$1',[oldRun,JSON.stringify(state),engineHash]);
   for(let i=0;i<220&&d.t.game.state==='playing';i++)tick(d,[],i%16===0?['throw']:[]);
   await d.save.flush();assert(queued(d).some(e=>e.kind==='finish'),'map '+map+' did not finish');
   d.net.offline=false;await d.save.retry();assert.equal(d.save.snapshot().pendingEvents,0,d.save.snapshot().status);assert.deepEqual(d.errors,[]);
   assert.equal((await h.rpc(u,'hf_run_state',{p_run:oldRun})).status,'complete');assert((await h.rpc(u,'hf_wallet_profile')).highest_map>=map+1);
  }
 });
 await check('all four authored maps preserve keyboard/jump/analog physics during server replay',async()=>{
  for(let map=1;map<=4;map++){
   const u=await makeUser();await h.admin('update hf_private.profiles set highest_map=4 where user_id=$1',[u.id]);const d=await replayDevice(h,u);await d.t.startGame(map,true);d.net.offline=true;
   for(let i=0;i<120&&d.t.game.state==='playing';i++)tick(d,['right','jump'],i%20===0?['throw','jump']:[]);
   if(d.save.snapshot().ranked)d.save.record('checkpoint',{},d.t.game.frames);await d.save.flush();d.net.offline=false;await d.save.retry();assert.equal(d.save.snapshot().pendingEvents,0,d.save.snapshot().status);assert.deepEqual(d.errors,[]);
  }
 });
}finally{await h.close();}
await mkdir('test/scratch/replay',{recursive:true});await writeFile('test/scratch/replay/results.json',JSON.stringify({results,limitations:['Disposable PostgreSQL/Auth/HTTP fixtures, not production.','Run clocks accelerated and encounter loot/specs controlled only in explicitly marked legitimate-play fixtures. Exploit regression uses no engine/time/loot edits.','Automated replay validates game inputs; it does not prove a human supplied them or prevent bots playing legal moves.']},null,2));console.log(results.length+' authoritative replay checks passed.');
