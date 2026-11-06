import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fixture} from './major-fixture.mjs';
const results=[];
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
async function game(){const f=await fixture({touch:true,globals:{PointerEvent:class {}}});await f.t.startGame(1,true);Object.assign(f.t.player,{x:400,y:55,vx:0,vy:0,onGround:false});return f;}
function pointer(f,type,x=100,y=300,id=1){const e={type,clientX:x,clientY:y,pointerId:id,pointerType:'touch',preventDefault(){}};(type==='pointerdown'||type==='lostpointercapture'?f.nodes.get('touch-movement'):f.ctx).dispatchEvent(e);}
function step(f,count=12){for(let i=0;i<count;i++){f.t.updateTouchVector();f.t.updatePlayer();f.t.release();}}
await check('any left-half start anchors to Chang without teleporting or requiring a fixed center',async()=>{
 for(const [x,y]of [[1,1],[150,700],[280,120]]){const f=await game();pointer(f,'pointerdown',x,y);step(f,10);assert.equal(f.t.player.x,400);assert.equal(f.t.player.y,55);pointer(f,'pointermove',x+12,y);step(f);assert(f.t.player.x>410);}
});
await check('eight directions track both axes with a bounded vector and correct facing',async()=>{
 for(const [dx,dy]of [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]){
  const f=await game();pointer(f,'pointerdown');pointer(f,'pointermove',100+dx*18,300+dy*18);step(f);
  const p=f.t.player;if(dx)assert.equal(Math.sign(p.x-400),dx);else assert(Math.abs(p.x-400)<0.01);
  if(dy)assert.equal(Math.sign(p.y-55),dy);else assert(Math.abs(p.y-55)<0.01);
  assert(Math.hypot(f.t.movement.x,f.t.movement.y)<=1.000001);if(dx)assert.equal(p.dir,dx);
 }
});
await check('a stationary finger lets Chang reach its target and stop; tiny drags remain responsive',async()=>{
 const f=await game();pointer(f,'pointerdown');pointer(f,'pointermove',112,300);const target=f.t.movement.targetX;step(f,120);
 assert(Math.abs(f.t.player.x-target)<0.25);assert(Math.abs(f.t.player.vx)<0.01);
 pointer(f,'pointermove',113,300);step(f,30);assert(f.t.player.x>target+2);
});
await check('unrestricted long drag can reverse and cross the center without returning to an origin',async()=>{
 const f=await game();pointer(f,'pointerdown');pointer(f,'pointermove',400,300);step(f,20);pointer(f,'pointermove',80,300);step(f,20);assert(f.t.player.vx<0);
});
await check('finger displacement uses the rendered canvas scale and does not depend on touch location',async()=>{
 for(const scale of [1,2,4]){const f=await game();f.nodes.get('game').getBoundingClientRect=()=>({left:0,top:0,width:320*scale,height:192*scale});pointer(f,'pointerdown');pointer(f,'pointermove',100+20*scale,300-10*scale);assert.equal(f.t.movement.targetX,420);assert.equal(f.t.movement.targetY,45);}
});
await check('release, cancellation and lost capture brake horizontal drift within eight ticks and restore gravity',async()=>{
 for(const type of ['pointerup','pointercancel','lostpointercapture']){const f=await game();pointer(f,'pointerdown');pointer(f,'pointermove',118,282);step(f);assert(f.t.player.vy<0);pointer(f,type);step(f,8);assert.equal(f.t.player.vx,0);step(f,10);assert(f.t.player.vy>0);assert.equal(f.t.movement.pointer,null);}
});
await check('unrelated fingers cannot steal movement or release its owner',async()=>{
 const f=await game();pointer(f,'pointerdown');pointer(f,'pointermove',118,300);pointer(f,'pointerdown',20,300,2);pointer(f,'pointermove',0,300,2);pointer(f,'pointerup',0,300,2);step(f);assert(f.t.player.vx>1.5);assert.equal(f.t.movement.pointer,1);
 pointer(f,'pointerup');pointer(f,'pointerdown',100,300,2);pointer(f,'pointermove',82,300,2);step(f);assert(f.t.player.vx<0);
});
await check('blur, viewport changes and pause discard ownership and require a new touch',async()=>{
 for(const type of ['hamster:viewport','blur']){const f=await game();pointer(f,'pointerdown');pointer(f,'pointermove',118,300);step(f);f.ctx.dispatchEvent(new Event(type));if(type==='blur')f.ctx.__hamster.resume();assert.equal(f.t.movement.pointer,null);pointer(f,'pointermove',0,0);step(f,12);assert.equal(f.t.player.vx,0);}
 const f=await game();pointer(f,'pointerdown');f.ctx.__hamster.pause();pointer(f,'pointermove',120,300);assert.equal(f.t.movement.pointer,null);
});
await check('jump, hurt, stomp and keyboard retain priority independently of touch release',async()=>{
 const f=await game();f.t.hold('left',true);pointer(f,'pointerdown');pointer(f,'pointermove',118,300);f.t.updateTouchVector();f.t.updatePlayer();assert(f.t.player.vx<0);pointer(f,'pointerup');f.t.updatePlayer();assert(f.t.player.vx<0);
 f.t.release();Object.assign(f.t.player,{onGround:true,y:146,vy:0});pointer(f,'pointerdown');f.t.hold('jump',true);f.t.press('jump');f.t.updatePlayer();assert(f.t.player.vy<-5);
 f.t.release();Object.assign(f.t.player,{vy:-4,hurt:5});f.t.updatePlayer();assert.equal(f.t.player.vy,-3.75);
 Object.assign(f.t.player,{vy:-4,hurt:0,noCut:true,steeringJump:false});f.t.updatePlayer();assert.equal(f.t.player.vy,-3.75);
});
await check('ceiling, floor, world boundaries and solid tiles constrain direct movement',async()=>{
 const f=await game();Object.assign(f.t.player,{x:96,y:146,onGround:true});pointer(f,'pointerdown');pointer(f,'pointermove',100,600);step(f,30);assert.equal(f.t.player.y,146);assert.equal(f.t.player.onGround,true);
 Object.assign(f.t.player,{x:2,y:1,onGround:false});pointer(f,'pointerup');pointer(f,'pointerdown');pointer(f,'pointermove',-500,-500);step(f,30);assert(f.t.player.x>=0);assert.equal(f.t.player.y,0);
});
await check('Touch Events fallback owns one identifier and clears cancellation without blocking unrelated contacts',async()=>{
 const f=await fixture({touch:true});await f.t.startGame(1,true);Object.assign(f.t.player,{x:400,y:55,vx:0,vy:0,onGround:false});
 let prevented=0;const e=(type,contacts)=>({type,cancelable:true,changedTouches:contacts.map(([identifier,clientX,clientY])=>({identifier,clientX,clientY})),preventDefault(){prevented++;}});
 f.nodes.get('touch-movement').dispatchEvent(e('touchstart',[[7,100,300]]));f.ctx.dispatchEvent(e('touchmove',[[8,0,0],[7,118,282]]));step(f);assert(f.t.player.x>410);assert(f.t.player.y<55);assert(prevented>0);
 f.ctx.dispatchEvent(e('touchend',[[8,0,0]]));assert.equal(f.t.movement.pointer,7);f.ctx.dispatchEvent(e('touchcancel',[[7,118,282]]));assert.equal(f.t.movement.pointer,null);
});
await mkdir('test/scratch/personal-best',{recursive:true});await writeFile('test/scratch/personal-best/movement-results.json',JSON.stringify({results,limitations:['Actual input handlers and physics in a VM with DOM/canvas fixtures.','Physical mobile hardware is unavailable; browser touch/capture checks are recorded separately.']},null,2)+'\n');
console.log(results.length+' direct-touch groups passed.');
