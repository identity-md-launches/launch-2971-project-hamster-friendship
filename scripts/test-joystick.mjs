// Joystick input and physics in the real game source (VM with DOM fixtures),
// plus a server-replay round trip through disposable PostgreSQL.
// The fixture's joystick box is 96px wide, so its centre is x=48 and the
// knob travel is 96 * 0.3 = 28.8px.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fixture} from './major-fixture.mjs';
const results=[];
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
const CX=48,TRAVEL=28.8;
async function game({air=false}={}){const f=await fixture({touch:true,globals:{PointerEvent:class {}}});await f.t.startGame(1,true);
 // settle onto the floor first so ground friction applies
 Object.assign(f.t.player,{x:400,vx:0});for(let i=0;i<60;i++){f.t.updatePlayer();f.t.release();}
 if(air)Object.assign(f.t.player,{y:40,vy:0,onGround:false});return f;}
function pointer(f,type,dx=0,dy=0,id=1){const e={type,clientX:CX+dx,clientY:300+dy,pointerId:id,pointerType:'touch',button:0,preventDefault(){}};(type==='pointerdown'||type==='lostpointercapture'?f.nodes.get('touch-movement'):f.ctx).dispatchEvent(e);}
function step(f,count=1){for(let i=0;i<count;i++){f.t.updateTouchVector();f.t.updatePlayer();f.t.release();}}

await check('a press inside the dead zone produces no movement',async()=>{
 const f=await game(),x=f.t.player.x;pointer(f,'pointerdown',TRAVEL*0.1,0);step(f,30);pointer(f,'pointermove',-TRAVEL*0.15,4);step(f,30);
 assert.equal(f.t.movement.x,0);assert.equal(f.t.player.x,x);assert.equal(f.t.player.vx,0);
});
await check('forward/back is analog: speed grows with deflection and is capped at the walk limit',async()=>{
 const speeds=[];
 for(const k of [0.3,0.6,1,2.5]){const f=await game();pointer(f,'pointerdown',TRAVEL*k,0);step(f,60);speeds.push(f.t.player.vx);assert(f.t.player.vx<=1.7+1e-9);}
 assert(speeds[0]>0&&speeds[0]<speeds[1]&&speeds[1]<speeds[2],'speeds '+speeds);assert(Math.abs(speeds[2]-1.7)<0.01);assert.equal(speeds[3],speeds[2]);
 const f=await game();pointer(f,'pointerdown',-TRAVEL,0);step(f,60);assert(f.t.player.vx<-1.69);assert.equal(f.t.player.dir,-1);
});
await check('vertical and diagonal finger motion never steer vertically; only the horizontal component counts',async()=>{
 for(const [dx,dy] of [[0,-60],[0,60],[TRAVEL,-TRAVEL],[-TRAVEL,TRAVEL]]){
  const f=await game();const y=f.t.player.y;pointer(f,'pointerdown');pointer(f,'pointermove',dx,dy);step(f,40);
  assert.equal(f.t.movement.y,0);assert.equal(f.t.player.y,y,'standing height changed for '+dx+','+dy);
  if(!dx){assert.equal(f.t.movement.x,0);assert.equal(f.t.player.vx,0);}else assert.equal(Math.sign(f.t.player.vx),Math.sign(dx));
 }
});
await check('gravity is unchanged while the stick is held: Chang falls exactly as with no touch',async()=>{
 const a=await game({air:true}),b=await game({air:true});pointer(a,'pointerdown',0,-80);
 for(let i=0;i<20;i++){step(a);step(b);}assert(a.t.player.y>40);assert.equal(a.t.player.y,b.t.player.y);assert.equal(a.t.player.vy,b.t.player.vy);
});
await check('input eases toward the finger instead of jumping to it',async()=>{
 const f=await game();pointer(f,'pointerdown');pointer(f,'pointermove',TRAVEL,0);f.t.updateTouchVector();assert(f.t.movement.x>0.3&&f.t.movement.x<0.7);
 for(let i=0;i<10;i++)f.t.updateTouchVector();assert.equal(f.t.movement.x,1);
});
await check('release stops smoothly: speed decays over several frames and reaches zero',async()=>{
 for(const type of ['pointerup','pointercancel','lostpointercapture']){
  const f=await game();pointer(f,'pointerdown',TRAVEL,0);step(f,60);pointer(f,type,TRAVEL,0);assert.equal(f.t.movement.pointer,null);assert.equal(f.t.movement.x,0);
  const trace=[];for(let i=0;i<30;i++){step(f);trace.push(f.t.player.vx);}
  assert(trace[0]>0.9&&trace[0]<1.7,'first frame after release '+trace[0]);assert(trace[2]>0.2,'stopped too abruptly');assert.equal(trace[29],0);
  for(let i=1;i<trace.length;i++)assert(trace[i]<=trace[i-1]);
 }
});
await check('the stick has one owner; other fingers cannot steal or release it',async()=>{
 const f=await game();pointer(f,'pointerdown',TRAVEL,0,1);pointer(f,'pointerdown',-TRAVEL,0,2);pointer(f,'pointermove',-TRAVEL,0,2);pointer(f,'pointerup',0,0,2);step(f,30);
 assert.equal(f.t.movement.pointer,1);assert(f.t.player.vx>1.6);
});
await check('blur, viewport change and pause clear the stick and need a new touch',async()=>{
 for(const type of ['hamster:viewport','blur']){const f=await game();pointer(f,'pointerdown',TRAVEL,0);step(f,10);f.ctx.dispatchEvent(new Event(type));if(type==='blur')f.ctx.__hamster.resume();assert.equal(f.t.movement.pointer,null);pointer(f,'pointermove',TRAVEL,0);step(f,40);assert.equal(f.t.player.vx,0);}
 const f=await game();pointer(f,'pointerdown');f.ctx.__hamster.pause();assert.equal(f.t.movement.pointer,null);
});
await check('keyboard, Jump and hurt keep priority over the stick',async()=>{
 const f=await game();pointer(f,'pointerdown',TRAVEL,0);step(f,20);f.t.hold('left',true);f.t.updateTouchVector();f.t.updatePlayer();assert(f.t.player.vx<1.7);
 f.t.release();for(let i=0;i<30;i++){f.t.hold('left',true);f.t.updateTouchVector();f.t.updatePlayer();}assert(f.t.player.vx<0);f.t.release();
 Object.assign(f.t.player,{onGround:true,vy:0});f.t.hold('jump',true);f.t.press('jump');f.t.updateTouchVector();f.t.updatePlayer();assert(f.t.player.vy<-5,'jump while walking');
});
await check('recorded control frames carry y = 0 and a bounded x, accepted by the replay validator shape',async()=>{
 const f=await game();const inputs=[];f.ctx.HamsterSave.input=v=>inputs.push(v);
 pointer(f,'pointerdown');pointer(f,'pointermove',TRAVEL*0.7,-40);for(let i=0;i<20;i++)f.t.tick();pointer(f,'pointerup');for(let i=0;i<5;i++)f.t.tick();
 assert(inputs.length>=20);for(const v of inputs){assert.equal(v.y,0);assert(Math.abs(v.x)<=1);if(!v.touch)assert.equal(v.x,0);}
 assert(inputs.some(v=>v.touch&&v.x>0.3));
});

