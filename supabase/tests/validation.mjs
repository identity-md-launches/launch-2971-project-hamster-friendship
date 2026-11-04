// Runs the real migration and RPCs in PostgreSQL via PGlite. The optional test
// dependency is not a runtime asset. Pass its installed dist/index.js path.
// Usage: node supabase/tests/validation.mjs /absolute/path/to/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';

if (!process.argv[2]) throw new Error('Pass the PGlite module path. See README.md.');
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = await PGlite.create();
let count=0, uid=randomUUID(), other=randomUUID(), run, seq=0;
const q = (sql,args=[]) => db.query(sql,args);
const one = async (sql,args=[]) => (await q(sql,args)).rows[0];
async function ok(name, fn) { await fn(); count++;console.log('ok',name); }
async function denied(name, fn, re) { await ok(name, () => assert.rejects(fn,re)); }
async function user(id=uid) { await db.exec('reset role'); await q("select set_config('request.jwt.claim.sub',$1,false)",[id||'']); await db.exec('set role authenticated'); }
async function admin() { await db.exec('reset role'); }
async function rpc(name,args=[],casts=[]) {
  const placeholders=args.map((_,i)=>'$'+(i+1)+(casts[i]?'::'+casts[i]:''));
  return (await one('select public.'+name+'('+placeholders.join(',')+') as result',args)).result;
}
async function start(map=1) { run=await rpc('hf_start_run',[map]);seq=0;await admin();await q("update hf_private.runs set started_at=clock_timestamp()-interval '1 hour' where id=$1",[run.id]);await user();return run; }
async function send(events) {
  const batch=events.map((e,i)=>({...e,seq:seq+i+1}));
  const result=await rpc('hf_progress',[run.id,JSON.stringify(batch)],['uuid','jsonb']);seq=result.ack;return result;
}
const ev=(kind,frame,data={})=>({kind,frame,...data});
let aid=0;
function shot(target,frame,weapon='shell') { const id=++aid;return [ev('attack',frame,{attack:id,weapon}),ev('hit',frame,{attack:id,target})]; }

