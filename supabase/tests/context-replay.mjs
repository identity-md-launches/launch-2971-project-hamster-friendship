// Real context-button handler, durable save queue, gameplay replay and SQL.
// Only DOM, Auth, transport and elapsed run time use the existing local fixture.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHarness} from './major-harness.mjs';
import {replayDevice,replayRpc,tick,queued} from './replay-fixture.mjs';

const h=await createHarness(10),results=[];
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
async function atBasket(){
 const user=await h.identity();await h.rpc(user,'hf_wallet_profile');
 const device=await replayDevice(h,user,new Map(),{touch:true});
 await device.t.startGame(1,true);device.net.offline=true;
 for(let i=0;i<15;i++)tick(device,['right']);
 device.t.release();device.t.render();
 assert.equal(device.t.game.frames,15);assert.equal(Math.round(device.t.player.x),117);
 const button=device.nodes.get('context-interact');
 assert.equal(button.hidden,false);assert.equal(button.textContent,'Open');
 return {user,device,button};
}
async function openBasket(device,button){
 // Exercise the installed click handler, not a synthetic pressed.interact bit.
 button.dispatchEvent({type:'click'});
 // tick() below must consume the handler's input; the tick helper would clear it.
 device.t.tick();
 assert.equal(device.t.game.state,'dialogue');assert.equal(device.t.game.collected,2);
 while(device.t.game.state==='dialogue')device.t.advanceDialogue();
 device.save.record('checkpoint',{},device.t.game.frames);await device.save.flush();
 return queued(device);
}
try{
 await check('mobile Open replays and credits its offline basket exactly once, then permits a ranked restart',async()=>{
  const {user,device:d,button}=await atBasket();
  const events=await openBasket(d,button);
  assert.equal(d.save.snapshot().pendingEvents,2);
  assert.equal((await h.rpc(user,'hf_wallet_profile')).total_score,0);
  d.net.offline=false;await d.save.retry();
  assert.equal((await h.rpc(user,'hf_wallet_profile')).total_score,2,JSON.stringify(d.errors));
  assert.equal((await h.rpc(user,'hf_run_state',{p_run:d.run})).ack,2);
  assert.equal(d.save.snapshot().pendingEvents,0);assert.equal(d.save.snapshot().runConflict,false);
  assert.equal(queued(d).length,0);assert.deepEqual(d.errors,[]);
  assert.equal(events[0].source,'basket');
  assert(events[0].inputs.some(input=>input.frame===15&&input.ticks===1&&(input.pressed&16)), 'Open must persist the interaction control');
  const saved=await h.rpc(user,'hf_wallet_profile');
  await replayRpc(h,user,d.run,events);await d.save.retry();
  assert.deepEqual(await h.rpc(user,'hf_wallet_profile'),saved,'duplicate retry must not credit twice');
  const oldRun=d.run;await d.t.startGame(1,true);
  assert.equal(d.t.game.state,'playing');assert.notEqual(d.run,oldRun);assert(d.save.snapshot().ranked);
  assert.equal((await h.rpc(user,'hf_wallet_profile')).total_score,2);
 });
 await check('Open waits for the recorded tick and multiple clicks cannot open a basket twice',async()=>{
  const {user,device:d,button}=await atBasket();
  button.dispatchEvent({type:'click'});button.dispatchEvent({type:'click'});
  assert.equal(d.t.game.state,'playing');assert.equal(d.t.game.collected,0);assert.equal(queued(d).length,0);
  const events=await openBasket(d,button);
  assert.equal(events.filter(e=>e.source==='basket').length,1);
  tick(d);d.t.render();assert.equal(button.hidden,true);
  d.net.offline=false;await d.save.retry();
  assert.equal((await h.rpc(user,'hf_wallet_profile')).total_score,2);assert.equal(d.save.snapshot().pendingEvents,0);
 });
 await check('an offline reload retains Open inputs; reconnect saves them and another device recovers the score',async()=>{
  const {user,device:d,button}=await atBasket();await openBasket(d,button);
  const restored=await replayDevice(h,user,d.storage,{offline:true,touch:true});
  assert.equal(restored.save.snapshot().cloud,false);assert.equal(restored.save.snapshot().pendingEvents,2);
  restored.net.offline=false;await restored.save.retry();
  assert.equal(restored.save.snapshot().pendingEvents,0);assert.equal(restored.save.snapshot().profile.total_score,2);
  assert.deepEqual(restored.errors,[]);
  const other=await replayDevice(h,user,new Map(),{touch:true});
  assert.equal(other.save.snapshot().profile.total_score,2);assert.equal(other.save.snapshot().profile.produce_points,2);
  assert.equal(other.save.snapshot().pendingEvents,0);
  const board=await h.rpc(null,'hf_lifetime_top100');
  assert(board.rows.some(row=>row.score===2));
 });
 await check('context clicks while paused or reading do not enqueue another gameplay action',async()=>{
  const {device:d,button}=await atBasket();d.ctx.__hamster.pause();
  button.dispatchEvent({type:'click'});d.ctx.__hamster.resume();d.t.tick();
  assert.equal(d.t.game.state,'playing');assert.equal(d.t.game.collected,0);
  button.dispatchEvent({type:'click'});d.t.tick();assert.equal(d.t.game.state,'dialogue');
  button.dispatchEvent({type:'click'});
  while(d.t.game.state==='dialogue')d.t.advanceDialogue();d.t.tick();
  d.save.record('checkpoint',{},d.t.game.frames);await d.save.flush();
  const inputs=queued(d).flatMap(e=>e.inputs);
  assert.equal(inputs.filter(input=>input.pressed&16).length,1);
  d.net.offline=false;await d.save.retry();assert.equal(d.save.snapshot().pendingEvents,0);assert.deepEqual(d.errors,[]);
 });
}finally{await h.close();}
await mkdir('test/scratch/context',{recursive:true});
await writeFile('test/scratch/context/results.json',JSON.stringify({results,limitations:[
 'Disposable PostgreSQL migrations 001–010, fixture Auth/HTTP/DOM and accelerated elapsed run time; no production write.',
 'Real client/game input handlers and validateReplay/hf_replay_commit; no player position, reward or encounter edits.',
 'Browser hit testing and physical touch hardware are separate checks.'
]},null,2)+'\n');
console.log(results.length+' context replay checks passed.');