// Server replay of joystick play (disposable PostgreSQL + the shipped engine).
let replayed='not run';
try{
 const {createHarness}=await import('../supabase/tests/major-harness.mjs');
 const {replayDevice,queued}=await import('../supabase/tests/replay-fixture.mjs');
 await check('server replay of joystick walking reproduces the client position and accepts the save',async()=>{
  const h=await createHarness(11);try{
   const user=await h.identity();await h.rpc(user,'hf_wallet_profile');
   const d=await replayDevice(h,user,new Map(),{touch:true});await d.t.startGame(1,true);
   const tickD=()=>{d.t.release();d.t.tick();while(d.t.game.state==='dialogue')d.t.advanceDialogue();};
   const move=(type,dx)=>{const e={type,clientX:CX+dx,clientY:300,pointerId:5,pointerType:'touch',button:0,preventDefault(){}};(type==='pointerdown'?d.nodes.get('touch-movement'):d.ctx).dispatchEvent(e);};
   move('pointerdown',TRAVEL*0.5);for(let i=0;i<40;i++)tickD();move('pointermove',TRAVEL);for(let i=0;i<40;i++)tickD();move('pointermove',-TRAVEL);for(let i=0;i<30;i++)tickD();move('pointerup',0);for(let i=0;i<20;i++)tickD();
   const clientX=d.t.player.x;
   d.save.record('checkpoint',{},d.t.game.frames);await d.save.flush();
   assert.deepEqual(d.errors,[],'server rejected the replay: '+d.errors.join('; '));assert.equal(queued(d).length,0,'events were not acknowledged');
   const row=(await h.admin("select replay_state from hf_private.runs where id=$1",[d.run])).rows[0];
   assert(row&&row.replay_state&&row.replay_state.world,'no server replay state');assert.equal(row.replay_state.world.player.x,clientX);
   replayed='accepted; server x '+row.replay_state.world.player.x+' = client x '+clientX;
  }finally{await h.close();}
 });
}catch(e){if(/Cannot find|ERR_MODULE_NOT_FOUND/.test(e.message)){replayed='skipped: PGlite is not installed under test/scratch';console.log('skip',replayed);}else throw e;}
await mkdir('test/scratch/joystick',{recursive:true});
await writeFile('test/scratch/joystick/engine-results.json',JSON.stringify({results,replayed,limitations:['Actual input handlers and physics in a VM with DOM/canvas fixtures; server replay uses disposable PostgreSQL, not production.']},null,2)+'\n');
console.log(results.length+' joystick groups passed. Server replay: '+replayed);
