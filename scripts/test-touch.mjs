// Exercise the actual engine's event handlers in the existing VM fixture.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fixture} from './major-fixture.mjs';
const results=[];
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
async function game(){const f=await fixture({touch:true});await f.t.startGame(1,true);Object.assign(f.t.player,{x:400,y:55,vx:0,vy:0,onGround:false});return f;}
function pointer(f,type,x=100,y=300,id=1){const event={type,clientX:x,clientY:y,pointerId:id,pointerType:'touch',preventDefault(){}};f.nodes.get('touch-movement').dispatchEvent(event);}
function step(f,count=12){for(let i=0;i<count;i++){f.t.updatePlayer();f.t.release();}}
await check('fixed ring, thumb and joystick are completely absent from source',async()=>{
 for(const file of ['src/game.js','src/styles.css','src/index.html'])assert(!/joystick|joystick-thumb|--stick-x/.test(await readFile(file,'utf8')),file);
});
await check('eight directions use both axes, normalize diagonal speed and preserve facing',async()=>{
 for(const [dx,dy]of [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]){
  const f=await game();pointer(f,'pointerdown');pointer(f,'pointermove',100+dx*56,300+dy*56);step(f);const p=f.t.player;
  if(dx)assert.equal(Math.sign(p.x-400),dx);else assert(Math.abs(p.x-400)<0.01);
  if(dy)assert.equal(Math.sign(p.y-55),dy);else assert(Math.abs(p.y-55)<0.01);
  assert(Math.hypot(p.vx,p.vy)<=1.701);if(dx)assert.equal(p.dir,dx);
 }
});
await check('touch origin floats at arbitrary start points; dead zone avoids jitter and drag length controls speed',async()=>{
 for(const [x,y]of [[10,20],[150,700],[280,120]]){const f=await game();pointer(f,'pointerdown',x,y);pointer(f,'pointermove',x+4,y+1);step(f,4);assert.equal(f.t.player.x,400);pointer(f,'pointermove',x+56,y);step(f);assert(f.t.player.x>410);}
 const slow=await game(),fast=await game();for(const f of [slow,fast])pointer(f,'pointerdown');pointer(slow,'pointermove',112,300);pointer(fast,'pointermove',156,300);step(slow);step(fast);assert(slow.t.player.vx>0);assert(slow.t.player.vx<fast.t.player.vx/4);
});
await check('long drags follow the finger and can reverse without returning to the original start',async()=>{
 const f=await game();pointer(f,'pointerdown');pointer(f,'pointermove',400,300);step(f);pointer(f,'pointermove',330,300);step(f);assert(f.t.player.vx<0);
});
await check('second fingers and unrelated terminal events cannot steal or release movement',async()=>{
 const f=await game();pointer(f,'pointerdown');pointer(f,'pointermove',156,300);pointer(f,'pointerdown',20,300,2);pointer(f,'pointermove',0,300,2);pointer(f,'pointerup',0,300,2);step(f);assert(f.t.player.vx>1.6);
 pointer(f,'pointerup');pointer(f,'pointerdown',140,400,2);pointer(f,'pointermove',84,400,2);step(f);assert(f.t.player.vx<0);
});
await check('release, cancellation and lost capture stop steering and restore gravity',async()=>{
 for(const type of ['pointerup','pointercancel','lostpointercapture']){const f=await game();pointer(f,'pointerdown');pointer(f,'pointermove',100,244);step(f);assert(f.t.player.vy<0);pointer(f,type);step(f,18);assert(f.t.player.vy>0);}
});
await check('viewport changes and blur discard gesture ownership; resuming requires a fresh touch',async()=>{
 for(const type of ['hamster:viewport','blur']){const f=await game();pointer(f,'pointerdown');pointer(f,'pointermove',156,300);step(f);f.ctx.dispatchEvent(new Event(type));if(type==='blur')f.ctx.__hamster.resume();pointer(f,'pointermove',44,300);Object.assign(f.t.player,{vx:0,vy:0});step(f,1);assert.equal(f.t.player.vx,0);pointer(f,'pointerdown');pointer(f,'pointermove',44,300);step(f);assert(f.t.player.vx<0);}
});
await check('touch release never releases keyboard movement, and desktop jump/attack remain usable',async()=>{
 const f=await game();f.t.hold('left',true);pointer(f,'pointerdown');pointer(f,'pointermove',156,300);f.t.updatePlayer();assert(f.t.player.vx<0);pointer(f,'pointerup');f.t.updatePlayer();assert(f.t.player.vx<0);
 f.t.hold('left',false);Object.assign(f.t.player,{onGround:true,y:146,vy:0});f.t.press('jump');f.t.hold('jump',true);f.t.updatePlayer();assert(f.t.player.vy<-5);f.t.press('throw');f.t.updatePlayer();assert.equal(f.ctx.__hamster.snapshot().attacks,1);
});
await check('Jump overrides touch steering; hurt and stomp impulses retain control',async()=>{
 const f=await game();Object.assign(f.t.player,{onGround:true,y:146});pointer(f,'pointerdown');pointer(f,'pointermove',156,300);f.t.hold('jump',true);f.t.press('jump');f.t.updatePlayer();assert(f.t.player.vy<-5);
 f.t.release();Object.assign(f.t.player,{vy:-4,hurt:5});f.t.updatePlayer();assert.equal(f.t.player.vy,-3.75);
 Object.assign(f.t.player,{vy:-4,hurt:0,noCut:true,steeringJump:false});f.t.updatePlayer();assert.equal(f.t.player.vy,-3.75);
});
await check('walking with a horizontal drag retains ground contact and can jump after coyote time',async()=>{
 const f=await game();Object.assign(f.t.player,{x:96,y:146,onGround:true});pointer(f,'pointerdown');pointer(f,'pointermove',156,300);step(f,20);assert.equal(f.t.player.onGround,true);f.t.press('jump');f.t.hold('jump',true);f.t.updatePlayer();assert(f.t.player.vy<-5);
});
await check('solid ground and world ceiling stop steering without bypassing collision',async()=>{
 const f=await game();Object.assign(f.t.player,{x:96,y:146,vy:0});pointer(f,'pointerdown');pointer(f,'pointermove',100,356);step(f,30);assert.equal(f.t.player.y,146);assert.equal(f.t.player.onGround,true);
 Object.assign(f.t.player,{y:1,vy:0});pointer(f,'pointermove',100,200);step(f,20);assert.equal(f.t.player.y,0);assert.equal(f.t.player.vy,0);
});
await mkdir('test/scratch/touch',{recursive:true});await writeFile('test/scratch/touch/engine-results.json',JSON.stringify({results,limitations:['VM uses actual engine handlers and physics with DOM/canvas fixtures; no physical touch hardware.']},null,2));
console.log(results.length+' touch engine checks passed.');
