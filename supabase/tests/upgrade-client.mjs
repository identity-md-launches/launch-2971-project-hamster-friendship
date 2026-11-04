// Actual engine + save.js + both PostgreSQL migrations. Transport failures below
// deliberately happen after commit to exercise lost acknowledgements.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {fixture} from '../../scripts/test.mjs';
if(!process.argv[2])throw new Error('Pass the PGlite dist/index.js path.');
const {PGlite}=await import(pathToFileURL(resolve(process.argv[2])).href),db=await PGlite.create();
const user=randomUUID(),key=randomUUID(),session=randomUUID();let count=0,offline=false,loseDice=false,loseExchange=false,failStart=false,runId;
async function check(name,fn){await fn();count++;console.log('ok',name);}
async function admin(sql,args=[]){await db.exec('reset role');return db.query(sql,args);}
async function fetch(url,options){
 const body=JSON.parse(options.body),path=new URL(url).pathname,response=(status,data)=>({ok:status===200,status,json:async()=>data});assert.equal(options.headers.apikey,key);
 if(path==='/auth/v1/signup'){await admin('insert into auth.users(id) values($1)',[user]);return response(200,{access_token:session,refresh_token:session,expires_in:3600});}
 assert.equal(options.headers.Authorization,'Bearer '+session);const name=path.split('/').at(-1);
 if(name==='hf_start_run_v3'&&failStart)return response(503,{message:'Test start interrupted.'});
 if(name==='hf_progress'&&offline)return response(503,{message:'Test transport interrupted.'});
 const defs={hf_profile:{p_name:'text'},hf_start_run_v3:{p_map:'integer'},hf_progress:{p_run:'uuid',p_events:'jsonb'},hf_dice:{p_prediction:'text',p_request:'uuid'},hf_exchange_badge:{p_badge:'text'},hf_purchase:{p_item:'text'}};assert(Object.hasOwn(defs,name));
 try{
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');const args=Object.keys(body),def=defs[name],values=args.map(k=>def[k]==='jsonb'?JSON.stringify(body[k]):body[k]);
  const result=(await db.query('select public.'+name+'('+args.map((k,i)=>k+'=>$'+(i+1)+'::'+def[k]).join(',')+') as r',values)).rows[0].r;
  if(name==='hf_start_run_v3'){runId=result.id;await admin("update hf_private.runs set coin_drops[1]=true,started_at=clock_timestamp()-interval '1 hour' where id=$1",[runId]);result.coinDrops[0]=true;}
  if(name==='hf_dice'&&loseDice){loseDice=false;return response(503,{message:'Test reply lost after commit.'});}
  if(name==='hf_exchange_badge'&&loseExchange){loseExchange=false;return response(503,{message:'Test reply lost after commit.'});}
  return response(200,result);
 }catch(e){return response(400,{message:e.message});}
}
try{
 await db.exec("create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 for(const file of ['001_friendship.sql','002_seasons_dice_badges.sql'])await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
 const options={config:{supabaseUrl:'https://cloud.test',supabasePublishableKey:key},globals:{fetch,AbortController}};
 let {ctx,t,storage}=await fixture({},options),save=ctx.HamsterSave;
 await check('real save client accepts the upgraded cloud profile without importing guest credit',()=>{assert(save.snapshot().cloud);assert.equal(save.snapshot().profile.sqk,0);assert.equal(save.snapshot().profile.dice.rounds,0);});
 await t.startGame(1,true);
 await check('actual game instantiates server-selected monster HP and type',async()=>{const rows=await admin('select monsters from hf_private.runs where id=$1',[runId]);for(const e of t.enemies){assert.equal(e.type,rows.rows[0].monsters[e.id].type);assert.equal(e.hp,rows.rows[0].monsters[e.id].hp);}assert.equal(t.boss.hp,300);});
 const enemy=t.enemies[0];enemy.state='patrol';const hits=Math.ceil(enemy.hp/25);
 for(let i=0;i<hits;i++){t.game.frames+=16;t.player.throwCd=0;t.press('throw');t.updatePlayer();const s=t.shots.at(-1);s.x=enemy.x-s.vx;s.y=enemy.y-s.vy-s.g;t.updateShots();}
 const coin=t.pickups.find(p=>p.kind==='coin'&&p.target===0);assert(coin);coin.phys=false;t.player.x=coin.x;t.player.y=coin.y;t.updatePickups();
 await check('v3 engine coin event persists offline and reload/retry credits once',async()=>{offline=true;await save.flush();assert.equal(save.snapshot().pendingCoins,1);const reloaded=await fixture(Object.fromEntries(storage),options);save=reloaded.ctx.HamsterSave;ctx=reloaded.ctx;t=reloaded.t;storage=reloaded.storage;assert.equal(save.snapshot().pendingCoins,1);offline=false;await save.retry();await save.retry();assert.equal(save.snapshot().pendingEvents,0);assert.equal(save.snapshot().profile.sqk,1);assert.equal(save.snapshot().profile.total_score,100);});
 await check('a Dice acknowledgement lost after commit retries one saved result',async()=>{const id=randomUUID();loseDice=true;await assert.rejects(()=>save.playDice('HIGH',id),/reply lost/);const round=await save.playDice('HIGH',id);const again=await save.playDice('HIGH',id);assert.equal(again.total,round.total);assert.equal(save.snapshot().profile.dice.rounds,1);assert.equal(save.snapshot().profile.sqk,1);});
 await admin('select hf_private.award_contribution($1,$2,$3)',[user,'silver','verified-client-test']);
 await check('an exchange acknowledgement lost after commit retries one 50 SQK credit',async()=>{loseExchange=true;await assert.rejects(()=>save.exchangeBadge('contribution-verified-client-test'),/reply lost/);await save.exchangeBadge('contribution-verified-client-test');await save.exchangeBadge('contribution-verified-client-test');assert.equal(save.snapshot().profile.sqk,51);assert(save.snapshot().profile.exchanged.includes('contribution-verified-client-test'));});
 await check('interleaved cloud mutations apply profile snapshots in order without losing balance',async()=>{await Promise.all([save.playDice('LOW',randomUUID()),save.purchase('shirt-blue'),save.saveName('Cloud Friend')]);const p=save.snapshot().profile;assert.equal(p.sqk,31);assert.equal(p.name,'Cloud Friend');assert(p.purchases.includes('shirt-blue'));assert.equal(p.dice.rounds,2);});
 await check('a failed cloud restart cannot resume an ended run and Retry recovers without losing SQK',async()=>{await t.startGame(1,true);t.pauseGame();failStart=true;await t.startGame(1,true);assert.equal(t.game.state,'gameover');assert.equal(ctx.document.getElementById('screen-over').hidden,false);assert(ctx.document.getElementById('game-error').textContent.includes('Test start interrupted'));t.resumeGame();assert.equal(t.game.state,'gameover');assert.equal(save.snapshot().profile.sqk,31);failStart=false;await t.respawn();assert.equal(t.game.state,'playing');assert.equal(save.snapshot().profile.sqk,31);assert.equal(save.snapshot().profile.name,'Cloud Friend');});
 console.log(`${count} upgraded client/engine/PostgreSQL checks passed.`);
}finally{await db.close();}