try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    grant usage on schema auth to authenticated;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;`);
  await ok('migration applies successfully on PostgreSQL',async()=>db.exec(await readFile(new URL('../migrations/001_friendship.sql',import.meta.url),'utf8')));
  await q('insert into auth.users(id) values($1),($2)',[uid,other]);
  await user();
  await ok('authenticated profile starts at zero with no purchases',async()=>{const p=await rpc('hf_profile');assert.equal(p.sqk,0);assert.equal(p.total_score,0);assert.deepEqual(p.purchases,[]);});
  await denied('invalid and HTML profile names are rejected',()=>rpc('hf_profile',['<script>']),/Use 2/);
  await ok('valid profile name round-trips',async()=>assert.equal((await rpc('hf_profile',['Forest Friend'])).name,'Forest Friend'));
  await denied('direct balance update is denied to authenticated users',()=>q('update hf_private.profiles set sqk=9999'),/permission denied/);
  await denied('unowned cosmetics cannot be equipped',()=>rpc('hf_equip',['shirt','shirt-blue']),/Buy this cosmetic/);
  await denied('unknown purchase is rejected',()=>rpc('hf_purchase',['free-money']),/Choose an item/);
  await denied('insufficient SQK cannot buy an item',()=>rpc('hf_purchase',['shirt-blue']),/Not enough SQK/);
  await denied('locked maps cannot be started',()=>rpc('hf_start_run',[2]),/unlocked map/);
  await start();
  await ok('server creates exactly 31 HP entries with 100 regular/500 boss',async()=>{await admin();const r=await one('select * from hf_private.runs where id=$1',[run.id]);assert.equal(r.hp.length,31);assert(r.hp.slice(0,30).every(n=>n===100));assert.equal(r.hp[30],500);await user();});
  await denied('arbitrary score submissions are rejected',()=>send([ev('set_score',0,{score:999999})]),/Unknown game event/);
  await denied('a live enemy cannot yield SQK',()=>send([ev('collect',0,{target:0})]),/Defeat this enemy/);
  await denied('damage without an attack is rejected',()=>send([ev('hit',0,{attack:123,target:0})]),/valid attack/);
  await denied('guns cannot be fired before a verified drop is collected',()=>send([ev('attack',0,{attack:1,weapon:'gun'})]),/Collect a gun/);
  await denied('the boss cannot be hit before 60 active seconds',()=>send(shot(30,0)),/boss has not appeared/);
  await denied('out-of-order events are rejected',()=>rpc('hf_progress',[run.id,JSON.stringify([{kind:'death',frame:0,seq:4}])],['uuid','jsonb']),/arrive in order/);
  await denied('attack rate is enforced',()=>send([...shot(0,0),...shot(0,1)]),/too fast/);
  await denied('an attack cannot damage the same enemy twice',()=>{const id=++aid;return send([ev('attack',0,{attack:id,weapon:'shell'}),ev('hit',0,{attack:id,target:0}),ev('hit',1,{attack:id,target:0})]);},/allowed targets/);
  await denied('expired projectile cannot cause damage',()=>{const id=++aid;return send([ev('attack',0,{attack:id,weapon:'shell'}),ev('hit',101,{attack:id,target:0})]);},/expired/);
  await admin(); await q("update hf_private.runs set loot[1]='gun',loot[2]='grenade' where id=$1",[run.id]);await user();
  const kill=[];for(let i=0;i<4;i++)kill.push(...shot(0,i*16));kill.push(ev('defeat',48,{target:0}),ev('collect',48,{target:0}),ev('weapon',48,{target:0}));
  let receipt;
  await ok('server derives one kill, one SQK and gun ammunition from legal damage',async()=>{receipt=await send(kill);assert.equal(receipt.profile.sqk,1);assert.equal(receipt.profile.total_score,100);});
  await ok('replaying acknowledged events cannot double-credit coins or score',async()=>{const duplicate=kill.map((e,i)=>({...e,seq:i+1}));const result=await rpc('hf_progress',[run.id,JSON.stringify(duplicate)],['uuid','jsonb']);assert.equal(result.profile.sqk,1);assert.equal(result.profile.total_score,100);assert.equal(result.ack,seq);});
  await denied('a new event cannot claim the same coin again',()=>send([ev('collect',49,{target:0})]),/already collected/);
  const gun=[];for(let i=0;i<5;i++)gun.push(...shot(1,60+i*10,'gun'));gun.push(ev('weapon',100,{target:1}));
  await ok('gun bullets do exactly 20 damage and a verified grenade drop unlocks grenades',async()=>{const result=await send(gun);assert.equal(result.profile.total_score,200);await admin();const r=await one('select hp,ammo_gun,ammo_grenade from hf_private.runs where id=$1',[run.id]);assert.equal(r.hp[1],0);assert.equal(r.ammo_gun,25);assert.equal(r.ammo_grenade,3);await user();});
  const grenade=++aid;
  await ok('a grenade burns multiple enemies for 5 damage after a second',async()=>{await send([ev('attack',120,{attack:grenade,weapon:'grenade'}),ev('hit',180,{attack:grenade,target:2}),ev('hit',180,{attack:grenade,target:3})]);await admin();const r=await one('select hp from hf_private.runs where id=$1',[run.id]);assert.equal(r.hp[2],95);assert.equal(r.hp[3],95);await user();});
  await denied('grenade burn cannot tick faster than once per second',()=>send([ev('hit',181,{attack:grenade,target:2})]),/5 per second/);
  await ok('grenade burn stops after eight ticks',async()=>{const burns=[];for(let i=1;i<8;i++)burns.push(ev('hit',180+60*i,{attack:grenade,target:2}));await send(burns);});
  await denied('a ninth grenade burn tick is rejected',()=>send([ev('hit',660,{attack:grenade,target:2})]),/5 per second/);
  await denied('an unfinished map cannot be submitted as complete',()=>send([ev('finish',3600)]),/Defeat all 30/);
  await ok('death closes the run while keeping collected SQK and score',async()=>{const result=await send([ev('death',700)]);assert.equal(result.profile.sqk,1);assert.equal(result.profile.total_score,200);});
  await denied('uncollected coins cannot be claimed after death',()=>send([ev('collect',701,{target:1})]),/already ended/);
  await admin();await q('update hf_private.profiles set sqk=1000 where user_id=$1',[uid]);await user();
  await ok('purchases charge server catalogue prices exactly once',async()=>{const first=await rpc('hf_purchase',['charged']);assert.equal(first.sqk,850);const again=await rpc('hf_purchase',['charged']);assert.equal(again.sqk,850);await rpc('hf_purchase',['piercing']);await rpc('hf_purchase',['ricochet']);const shirt=await rpc('hf_purchase',['shirt-blue']);assert.equal(shirt.sqk,280);});
  await ok('owned cosmetics equip and unequip',async()=>{const on=await rpc('hf_equip',['shirt','shirt-blue']);assert.equal(on.cosmetics.shirt,'shirt-blue');const off=await rpc('hf_equip',['shirt',null]);assert.equal(off.cosmetics.shirt,null);});
  await denied('skills cannot be equipped as a cosmetic',()=>rpc('hf_equip',['shirt','charged']),/Buy this cosmetic/);
  await ok('browser and SQL catalogue agree for every item',async()=>{await admin();const {rows}=await q('select id,price,slot from hf_private.catalogue order by id');const c=vm.createContext({});vm.runInContext(await readFile(new URL('../../src/rules.js',import.meta.url),'utf8'),c);const expected=Array.from(c.HamsterRules.catalogue,i=>({id:i.id,price:i.price,slot:i.slot})).sort((a,b)=>a.id.localeCompare(b.id));assert.deepEqual(rows,expected);await user();});
  await start();
  const charged=++aid;
  await ok('purchased charged and piercing rules are frozen into the new run',async()=>{await send([ev('attack',16,{attack:charged,weapon:'shell'}),...[0,1,2].map(target=>ev('hit',16,{attack:charged,target}))]);await admin();const r=await one('select hp from hf_private.runs where id=$1',[run.id]);assert.equal(r.hp[0],62.5);assert.equal(r.hp[1],62.5);assert.equal(r.hp[2],62.5);await user();});
  await denied('piercing cannot exceed three targets',()=>send([ev('hit',17,{attack:charged,target:3})]),/allowed targets/);
  await ok('another profile cannot use this run',async()=>{await user(other);await rpc('hf_profile');await assert.rejects(()=>rpc('hf_progress',[run.id,JSON.stringify([{kind:'death',frame:0,seq:1}])],['uuid','jsonb']),/does not belong/);await user();});
  await ok('public leaderboard exposes only names, scores and map tiers',async()=>{await admin();await db.exec('set role anon');const rows=(await q('select * from public.hf_top100()')).rows;assert(rows.some(p=>p.name==='Forest Friend'&&p.total_score===200));assert.deepEqual(Object.keys(rows[0]).sort(),['highest_map','name','total_score']);await user();});
  await ok('anonymous role cannot call profile or purchase mutations',async()=>{await admin();await db.exec('set role anon');await assert.rejects(()=>rpc('hf_profile'),/permission denied/);await assert.rejects(()=>rpc('hf_purchase',['vest']),/permission denied/);await user();});
  await ok('missing authentication is rejected even if EXECUTE is granted',async()=>{await user(null);await assert.rejects(()=>rpc('hf_profile'),/Sign in/);await user();});

  // Full legitimate map replay on a fresh profile, without privileged HP edits.
  const finisher=randomUUID();await admin();await q('insert into auth.users(id) values($1)',[finisher]);uid=finisher;await user();await rpc('hf_profile',['Map Finisher']);await start();
  await ok('future simulation frames are rejected against server time',async()=>{await admin();await q('update hf_private.runs set started_at=clock_timestamp() where id=$1',[run.id]);await user();await assert.rejects(()=>send([ev('attack',10000,{attack:++aid,weapon:'shell'})]),/Invalid game timing/);await admin();await q("update hf_private.runs set started_at=clock_timestamp()-interval '2 hours' where id=$1",[run.id]);await user();});
  await ok('all 30 enemies and boss can be verified, coins saved and map 2 unlocked',async()=>{
    let frame=0, chunk=[];
    for(let target=0;target<31;target++) {
      if(target===30) frame=Math.max(frame,3600);
      for(let hit=0;hit<(target===30?20:4);hit++){frame+=16;chunk.push(...shot(target,frame));}
      chunk.push(ev('defeat',frame,{target}),ev('collect',frame,{target}));
      if(chunk.length>100){await send(chunk);chunk=[];}
    }
    chunk.push(ev('finish',frame));const result=await send(chunk);assert.equal(result.profile.sqk,31);assert.equal(result.profile.total_score,4500);assert.equal(result.profile.highest_map,2);
    await start(2);await admin();const r=await one('select hp from hf_private.runs where id=$1',[run.id]);assert(r.hp.slice(0,30).every(n=>n===120));assert.equal(r.hp[30],600);await user();
  });
  await ok('Top 100 is globally ordered and limited to 100 real database records',async()=>{
    await admin();
    await db.exec(`insert into auth.users(id) select gen_random_uuid() from generate_series(1,110);
      insert into hf_private.profiles(user_id,name,total_score)
      select id,'Test Player',row_number() over(order by id)*10 from auth.users where id not in(select user_id from hf_private.profiles);`);
    await db.exec('set role anon');const rows=(await q('select * from public.hf_top100()')).rows;assert.equal(rows.length,100);assert.equal(rows[0].total_score,4500);assert(rows.every((row,i)=>i===0||row.total_score<=rows[i-1].total_score));
  });
  console.log(`${count} PostgreSQL migration/security/economy checks passed.`);
} finally { await db.close(); }
