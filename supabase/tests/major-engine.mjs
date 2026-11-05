// Actual engine -> actual save.js -> real PostgreSQL. Position, elapsed wall
// time, Auth and HTTP are controlled fixtures, never production substitutes.
import assert from 'node:assert/strict';
import {fixture} from '../../scripts/major-fixture.mjs';
import {createHarness} from './major-harness.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const h=await createHarness(),results=[],prefix='hamster-friendship-v2';
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
const errors=[],requests=[];let lastRun;
try{
 const a=await h.identity();await h.rpc(a,'hf_wallet_profile');await h.admin('update hf_private.profiles set sqk=275,total_score=1400,highest_map=4 where user_id=$1',[a.id]);
 const storage=new Map([[prefix+'-wallet-session-'+a.wallet,JSON.stringify({access_token:a.id,refresh_token:a.id,expires_at:Date.now()/1000+3600})]]);
 const f=await fixture({storage,config:{supabaseUrl:'https://fixture.invalid',supabasePublishableKey:'fixture-public'},fetch:async(url,options)=>{
  const name=new URL(url).pathname.split('/').pop(),body=JSON.parse(options.body||'{}');requests.push({name,body});
  try{const data=await h.rpc(options.headers.Authorization?a:null,name,body);if(name==='hf_start_run_v6'){lastRun=data.id;await h.admin("update hf_private.runs set started_at=clock_timestamp()-interval '2 hours' where id=$1",[data.id]);}return{ok:true,json:async()=>data};}catch(error){errors.push(error.message);return{ok:false,json:async()=>({message:error.message})};}
 }}),{t,ctx}=f,save=ctx.HamsterSave;
 await save.setWallet(a.wallet);await t.startGame(1,true);
 await check('all four maps play through legal engine combat, pickups and automatic SQL-backed progression',async()=>{
  for(let map=1;map<=4;map++){
   assert.equal(ctx.__hamster.snapshot().map,map);assert(save.snapshot().ranked);let frame=0;
   for(const e of t.enemies){
    while(e.hp>0){t.game.frames=frame;const aid=t.attack('shell');t.hitEnemy(e,25,0,aid);frame+=16;}
    const drop=t.pickups.find(p=>p.target===e.id);if(drop){drop.phys=false;t.player.x=drop.x;t.player.y=drop.y;t.press('interact');t.updatePickups();t.release();}
   }
   t.game.frames=Math.max(frame,[60,90,120,150][map-1]*60);t.boss.state='idle';
   while(t.boss.hp>0){const id=t.attack('shell');t.damageBoss(25,id);t.game.frames+=16;}
   const drop=t.pickups.find(p=>p.target===30);if(drop){drop.phys=false;t.player.x=drop.x;t.player.y=drop.y;t.press('interact');t.updatePickups();t.release();}
   await save.flush();assert.equal(save.snapshot().pendingEvents,0);assert.equal(errors.length,0);
   const points=t.game.collected,before=save.snapshot().profile.total_score;
   if(map===1){ctx.dispatchEvent(new Event('pagehide'));await save.flush();assert((await h.rpc(a,'hf_wallet_profile')).highest_map>=2);}
   t.boss.t=1;t.updateBoss();
   if(map<4){const deadline=Date.now()+5000;while(ctx.__hamster.snapshot().map!==map+1&&Date.now()<deadline)await new Promise(done=>setTimeout(done,1));assert.equal(ctx.__hamster.snapshot().map,map+1);}else assert.equal(t.game.state,'ending');
   await save.flush();assert.equal(save.snapshot().pendingEvents,0);assert(save.snapshot().profile.total_score>=before);assert.equal(errors.length,0);assert(points>0);
  }
  const profile=await h.rpc(a,'hf_wallet_profile');assert(profile.total_score>1400);assert.equal(profile.highest_map,5);assert(profile.produce_points>0);assert.equal((await save.leaderboard()).rows[0].score,profile.total_score);
 });
 await check('score, SQK, produce growth, progression and purchased cosmetics survive refresh and reconnect',async()=>{
  await save.purchase('costume-batman');await save.equip('costume','costume-batman');const expected=save.snapshot().profile;
  const reload=await fixture({game:false,storage:f.storage,config:{supabaseUrl:'https://fixture.invalid',supabasePublishableKey:'fixture-public'},fetch:async(url,options)=>{const name=new URL(url).pathname.split('/').pop(),body=JSON.parse(options.body||'{}');try{return{ok:true,json:async()=>await h.rpc(options.headers.Authorization?a:null,name,body)};}catch(error){return{ok:false,json:async()=>({message:error.message})};}}});
  await reload.ctx.HamsterSave.setWallet(a.wallet);assert.deepEqual(JSON.parse(JSON.stringify(reload.ctx.HamsterSave.snapshot().profile)),JSON.parse(JSON.stringify(expected)));
 });
 await check('no test path submits a score total, and every accepted score comes through hf_progress',()=>{
  assert(requests.some(r=>r.name==='hf_progress'));for(const request of requests)assert(!Object.hasOwn(request.body,'score'));assert.deepEqual(errors,[]);
 });
 await mkdir('test/scratch/major',{recursive:true});await writeFile('test/scratch/major/engine-sql-results.json',JSON.stringify({results,limitations:['Position/time/Auth/HTTP fixtures. Actual damage, server validation, loot, scoring and save client execute unchanged.']},null,2));console.log(results.length+' engine-to-SQL checks passed.');
}finally{await h.close();}
