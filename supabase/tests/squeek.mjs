// Real PostgreSQL execution of populated-schema migration and all new RPCs.
// Auth identities below are explicit test fixtures, not live wallet verification.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
const {PGlite}=await import(pathToFileURL(resolve(process.argv[2]||'test/scratch/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=await PGlite.create(), results=[];
const q=(sql,args=[])=>db.query(sql,args), one=async(sql,args=[])=>(await q(sql,args)).rows[0];
const legacy=randomUUID(), walletUser=randomUUID(), other=randomUUID(), guest=randomUUID();
const address='0x'+ 'a'.repeat(40), addressB='0x'+'b'.repeat(40);
let uid=legacy,run,seq=0,aid=0,frame=0;
async function admin(){await db.exec('reset role');}
async function user(id=uid){uid=id;await admin();await q("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role authenticated');}
async function rpc(name,args=[],casts=[]){return(await one('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)+(casts[i]?'::'+casts[i]:'')).join(',')+') as value',args)).value;}
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
async function denied(name,fn,re){await check(name,()=>assert.rejects(fn,re));}
async function start(map=1){run=await rpc('hf_start_run_v4',[map]);seq=0;frame=0;await admin();await q("update hf_private.runs set started_at=clock_timestamp()-interval '2 hours' where id=$1",[run.id]);await user();return run;}
async function send(events){const result=await rpc('hf_progress',[run.id,JSON.stringify(events.map((e,i)=>({...e,seq:seq+i+1})))],['uuid','jsonb']);seq=result.ack;return result;}
const ev=(kind,data={})=>({kind,frame,...data});
async function kill(target){frame+=16;const attack=++aid;await send([ev('attack',{attack,weapon:'shell'}),ev('hit',{attack,target}),ev('defeat',{target})]);}
try{
 await db.exec(`create role anon; create role authenticated; create schema auth; grant usage on schema auth to authenticated;
 create table auth.users(id uuid primary key); create table auth.identities(user_id uuid,provider text,identity_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
 for(const file of ['001_friendship.sql','002_seasons_dice_badges.sql'])await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 for(const id of [legacy,walletUser,other,guest])await q('insert into auth.users values($1)',[id]);
 await user(legacy);await rpc('hf_profile',['Old Forest Friend']);
 await admin();await q("update hf_private.profiles set sqk=275,total_score=1400,highest_map=4,cosmetics='{"+'"shirt":"shirt-blue"'+"}',dice_correct=23 where user_id=$1",[legacy]);
 await q("insert into hf_private.purchases(user_id,item,paid) values($1,'charged',150),($1,'shirt-blue',20)",[legacy]);
 const old=(await one('select * from hf_private.profiles where user_id=$1',[legacy]));
 await check('003 applies to a populated project without deleting historical data',async()=>{await db.exec(await readFile('supabase/migrations/003_squeek.sql','utf8'));const after=await one('select * from hf_private.profiles where user_id=$1',[legacy]);assert.deepEqual(after,old);});
 await user(guest);
 await denied('an anonymous Supabase user cannot create a wallet profile',()=>rpc('hf_wallet_profile'),/Sign in with your wallet/);
 await denied('guests cannot save or spend through the old RPCs',()=>rpc('hf_purchase',['costume-batman']),/Sign in with your wallet/);
 await user(legacy);const ticket=(await rpc('hf_prepare_legacy')).ticket;
 await admin();for(const [id,a] of [[walletUser,address],[other,addressB]])await q("insert into auth.identities values($1,'web3',$2::jsonb)",[id,JSON.stringify({address:a,chain:'ethereum',network:'1'})]);
 await user(walletUser);
 await check('verified wallet links the existing profile without copying or resetting SQK',async()=>{const p=await rpc('hf_wallet_profile',[ticket],['uuid']);assert.equal(p.sqk,275);assert.equal(p.total_score,1400);assert.equal(p.highest_map,4);assert(p.purchases.includes('charged'));assert.equal(p.cosmetics.shirt,'shirt-blue');assert.equal(p.wallet,address);assert(!('dice' in p));assert(p.badges.every(b=>b.source!=='dice'));});
 await check('retrying wallet profile attachment is idempotent',async()=>assert.equal((await rpc('hf_wallet_profile',[ticket],['uuid'])).sqk,275));
 await check('legacy attachment retries identify the already-linked wallet without moving its funds',async()=>{await user(legacy);const t=await rpc('hf_prepare_legacy');assert.equal(t.wallet,address);assert.equal(t.ticket,null);await user(walletUser);});
 await user(other);await rpc('hf_wallet_profile');
 await check('an established wallet is never overwritten by a legacy ticket',async()=>assert.equal((await rpc('hf_wallet_profile',[ticket],['uuid'])).sqk,0));
 await denied('authenticated role cannot change private balances',()=>q('update hf_private.profiles set sqk=100000'),/permission denied/);
 await denied('authenticated role cannot create trusted wallet identities',()=>q("insert into auth.identities values($1,'web3','{}')",[guest]),/permission denied/);
 await denied('old marketplace items are no longer purchasable',()=>rpc('hf_purchase',['charged']),/current marketplace/);
 await denied('missing balance prevents a costume purchase',()=>rpc('hf_purchase',['costume-batman']),/Not enough SQK/);
 await denied('unowned costume cannot be equipped',()=>rpc('hf_equip',['costume','costume-batman']),/Buy this costume/);
 await denied('removed exchange RPC is unavailable',()=>rpc('hf_exchange_badge',['skill-bronze']),/does not exist/);
 await denied('removed minigame RPC is unavailable',()=>rpc('hf_dice',['HIGH',randomUUID()],['text','uuid']),/does not exist/);
 await admin();await q('update hf_private.profiles set sqk=1000 where user_id=$1',[other]);await user(other);
 await check('costume costs exactly 50 and repeated requests deduct only once',async()=>{const requests=await Promise.all(Array.from({length:12},()=>rpc('hf_purchase',['costume-batman'])));assert(requests.every(p=>p.sqk===950));assert.equal(requests.at(-1).purchases.filter(i=>i==='costume-batman').length,1);});
 await check('equipping and unequipping preserves balance and ownership',async()=>{let p=await rpc('hf_equip',['costume','costume-batman']);assert.equal(p.cosmetics.costume,'costume-batman');p=await rpc('hf_equip',['costume',null]);assert.equal(p.cosmetics.costume,null);assert.equal(p.sqk,950);});
 const c=vm.createContext({});vm.runInContext(await readFile('src/rules.js','utf8'),c);const rules=c.HamsterRules;
 await check('all eight active server items agree exactly with the client catalogue',async()=>{await admin();const rows=(await q('select id,price,slot from hf_private.catalogue where active order by id')).rows;const expected=Array.from(rules.catalogue,i=>({id:i.id,price:i.price,slot:i.slot})).sort((a,b)=>a.id.localeCompare(b.id));assert.deepEqual(rows,expected);await user();});
 await check('every item can be bought once at the declared prices',async()=>{for(const item of rules.catalogue)await rpc('hf_purchase',[item.id]);const p=await rpc('hf_profile');assert.equal(p.sqk,500);assert.equal(p.purchases.length,8);});
 await start();
 await check('map 1 uses 30 existing monster types and 300 boss HP',async()=>{assert.equal(run.monsters.length,30);assert(run.monsters.every(m=>m.hp===(m.size==='small'?50:100)&&!('damage'in m)));await admin();assert.equal((await one('select hp from hf_private.runs where id=$1',[run.id])).hp[30],300);await user();});
 await denied('locked map cannot be started',()=>rpc('hf_start_run_v4',[2]),/unlocked map/);
 await denied('unearned drop cannot be picked up',()=>send([ev('pickup',{target:0})]),/Defeat this enemy/);
 await denied('gun cannot shoot before pickup',()=>send([ev('attack',{attack:++aid,weapon:'gun'})]),/Collect a gun/);
 await denied('boss cannot be hit before 60 seconds',()=>send([ev('attack',{attack:++aid,weapon:'shell'}),ev('hit',{attack:aid,target:30})]),/boss has not appeared/);
 await admin();await q("update hf_private.runs set hp[1]=25,hp[2]=25,hp[3]=25,hp[4]=25,hp[5]=25,hp[6]=25,loot[1]='gun',loot[2]='bomb',loot[3]='sword',loot[4]='small',loot[5]='big',loot[6]='coin' where id=$1",[run.id]);await user();
 for(let target=0;target<6;target++)await kill(target);
 await check('six exclusive drop kinds grant exactly their own entitlements',async()=>{for(let target=0;target<6;target++)await send([ev('pickup',{target})]);const p=await rpc('hf_profile');assert.equal(p.sqk,501);assert.equal(p.total_score,6);await admin();const r=await one('select * from hf_private.runs where id=$1',[run.id]);assert.equal(r.ammo_gun,100);assert.equal(r.ammo_grenade,3);assert(r.sword);assert.equal(r.score,6);await user();});
 await denied('new sequence cannot pick up the same drop twice',()=>send([ev('pickup',{target:5})]),/already collected/);
 await check('acknowledged event replay cannot double-credit a coin',async()=>{const p=await rpc('hf_profile');const result=await rpc('hf_progress',[run.id,JSON.stringify([{...ev('pickup',{target:5}),seq}])],['uuid','jsonb']);assert.equal(result.profile.sqk,p.sqk);});
 await check('100 legal shots exhaust exactly 100 bullets',async()=>{for(let i=0;i<100;i++){frame+=10;await send([ev('attack',{attack:++aid,weapon:'gun'})]);}await admin();assert.equal((await one('select ammo_gun from hf_private.runs where id=$1',[run.id])).ammo_gun,0);await user();});
 frame+=10;await denied('the 101st gun shot is rejected',()=>send([ev('attack',{attack:++aid,weapon:'gun'})]),/Collect a gun/);
 await check('another gun refills to 100 rather than stacking ammo',async()=>{await admin();await q("update hf_private.runs set hp[7]=0,loot[7]='gun',ammo_gun=60 where id=$1",[run.id]);await user();await send([ev('pickup',{target:6})]);await admin();assert.equal((await one('select ammo_gun from hf_private.runs where id=$1',[run.id])).ammo_gun,100);await user();});
 await check('all three upgrades yield +55% damage for all three weapons',async()=>{for(const [weapon,expected]of[['gun',31],['sword',77.5],['bomb',7.75]]){frame+=60;const id=++aid;await admin();await q('update hf_private.runs set hp[8]=1000 where id=$1',[run.id]);await user();await send([ev('attack',{attack:id,weapon}),{kind:'hit',frame:weapon==='bomb'?frame+60:frame,attack:id,target:7}]);if(weapon==='bomb')frame+=60;await admin();const hp=(await one('select hp from hf_private.runs where id=$1',[run.id])).hp[7];assert.equal(hp,1000-expected);await user();}});
 await check('forest chestnuts and caches add score once',async()=>{await send([ev('forage',{source:'trail-0'}),ev('forage',{source:'chest'})]);assert.equal((await rpc('hf_profile')).total_score,13);});
 await denied('same forest collectible cannot score twice',()=>send([ev('forage',{source:'trail-0'})]),/already collected/);
 await denied('invented forest collectible is rejected',()=>send([ev('forage',{source:'trail-999'})]),/Unknown forest/);
 await denied('client cannot submit arbitrary score totals',()=>send([ev('set_score',{score:9999})]),/Unknown game event/);
 await check('daily ranking contains the verified wallet’s highest map score',async()=>{const board=await rpc('hf_daily_top100');assert.equal(board.timezone,'UTC');assert.equal(board.rows.length,1);assert.equal(board.rows[0].score,13);assert(Date.parse(board.resetsAt)>Date.now());});
 await check('yesterday’s scores are invisible without a destructive reset',async()=>{await admin();await q("update hf_private.daily_scores set score_day=score_day-1 where profile_id=$1",[other]);await user();assert.equal((await rpc('hf_daily_top100')).rows.length,0);await send([ev('forage',{source:'trail-1'})]);assert.equal((await rpc('hf_daily_top100')).rows[0].score,14);});
 await check('a run crossing midnight credits only new-day points after rollover',async()=>{await admin();await q("update hf_private.runs set score_day=current_date-1 where id=$1",[run.id]);await q('delete from hf_private.daily_scores where profile_id=$1',[other]);await user();await send([ev('forage',{source:'trail-2'})]);assert.equal((await rpc('hf_daily_top100')).rows[0].score,1);});
 await check('a shorter later run cannot lower the daily best',async()=>{await send([ev('forage',{source:'trail-3'}),ev('forage',{source:'trail-4'})]);await start();await send([ev('forage',{source:'trail-0'})]);assert.equal((await rpc('hf_daily_top100')).rows[0].score,3);});
 await check('IANA timezone is an owner setting and invalid names are rejected',async()=>{await admin();await q("update hf_private.settings set leaderboard_timezone='Europe/Berlin'");await assert.rejects(()=>q("update hf_private.settings set leaderboard_timezone='Not/AZone'"),/valid IANA/);await user();assert.equal((await rpc('hf_daily_top100')).timezone,'Europe/Berlin');await assert.rejects(()=>q("update hf_private.settings set leaderboard_timezone='UTC'"),/permission denied/);});
 await check('midnight conversion uses timezone rules including DST',async()=>{await admin();const r=await one("select ('2026-03-29'::date+1)::timestamp at time zone 'Europe/Berlin' as v");assert.equal(new Date(r.v).toISOString(),'2026-03-29T22:00:00.000Z');await user();});
 await user(walletUser);await start(3);
 await check('monster and boss HP still scale by 20% per map',async()=>{assert(run.monsters.every(m=>m.hp===Math.ceil((m.size==='small'?50:100)*1.2**2)));await admin();assert.equal((await one('select hp from hf_private.runs where id=$1',[run.id])).hp[30],432);await user();});
 await check('buying an upgrade updates an active run immediately',async()=>{await rpc('hf_purchase',['damage-10']);await admin();assert((await one('select skills from hf_private.runs where id=$1',[run.id])).skills.includes('damage-10'));await user();});
 await check('map death keeps balance and purchases',async()=>{const before=await rpc('hf_profile');const result=await send([ev('death')]);assert.equal(result.profile.sqk,before.sqk);assert.deepEqual(result.profile.purchases,before.purchases);});
 await denied('no pickup can be saved after death',()=>send([ev('pickup',{target:0})]),/already ended/);
 await user(guest);await denied('legacy anonymous Auth cannot appear on current rankings via new gameplay',()=>rpc('hf_start_run_v4',[1]),/Sign in with your wallet/);
 await admin();await db.exec('set role anon');await check('public readers can load a daily board without private profiles',async()=>{assert.equal(typeof(await rpc('hf_daily_top100')).timezone,'string');await assert.rejects(()=>q('select * from hf_private.wallet_profiles'),/permission denied/);});
 await user(other);
 await check('original forest collectible values match between JavaScript and PostgreSQL',async()=>{await admin();for(const source of['trail-0','trail-33','trail-34','chest','basket','log','lantern-93','lantern-174','bush-54-0','bush-176-2','bush-176-3','fake']){const value=(await one('select hf_private.forage_value($1) as value',[source])).value;assert.equal(value,rules.forageValue(source),source);}await user();});
 await check('every client drop interval has the exact requested share over 10,000 stratified rolls',async()=>{const counts={};for(let i=0;i<10000;i++){const d=rules.drop((i+0.5)/10000);counts[d]=(counts[d]||0)+1;}assert.deepEqual(counts,{big:1000,small:4000,coin:2000,gun:1000,sword:1000,bomb:1000});for(const invalid of[-1,1,NaN])assert.throws(()=>rules.drop(invalid),/Drop roll/);});
 await check('server creates exactly one drop per monster with the requested statistical distribution',async()=>{const counts={};for(let n=0;n<200;n++){const r=await rpc('hf_start_run_v4',[1]);assert.equal(r.loot.length,31);for(const d of r.loot)counts[d]=(counts[d]||0)+1;}for(const[d,p]of Object.entries({big:.1,small:.4,coin:.2,gun:.1,sword:.1,bomb:.1}))assert(Math.abs(counts[d]/6200-p)<.035,d);});
 await check('a full map replay saves only chestnut points and eligible SQK, then unlocks map 2',async()=>{
   await start();const before=await rpc('hf_profile');let points=0,coins=0;
   await assert.rejects(()=>send([ev('finish')]),/Defeat all 30/);
   for(let target=0;target<31;target++){
     const hp=target===30?300:run.monsters[target].hp;if(target===30)frame=Math.max(frame,3600);const events=[];
     for(let h=0;h<Math.ceil(hp/25);h++){frame+=16;const attack=++aid;events.push(ev('attack',{attack,weapon:'shell'}),ev('hit',{attack,target}));}
     events.push(ev('defeat',{target}),ev('pickup',{target}));await send(events);
     const drop=run.loot[target];points+=drop==='big'?5:drop==='small'?1:0;coins+=drop==='coin'?1:0;
   }
   const result=await send([ev('finish')]);assert.equal(result.profile.highest_map,2);assert.equal(result.profile.sqk,before.sqk+coins);assert.equal(result.profile.total_score,before.total_score+points);
 });
 await check('Top 100 is capped, deterministic on ties, and excludes unlinked profiles',async()=>{await admin();await q("update hf_private.settings set leaderboard_timezone='UTC'");for(let i=0;i<105;i++){const id=randomUUID();await q('insert into auth.users values($1)',[id]);await q("insert into hf_private.profiles(user_id,name) values($1,$2)",[id,'Player '+i]);await q('insert into hf_private.wallet_profiles values($1,$1,$2)',[id,'0x'+(i+1).toString(16).padStart(40,'0')]);await q("insert into hf_private.daily_scores values($1,current_date,'UTC',100,now())",[id]);}await user();const b=await rpc('hf_daily_top100');assert.equal(b.rows.length,100);assert.deepEqual(b.rows,(await rpc('hf_daily_top100')).rows);assert(b.rows.every(r=>r.score===100));});
 await mkdir('test/scratch/squeek',{recursive:true});await writeFile('test/scratch/squeek/database.json',JSON.stringify({results},null,2));
 console.log(`${results.length} PostgreSQL checks passed.`);
}finally{await db.close();}
