// Real PostgreSQL (PGlite), with explicit Auth fixtures. Never a live database.
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {web3Identity} from './web3-identity.mjs';
const {PGlite}=await import(pathToFileURL(resolve(process.argv[2]||'test/scratch/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=await PGlite.create(), results=[];
const a=randomUUID(), b=randomUUID(), anonymous=randomUUID(), duplicate=randomUUID();
const address='0x'+'a'.repeat(40), otherAddress='0x'+'b'.repeat(40);
let uid=a, run, seq=0, frame=0, attack=0;
const q=(sql,args=[])=>db.query(sql,args), one=async(sql,args=[])=>(await q(sql,args)).rows[0];
async function admin(){await db.exec('reset role');}
async function user(id=uid){uid=id;await admin();await q("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role authenticated');}
async function rpc(name,args=[],casts=[]){return(await one('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)+(casts[i]?'::'+casts[i]:'')).join(',')+') as value',args)).value;}
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
async function denied(name,fn,re){await check(name,()=>assert.rejects(fn,re));}
async function start(map=1){run=await rpc('hf_start_run_v4',[map]);seq=0;frame=0;attack=0;await admin();await q("update hf_private.runs set started_at=clock_timestamp()-interval '2 hours' where id=$1",[run.id]);await user();return run;}
function ev(kind,data={}){return {kind,frame,...data};}
async function send(events){const value=await rpc('hf_progress',[run.id,JSON.stringify(events.map((e,i)=>({...e,seq:seq+i+1})))],['uuid','jsonb']);seq=value.ack;return value;}
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated;
 create table auth.users(id uuid primary key);create table auth.identities(user_id uuid,provider text,identity_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 for(const file of['001_friendship.sql','002_seasons_dice_badges.sql','003_squeek.sql'])await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 for(const id of[a,b,anonymous,duplicate])await q('insert into auth.users values($1)',[id]);
 for(const[id,wallet]of[[a,address],[b,otherAddress],[duplicate,address.toUpperCase().replace('0X','0x')]])await q("insert into auth.identities values($1,'web3',$2::jsonb)",[id,JSON.stringify(web3Identity(wallet))]);
 // Historical rows are data fixtures. Do not fake successful 003 Auth by using
 // its incorrect flat identity format; the real shape fails until upgrade 005.
 for(const[id,wallet]of[[a,address],[b,otherAddress]]){
   await q('insert into hf_private.profiles(user_id) values($1)',[id]);
   await q('insert into hf_private.wallet_profiles values($1,$1,$2)',[id,wallet]);
 }
 await admin();await q("update hf_private.profiles set name='Old Forest Friend',sqk=275,total_score=1400,highest_map=4,cosmetics=$2::jsonb where user_id=$1",[a,JSON.stringify({shirt:'shirt-blue',costume:'costume-batman'})]);
 await q("insert into hf_private.purchases(user_id,item,paid) values($1,'charged',150),($1,'shirt-blue',20),($1,'costume-batman',50)",[a]);
 await q('insert into hf_private.profiles(user_id,total_score) values($1,99999)',[anonymous]);
 await q("insert into hf_private.daily_scores(profile_id,score_day,timezone,score) values($1,current_date-9,'UTC',97)",[a]);
 run=(await one("insert into hf_private.runs(user_id,map,hp,loot,rules_version,score,seq,foraged) values($1,1,array_fill(100::double precision,array[31]),array_fill('small'::text,array[31]),4,6,1,array['chest']) returning id",[a]));seq=1;
 await q('update hf_private.profiles set total_score=total_score+6 where user_id=$1',[a]);
 const oldProfile=(await one('select hf_private.profile_json($1) as profile',[a])).profile;
 const oldDaily=(await q('select * from hf_private.daily_scores order by score_day')).rows;
 await check('004 and 005 apply over populated 003 without changing profile fields, wallet links or historical daily scores',async()=>{
   const snapshots=await readFile('supabase/preservation_snapshot.sql','utf8');const beforeSnapshot=await db.exec(snapshots);
   await db.exec(await readFile('supabase/migrations/004_lifetime_persistence.sql','utf8'));
   await db.exec(await readFile('supabase/migrations/005_verified_wallet_recovery.sql','utf8'));
   assert.deepEqual(await db.exec(snapshots),beforeSnapshot);
   const verified=await db.exec(await readFile('supabase/verify_lifetime.sql','utf8'));for(const result of verified)for(const row of result.rows)for(const value of Object.values(row))if(typeof value==='boolean')assert.equal(value,true);
   await user(a);assert.deepEqual(await rpc('hf_profile'),oldProfile);await admin();assert.deepEqual((await q('select * from hf_private.daily_scores order by score_day')).rows,oldDaily);await user();
 });
 await check('an old active run settles only new points beyond its already-credited migration baseline',async()=>{
   await send([ev('forage',{source:'basket'})]);assert.equal((await rpc('hf_profile')).total_score,oldProfile.total_score);
   const p=(await send([ev('death')])).profile;assert.equal(p.total_score,oldProfile.total_score+2);assert.equal(p.sqk,275);assert.deepEqual(p.purchases,oldProfile.purchases);assert.deepEqual(p.cosmetics,oldProfile.cosmetics);
 });
 await check('completed session replay cannot credit lifetime points again',async()=>{
   const before=await rpc('hf_profile');await rpc('hf_progress',[run.id,JSON.stringify([{...ev('death'),seq}])],['uuid','jsonb']);assert.equal((await rpc('hf_profile')).total_score,before.total_score);
   await admin();assert.equal((await one('select count(*)::int as n from hf_private.lifetime_entries where run_id=$1',[run.id])).n,1);await user();
 });
 await denied('new score events after a session ended are rejected',()=>send([ev('forage',{source:'log'})]),/already ended/);
 await check('fresh in-progress map score remains separate from the lifetime total',async()=>{
   const before=await rpc('hf_profile');await start();await send([ev('forage',{source:'chest'}),ev('forage',{source:'basket'})]);assert.equal((await rpc('hf_profile')).total_score,before.total_score);
   await admin();assert.equal((await one('select score from hf_private.runs where id=$1',[run.id])).score,8);await user();
 });
 await check('restarting or moving to another device settles an abandoned session exactly once',async()=>{
   const before=await rpc('hf_profile'), oldRun=run.id;await start();assert.equal((await rpc('hf_profile')).total_score,before.total_score+8);
   await admin();assert.equal((await one('select status from hf_private.runs where id=$1',[oldRun])).status,'abandoned');await user();
   await send([ev('forage',{source:'trail-0'}),ev('death')]);assert.equal((await rpc('hf_profile')).total_score,before.total_score+9);
 });
 await check('smaller sessions add to the lifetime total instead of replacing a previous best',async()=>{
   const before=await rpc('hf_profile');for(let i=0;i<3;i++){await start();await send([ev('forage',{source:'trail-0'}),ev('death')]);}assert.equal((await rpc('hf_profile')).total_score,before.total_score+3);
 });
 await check('the same verified address under a different Auth UUID resolves the original profile',async()=>{
   const p=await rpc('hf_profile');await user(duplicate);assert.deepEqual(await rpc('hf_wallet_profile'),p);assert.deepEqual(await rpc('hf_profile'),p);
   await admin();assert.equal((await one('select count(*)::int as n from hf_private.wallet_profiles where wallet=$1',[address])).n,1);await user(a);
 });
 await check('the public board and compatibility reader rank preserved lifetime totals only',async()=>{
   const p=await rpc('hf_profile'),board=await rpc('hf_lifetime_top100');assert.equal(board.rows[0].score,p.total_score);assert.equal(board.rows[0].name,p.name);assert(!('day'in board));assert(!('resetsAt'in board));assert(!JSON.stringify(board).includes(address));
   const rows=(await q('select * from public.hf_top100()')).rows;assert.equal(rows[0].total_score,p.total_score);assert.equal(rows.length,1);
 });
 await check('changing old calendar buckets or the clock cannot hide the lifetime ranking',async()=>{
   const before=(await rpc('hf_lifetime_top100')).rows;await admin();await q("update hf_private.settings set leaderboard_timezone='Pacific/Auckland'");await q("update hf_private.daily_scores set score_day=score_day-400");await user();assert.deepEqual((await rpc('hf_lifetime_top100')).rows,before);
 });
 await denied('removed daily ranking RPC is no longer callable',()=>rpc('hf_daily_top100'),/does not exist/);
 await check('no replacement for the old daily reset writes remains in the current progress RPC',async()=>{
   await admin();const row=await one("select pg_get_functiondef('public.hf_progress(uuid,jsonb)'::regprocedure) as source");assert(!/daily_scores|score_day|timezone/.test(row.source));await user();
 });
 await denied('lifetime totals cannot be accidentally reduced even by an ordinary owner SQL update',async()=>{await admin();await q('update hf_private.profiles set total_score=0 where user_id=$1',[a]);},/cannot decrease/);await user(a);
 await denied('profile deletion cannot cascade away permanent scores',async()=>{await admin();await q('delete from auth.users where id=$1',[a]);},/Lifetime profiles must be retained|foreign key/);await user(a);
 await denied('browser clients cannot update balances or lifetime totals directly',()=>q('update hf_private.profiles set total_score=999999'),/permission denied/);
 await denied('browser clients cannot insert lifetime ledger entries',()=>q('insert into hf_private.lifetime_entries(run_id,profile_id,points) values($1,$2,999)',[run.id,a]),/permission denied/);
 await user(anonymous);
 for(const [name,args]of[['hf_wallet_profile',[]],['hf_start_run_v4',[1]],['hf_purchase',['costume-batman']],['hf_equip',['costume','costume-batman']]])await denied('unverified users cannot call '+name,()=>rpc(name,args),/Sign in with your wallet/);
 await user(b);const beforeB=await rpc('hf_profile');await denied('another wallet cannot submit events to the original wallet’s run',()=>rpc('hf_progress',[run.id,JSON.stringify([{kind:'death',frame:0,seq:1}])],['uuid','jsonb']),/does not belong/);assert.equal((await rpc('hf_profile')).sqk,beforeB.sqk);
 await admin();await q('update hf_private.profiles set sqk=100 where user_id=$1',[b]);await user(b);
 await check('purchase retries deduct SQK once and owned costumes use the same equip/unequip RPC',async()=>{
   for(let i=0;i<8;i++)await rpc('hf_purchase',['costume-batman']);let p=await rpc('hf_profile');assert.equal(p.sqk,50);assert.equal(p.purchases.length,1);
   p=await rpc('hf_equip',['costume','costume-batman']);assert.equal(p.cosmetics.costume,'costume-batman');p=await rpc('hf_equip',['costume',null]);assert.equal(p.cosmetics.costume,null);assert.equal(p.sqk,50);
 });
 await user(a);await start();
 await denied('arbitrary browser-supplied lifetime totals are rejected',()=>send([ev('set_score',{score:99999})]),/Unknown game event/);
 await check('pickup acknowledgements remain idempotent and give SQK without counting it as score',async()=>{
   await admin();await q("update hf_private.runs set hp[1]=0,loot[1]='coin' where id=$1",[run.id]);await user();const before=await rpc('hf_profile');await send([ev('pickup',{target:0})]);await rpc('hf_progress',[run.id,JSON.stringify([{...ev('pickup',{target:0}),seq}])],['uuid','jsonb']);const p=await rpc('hf_profile');assert.equal(p.sqk,before.sqk+1);assert.equal(p.total_score,before.total_score);
 });
 await denied('a new sequence cannot claim the same SQK drop twice',()=>send([ev('pickup',{target:0})]),/already collected/);
 await check('an entire legal map completion credits all points once and keeps progression and balance',async()=>{
   await start();const before=await rpc('hf_profile');let points=0,coins=0;
   await assert.rejects(()=>send([ev('finish')]),/Defeat all 30/);
   for(let target=0;target<31;target++){
     const hp=target===30?300:run.monsters[target].hp;if(target===30)frame=Math.max(frame,3600);const events=[];
     for(let h=0;h<Math.ceil(hp/37.5);h++){frame+=16;const id=++attack;events.push(ev('attack',{attack:id,weapon:'shell'}),ev('hit',{attack:id,target}));}
     events.push(ev('defeat',{target}),ev('pickup',{target}));await send(events);
     const drop=run.loot[target];points+=drop==='big'?5:drop==='small'?1:0;coins+=drop==='coin'?1:0;
   }
   assert.equal((await rpc('hf_profile')).total_score,before.total_score);
   const p=(await send([ev('finish')])).profile;assert.equal(p.total_score,before.total_score+points);assert.equal(p.sqk,before.sqk+coins);assert.equal(p.highest_map,before.highest_map);
 });
 await check('Top 100 is capped, deterministic on ties and excludes anonymous historical profiles',async()=>{
   await admin();for(let i=0;i<105;i++){const id=randomUUID();await q('insert into auth.users values($1)',[id]);await q('insert into hf_private.profiles(user_id,name,total_score) values($1,$2,2000)',[id,'Player '+i]);await q('insert into hf_private.wallet_profiles values($1,$1,$2)',[id,'0x'+(i+1).toString(16).padStart(40,'0')]);}
   await db.exec('set role anon');const board=await rpc('hf_lifetime_top100');assert.equal(board.rows.length,100);assert(board.rows.every(r=>r.score===2000));assert.deepEqual((await rpc('hf_lifetime_top100')).rows,board.rows);await assert.rejects(()=>q('select * from hf_private.wallet_profiles'),/permission denied/);
 });
 await mkdir('test/scratch/lifetime',{recursive:true});await writeFile('test/scratch/lifetime/database.json',JSON.stringify({results,limitations:'Fixture Auth; no hosted Supabase project or real signatures.'},null,2));
 console.log(`${results.length} lifetime PostgreSQL checks passed.`);
}catch(error){console.error(error.stack);process.exitCode=1;}finally{await db.close();}
