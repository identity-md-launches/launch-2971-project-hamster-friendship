// Runs both real migrations and authenticated RPCs; no live service needed.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
if(!process.argv[2])throw new Error('Pass the PGlite dist/index.js path.');
const {PGlite}=await import(pathToFileURL(resolve(process.argv[2])).href),db=await PGlite.create();
let uid=randomUUID(),other=randomUUID(),count=0,seq=0,run,aid=0;
const q=(sql,args=[])=>db.query(sql,args);
async function admin(){await db.exec('reset role');}
async function user(id=uid){await admin();await q("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role authenticated');}
async function rpc(name,args=[],casts=[]){return (await q('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)+(casts[i]?'::'+casts[i]:'')).join(',')+') as r',args)).rows[0].r;}
async function check(name,fn){await fn();count++;console.log('ok',name);}
async function denied(name,fn,re){await check(name,()=>assert.rejects(fn,re));}
async function start(map=1){run=await rpc('hf_start_run_v3',[map]);seq=0;await admin();await q("update hf_private.runs set started_at=clock_timestamp()-interval '2 hours' where id=$1",[run.id]);await user();return run;}
async function send(events){const batch=events.map((e,i)=>({...e,seq:seq+i+1}));const result=await rpc('hf_progress',[run.id,JSON.stringify(batch)],['uuid','jsonb']);seq=result.ack;return result;}
function hit(target,frame,weapon='shell'){const attack=++aid;return [{kind:'attack',frame,attack,weapon},{kind:'hit',frame,attack,target}];}
try{
 await db.exec("create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 await db.exec(await readFile(new URL('../migrations/001_friendship.sql',import.meta.url),'utf8'));
 await q('insert into auth.users(id) values($1),($2)',[uid,other]);await user();await rpc('hf_profile',['Existing Player']);
 await admin();await q('update hf_private.profiles set sqk=275,total_score=850,highest_map=4,cosmetics=$2 where user_id=$1',[uid,JSON.stringify({shirt:'shirt-blue'})]);await q("insert into hf_private.purchases(user_id,item,paid) values($1,'charged',150),($1,'shirt-blue',20)",[uid]);await user();const legacy=await rpc('hf_start_run',[1]);
 await admin();await check('additive migration applies to populated profiles and an active legacy run',async()=>{await db.exec(await readFile(new URL('../migrations/002_seasons_dice_badges.sql',import.meta.url),'utf8'));});await user();
 await check('existing name, balance, score, inventory, cosmetics and map are unchanged',async()=>{const p=await rpc('hf_profile');assert.equal(p.name,'Existing Player');assert.equal(p.sqk,275);assert.equal(p.total_score,850);assert.equal(p.highest_map,4);assert.equal(p.cosmetics.shirt,'shirt-blue');assert.deepEqual(p.purchases,['charged','shirt-blue']);assert.equal(p.dice.rounds,0);assert.equal(p.badges.filter(b=>b.source==='skill').length,2);});
 await check('pre-upgrade active run retains its original HP and coin entitlement',async()=>{await admin();const r=(await q('select hp,coin_drops,rules_version,status from hf_private.runs where id=$1',[legacy.id])).rows[0];assert.equal(r.hp[0],100);assert.equal(r.hp[30],500);assert(r.coin_drops.every(Boolean));assert.equal(r.rules_version,2);assert.equal(r.status,'active');await user();});
 await check('cached clients must reload for new maps and cannot bypass the 20% rule',async()=>{await assert.rejects(()=>rpc('hf_start_run',[1]),/Reload the website/);assert.equal((await rpc('hf_profile')).sqk,275);await admin();const r=(await q('select status from hf_private.runs where id=$1',[legacy.id])).rows[0];assert.equal(r.status,'active');await user();});
 await start();
 await check('new run provides 30 random specs, 31 independent coin trials and 300 HP boss',async()=>{assert.equal(run.rulesVersion,3);assert.equal(run.monsters.length,30);assert.equal(run.coinDrops.length,31);for(const m of run.monsters){assert(['beetle','ant','larva','ember'].includes(m.type));assert.equal(m.hp,m.size==='small'?50:100);assert.equal(m.damage,1);}await admin();const r=(await q('select hp from hf_private.runs where id=$1',[run.id])).rows[0];assert.equal(r.hp[30],300);await user();});
 await admin();await q('update hf_private.runs set coin_drops[1]=false,coin_drops[2]=true where id=$1',[run.id]);await user();
 const kill=[];let frame=0;for(const target of [0,1]){const hp=run.monsters[target].hp;for(let i=0;i<Math.ceil(hp/37.5);i++){frame+=16;kill.push(...hit(target,frame));}kill.push({kind:'defeat',frame,target});}await send(kill);
 await denied('a defeated monster without an SQK drop cannot credit balance',()=>send([{kind:'collect',frame,target:0}]),/did not drop SQK/);
 await check('eligible coin collection credits SQK exactly once',async()=>{await send([{kind:'collect',frame,target:1}]);assert.equal((await rpc('hf_profile')).sqk,276);});
 await denied('a second new event cannot recollect an eligible coin',()=>send([{kind:'collect',frame,target:1}]),/already collected/);
 await check('acknowledgement replay cannot duplicate coin or score',async()=>{const p=await rpc('hf_profile');const r=await rpc('hf_progress',[run.id,JSON.stringify([{kind:'collect',frame,target:1,seq}])],['uuid','jsonb']);assert.equal(r.profile.sqk,p.sqk);assert.equal(r.profile.total_score,p.total_score);});
 await denied('Dice rejects a DRAW prediction',()=>rpc('hf_dice',['DRAW',randomUUID()],['text','uuid']),/Choose HIGH or LOW/);
 let receipt,id=randomUUID();const balance=(await rpc('hf_profile')).sqk;
 await check('Dice returns two valid faces, tracks the real outcome and never changes SQK',async()=>{receipt=await rpc('hf_dice',['HIGH',id],['text','uuid']);const r=receipt.round;assert(r.dice.every(n=>n>=1&&n<=6));assert.equal(r.total,r.dice[0]+r.dice[1]);assert.equal(r.outcome,r.total===7?'DRAW':r.total>7?'HIGH':'LOW');assert.equal(receipt.profile.dice.rounds,1);assert.equal(receipt.profile.dice.correct,r.correct?1:0);assert.equal(receipt.profile.sqk,balance);});
 await check('replayed Dice request returns the identical result without counting twice',async()=>{const again=await rpc('hf_dice',['HIGH',id],['text','uuid']);assert.deepEqual(again.round,receipt.round);assert.equal(again.profile.dice.rounds,1);});
 await denied('a retry cannot change its prediction',()=>rpc('hf_dice',['LOW',id],['text','uuid']),/original prediction/);
 await check('real correct predictions unlock Bronze/Silver/Gold once with zero SQK rewards',async()=>{let p;for(let i=0;i<650;i++){const r=await rpc('hf_dice',['HIGH',randomUUID()],['text','uuid']);p=r.profile;if(p.dice.correct>=100)break;}assert(p.dice.correct>=100);assert.equal(p.dice.wins,p.dice.correct);assert.equal(p.badges.filter(b=>b.source==='dice').length,3);assert.equal(p.sqk,balance);});
 await denied('Dice achievements are rejected by Badge Exchange',()=>rpc('hf_exchange_badge',['dice-gold']),/Only earned skill/);
 await check('skill Bronze and Silver exchanges remove badges and credit 20/50 once',async()=>{let p=await rpc('hf_exchange_badge',['skill-bronze']);assert.equal(p.sqk,balance+20);p=await rpc('hf_exchange_badge',['skill-bronze']);assert.equal(p.sqk,balance+20);p=await rpc('hf_exchange_badge',['skill-silver']);assert.equal(p.sqk,balance+70);assert(!p.badges.some(b=>b.id==='skill-bronze'||b.id==='skill-silver'));assert.equal(p.badges.filter(b=>b.source==='dice').length,3);});
 await denied('unearned badges cannot be exchanged',()=>rpc('hf_exchange_badge',['skill-gold']),/Only earned/);
 await denied('players cannot mint contribution badges',()=>q('select hf_private.award_contribution($1,$2,$3)',[uid,'gold','verified-test']),/permission denied/);
 await check('owner contribution grant is idempotent and Gold credits exactly 120 SQK once',async()=>{await admin();await q('select hf_private.award_contribution($1,$2,$3)',[uid,'gold','verified-test']);await q('select hf_private.award_contribution($1,$2,$3)',[uid,'gold','verified-test']);await user();let p=await rpc('hf_exchange_badge',['contribution-verified-test']);assert.equal(p.sqk,balance+190);p=await rpc('hf_exchange_badge',['contribution-verified-test']);assert.equal(p.sqk,balance+190);});
 await denied('authenticated role cannot edit badges or Dice receipts directly',()=>q("update hf_private.badges set exchanged_at=null"),/permission denied/);
 await check('another profile cannot use someone else’s badge',async()=>{await user(other);await rpc('hf_profile');await assert.rejects(()=>rpc('hf_exchange_badge',['contribution-verified-test']),/Only earned/);await user();});
 await check('anonymous role cannot roll Dice or exchange badges',async()=>{await admin();await db.exec('set role anon');await assert.rejects(()=>rpc('hf_dice',['HIGH',randomUUID()],['text','uuid']),/permission denied/);await assert.rejects(()=>rpc('hf_exchange_badge',['skill-gold']),/permission denied/);await user();});
 await check('map 3 scales enemy HP and damage by 1.2 squared',async()=>{await start(3);for(const m of run.monsters){assert.equal(m.hp,Math.ceil((m.size==='small'?50:100)*1.2**2));assert.equal(m.damage,1.2**2);}await admin();assert.equal((await q('select hp from hf_private.runs where id=$1',[run.id])).rows[0].hp[30],432);await user();});
 // A complete new map through actual attacks/hits validates frontend rule parity.
 const finisher=randomUUID();await admin();await q('insert into auth.users(id) values($1)',[finisher]);uid=finisher;await user();await rpc('hf_profile',['Map Finisher']);await start();
 await check('full v3 map replay unlocks map 2, awards skill Bronze and exactly the eligible SQK',async()=>{let f=0,chunk=[];for(let target=0;target<31;target++){const hp=target===30?300:run.monsters[target].hp;if(target===30)f=Math.max(f,3600);for(let i=0;i<Math.ceil(hp/25);i++){f+=16;chunk.push(...hit(target,f));}chunk.push({kind:'defeat',frame:f,target});if(run.coinDrops[target])chunk.push({kind:'collect',frame:f,target});if(chunk.length>95){await send(chunk);chunk=[];}}chunk.push({kind:'finish',frame:f});const r=await send(chunk);assert.equal(r.profile.sqk,run.coinDrops.filter(Boolean).length);assert.equal(r.profile.total_score,4500);assert.equal(r.profile.highest_map,2);assert(r.profile.badges.some(b=>b.id==='skill-bronze'));});
 console.log(`${count} additive migration/economy checks passed.`);
}finally{await db.close();}
