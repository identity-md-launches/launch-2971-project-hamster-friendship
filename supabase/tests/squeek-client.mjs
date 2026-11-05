// Actual save.js + actual PostgreSQL RPCs behind an explicit Auth/HTTP adapter.
// No live wallet login, signature verification or Supabase network is implied.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,webcrypto} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {web3Identity} from './web3-identity.mjs';
const {PGlite}=await import(pathToFileURL(resolve(process.argv[2]||'test/scratch/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=await PGlite.create(),a=randomUUID(),b=randomUUID(),legacy=randomUUID();
const addrA='0x'+'a'.repeat(40),addrB='0x'+'b'.repeat(40),prefix='hamster-friendship-v2';
let count=0,lose='',hold='',release,requests=[],badAck=false,failStatus=false,offlineProgress=false,offlineState=false;
async function check(name,fn){await fn();count++;console.log('ok',name);}
async function admin(sql,args=[]){await db.exec('reset role');return db.query(sql,args);}
async function rpc(user,name,body={}){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');const keys=Object.keys(body);const q=await db.query('select public.'+name+'('+keys.map((k,i)=>k+'=> $'+(i+1)+(k==='p_events'?'::jsonb':'')).join(',')+') as value',keys.map(k=>k==='p_events'?JSON.stringify(body[k]):body[k]));return q.rows[0].value;}
function fixture(seed={}){
 const storage=new Map(Object.entries(seed)),events={},calls=[];
 const ctx={console,TextEncoder,Uint8Array,AbortController,crypto:webcrypto,Event,location:{host:'forest.example',origin:'https://forest.example',pathname:'/game/'},navigator:{onLine:true},setTimeout,clearTimeout,setInterval(){},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},HAMSTER_CONFIG:{supabaseUrl:'https://fixture.supabase.test',supabasePublishableKey:'test-public'},
 addEventListener:(name,fn)=>events[name]=fn,dispatchEvent:e=>{calls.push(e.type);events[e.type]?.(e);},
 fetch:async(url,options)=>{
  const path=new URL(url).pathname,body=JSON.parse(options.body||'{}'),token=options.headers.Authorization?.slice(7),user=token==='auth-a'?a:token==='auth-b'?b:token==='legacy'?legacy:null;
  requests.push({path,body,user});
  if(path==='/auth/v1/token')return{ok:true,json:async()=>({access_token:'auth-a',refresh_token:'fixture-refresh',expires_in:3600})};
  if(path.endsWith('/hf_service_status')&&failStatus)return{ok:false,json:async()=>({message:'Injected migration unavailable'})};
  if(path.endsWith('/hf_service_status'))return{ok:true,json:async()=>await rpc(null,'hf_service_status')};
  if(!user)return{ok:false,json:async()=>({message:'Unauthorized fixture request'})};
  const name=path.split('/').pop();
  if(name==='hf_progress'&&offlineProgress||name==='hf_run_state'&&offlineState)return{ok:false,json:async()=>({message:'Injected offline request'})};
  // Only one held request at once; it is released by the test after switching.
  if(hold===name){hold='';await new Promise(done=>release=done);}
  let data;try{data=await rpc(user,name,body);}catch(error){return{ok:false,json:async()=>({message:error.message})};}
  if(name==='hf_progress'&&badAck)return{ok:true,json:async()=>({})};
  if(lose===name){lose='';throw new Error('Injected lost reply AFTER database commit');}
  return{ok:true,json:async()=>data};
 }};
 ctx.window=ctx;vm.createContext(ctx);
 return{ctx,storage,calls,async load(){for(const name of['rules','save'])vm.runInContext(await readFile('src/'+name+'.js','utf8'),ctx);return ctx.HamsterSave;}};
}
const session=(token)=>JSON.stringify({access_token:token,refresh_token:'fixture-refresh',expires_at:Date.now()/1000+3600});
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated;
 create table auth.users(id uuid primary key);create table auth.identities(user_id uuid,provider text,identity_data jsonb);
 create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 for(const file of ['001_friendship.sql','002_seasons_dice_badges.sql'])await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 for(const id of[a,b,legacy])await db.query('insert into auth.users values($1)',[id]);
 await rpc(legacy,'hf_profile');await admin('update hf_private.profiles set sqk=75 where user_id=$1',[legacy]);
 await db.exec(await readFile('supabase/migrations/003_squeek.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/004_lifetime_persistence.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/005_verified_wallet_recovery.sql','utf8'));
 for(const[id,address]of[[a,addrA],[b,addrB]])await admin("insert into auth.identities values($1,'web3',$2::jsonb)",[id,JSON.stringify(web3Identity(address))]);
 await rpc(a,'hf_wallet_profile');await rpc(b,'hf_wallet_profile');await admin('update hf_private.profiles set sqk=200 where user_id=$1',[a]);await admin('update hf_private.profiles set sqk=80 where user_id=$1',[b]);
 const f=fixture({[prefix+'-guest']:JSON.stringify({sqk:99999,total_score:99999,highest_map:99,purchases:['damage-25']}),[prefix+'-wallet-session-'+addrA]:session('auth-a'),[prefix+'-wallet-session-'+addrB]:session('auth-b')});let save=await f.load();
 await check('stored guest progress is neither loaded nor sent to the backend',async()=>{assert.equal(save.snapshot().profile.sqk,0);assert.equal(save.snapshot().profile.highest_map,1);assert.equal(requests.length,0);await save.beginMap(1);save.record('death',{},0);assert.equal(requests.length,0);});
 await check('wallet A restores only A’s verified database balance',async()=>{await save.setWallet(addrA);assert.equal(save.snapshot().profile.sqk,200);assert(save.snapshot().cloud);assert.equal(save.snapshot().profile.wallet,addrA);});
 await check('a lost purchase reply can be retried without a second deduction',async()=>{lose='hf_purchase';await assert.rejects(()=>save.purchase('costume-batman'),/lost reply/);await save.purchase('costume-batman');assert.equal(save.snapshot().profile.sqk,150);assert.equal(save.snapshot().profile.purchases.filter(i=>i==='costume-batman').length,1);});
 await check('failed save is durable and an acknowledged retry credits once',async()=>{const r=await save.beginMap(1);await admin("update hf_private.runs set started_at=clock_timestamp()-interval '1 hour',hp[1]=25,loot[1]='coin' where id=$1",[(await admin("select id from hf_private.runs where user_id=$1 and status='active'",[a])).rows[0].id]);r.loot[0]='coin';save.record('attack',{attack:1,weapon:'shell'},16);save.record('hit',{attack:1,target:0},16);save.record('defeat',{target:0},16);save.record('pickup',{target:0},16);lose='hf_progress';await save.flush();assert.equal(save.snapshot().pendingCoins,1);assert(JSON.parse(f.storage.get(prefix+'-wallet-outbox-'+addrA)).length);await save.flush();assert.equal(save.snapshot().profile.sqk,151,save.snapshot().status);assert.equal(save.snapshot().pendingCoins,0);});
 await check('client rejects a duplicate pickup before making another event',async()=>{assert.equal(save.record('pickup',{target:0},16),null);assert.equal(save.snapshot().pendingEvents,0);});
 await check('an in-flight response for A never overwrites switched wallet B',async()=>{hold='hf_profile';const pending=save.saveName('Wallet A');while(!release)await new Promise(done=>setTimeout(done,1));const switching=save.setWallet(addrB);release();release=null;await pending;await switching;assert.equal(save.snapshot().profile.sqk,80);assert.equal(save.snapshot().profile.wallet,addrB);assert.equal(save.snapshot().profile.name,'Guest');});
 await check('wallet B cannot inherit A’s pending events or purchases',async()=>{assert.equal(save.snapshot().pendingEvents,0);assert(!save.snapshot().profile.purchases.includes('costume-batman'));await save.purchase('costume-samurai');assert.equal(save.snapshot().profile.sqk,30);});
 await check('queued mutations reject a later identity instead of spending its balance',async()=>{hold='hf_profile';const first=save.saveName('Wallet B');while(!release)await new Promise(done=>setTimeout(done,1));const queued=save.purchase('damage-10');const rejection=assert.rejects(()=>queued,/wallet changed/);const switching=save.setWallet(addrA);release();release=null;await first;await switching;await rejection;assert.equal(save.snapshot().profile.sqk,151);assert(!save.snapshot().profile.purchases.includes('damage-10'));});
 await check('disconnect restores the separate guest profile and isolates queued wallet data',async()=>{await save.setWallet('');assert(!save.snapshot().cloud);assert.equal(save.snapshot().profile.sqk,0);await save.beginMap(1);assert.equal(save.snapshot().ranked,false);await save.setWallet(addrB);assert.equal(save.snapshot().profile.sqk,30);});
 await check('reloading and reconnecting cannot import the old guest record',async()=>{const next=fixture(Object.fromEntries(f.storage));const restored=await next.load();assert.equal(restored.snapshot().profile.sqk,0);await restored.setWallet(addrA);assert.equal(restored.snapshot().profile.sqk,151);assert.equal(JSON.parse(next.storage.get(prefix+'-guest')).sqk,99999);});
 await check('mismatched cached Auth session cannot access the claimed wallet',async()=>{const mismatch=fixture({[prefix+'-wallet-session-'+addrA]:session('auth-b')});const m=await mismatch.load();await m.setWallet(addrA);assert(!m.snapshot().cloud);assert.equal(m.snapshot().profile.sqk,0);assert(m.snapshot().status.includes('does not match'));});
 const fresh=fixture({[prefix+'-session']:session('legacy')});const s=await fresh.load();await s.setWallet(addrA);let signed='';
 await check('explicit Web3 login constructs a domain-bound message and preserves historical browser data',async()=>{await s.signIn({request:async({method,params})=>{assert.equal(method,'personal_sign');signed=Buffer.from(params[0].slice(2),'hex').toString();return '0x'+'1'.repeat(130);}},addrA,true);assert(signed.includes('forest.example wants you to sign in'));assert(signed.includes('Chain ID: 1'));assert(signed.includes('Expiration Time:'));assert(s.snapshot().cloud);assert(fresh.storage.has(prefix+'-session'));assert.equal(s.snapshot().profile.sqk,151);});
 await check('an existing wallet balance takes priority over a legacy attachment ticket',async()=>{assert.equal((await rpc(a,'hf_profile')).sqk,151);await admin('select 1');const p=(await db.query('select sqk from hf_private.profiles where user_id=$1',[legacy])).rows[0];assert.equal(p.sqk,75);});
 await check('guest progress survives a disconnect in its own memory profile and never enters a wallet',async()=>{
   const g=fixture({[prefix+'-wallet-session-'+addrA]:session('auth-a')});const gs=await g.load();await gs.beginMap(1);gs.record('forage',{source:'chest'},0);gs.record('death',{},0);assert.equal(gs.snapshot().profile.total_score,6);await gs.setWallet(addrA);assert.equal(gs.snapshot().profile.total_score,0);await gs.setWallet('');assert.equal(gs.snapshot().profile.total_score,6);assert.equal((await rpc(a,'hf_profile')).total_score,0);
 });
 await check('an expired cached login refreshes without another wallet signature',async()=>{
   const expired=fixture({[prefix+'-wallet-session-'+addrA]:JSON.stringify({access_token:'expired',refresh_token:'fixture-refresh',expires_at:0})});const es=await expired.load();await es.setWallet(addrA);assert(es.snapshot().cloud);assert.equal(es.snapshot().profile.sqk,151);assert(expired.storage.get(prefix+'-wallet-session-'+addrA).includes('auth-a'));
 });
 await check('missing backend migration prevents a login signature request',async()=>{
   const missing=fixture(),ms=await missing.load();await ms.setWallet(addrA);let signed=0;failStatus=true;
   try{await assert.rejects(()=>ms.signIn({request:async()=>{signed++;}},addrA),/migration 005/);assert.equal(signed,0);assert(!ms.snapshot().cloud);}finally{failStatus=false;}
 });
 await check('a malformed acknowledgement retains all queued events after database commit',async()=>{
   await save.setWallet(addrA);await save.beginMap(1);save.record('forage',{source:'chest'},0);badAck=true;await save.flush();assert.equal(save.snapshot().pendingEvents,1);assert(save.snapshot().status.includes('did not acknowledge'));badAck=false;await save.flush();assert.equal(save.snapshot().pendingEvents,0);assert.equal(save.snapshot().profile.total_score,0);
 });
 await check('a lost session-end reply cannot award the same lifetime score twice',async()=>{
   lose='hf_progress';save.record('death',{},0);await save.flush();assert.equal(save.snapshot().pendingEvents,0);assert(!save.snapshot().runConflict);assert.equal(save.snapshot().profile.total_score,6);await save.flush();assert.equal((await rpc(a,'hf_profile')).total_score,6);
 });
 await check('a second device restores lifetime score, owned inventory and SQK from SQL, without local game data',async()=>{
   const device=fixture({[prefix+'-wallet-session-'+addrA]:session('auth-a')});const ds=await device.load();await ds.setWallet(addrA);assert.equal(ds.snapshot().profile.total_score,6);assert.equal(ds.snapshot().profile.sqk,151);assert(ds.snapshot().profile.purchases.includes('costume-batman'));assert.equal(ds.snapshot().pendingEvents,0);
   await ds.beginMap(1);ds.record('forage',{source:'basket'},0);ds.record('death',{},0);await ds.flush();await save.retry();assert.equal(save.snapshot().profile.total_score,8);
 });
 const deviceA=fixture({[prefix+'-wallet-session-'+addrA]:session('auth-a'),[prefix+'-wallet-session-'+addrB]:session('auth-b')});
 let aSave=await deviceA.load();await aSave.setWallet(addrA);
 async function takeover(){const device=fixture({[prefix+'-wallet-session-'+addrA]:session('auth-a')});const next=await device.load();await next.setWallet(addrA);await next.beginMap(1);}
 await check('another device ending a map stops the stale run and separates rejected events from pending saves',async()=>{
   await aSave.beginMap(1);aSave.record('forage',{source:'chest'},0);await aSave.flush();
   await takeover();aSave.record('forage',{source:'basket'},0);await aSave.flush();
   const s=aSave.snapshot();assert(s.runConflict,s.status);assert.equal(s.pendingEvents,0);assert.equal(s.recoveryEvents,1);assert(!s.ranked);assert.equal(s.profile.total_score,14);assert(deviceA.calls.includes('hamster:run-conflict'));
   assert.equal(aSave.record('death',{},0),null);assert.match(s.status,/Restart from cloud profile/);assert(!s.status.includes('Open Profile and retry'));
 });
 await check('retry, map starts and purchases never resend an event the ended map cannot accept',async()=>{
   const before=requests.filter(r=>r.path.endsWith('/hf_progress')).length;
   for(let n=0;n<3;n++){await aSave.retry();await assert.rejects(()=>aSave.beginMap(1),/Restart from cloud profile/);}
   await assert.rejects(()=>aSave.purchase('costume-superman'),/Restart from cloud profile/);
   assert.equal(requests.filter(r=>r.path.endsWith('/hf_progress')).length,before);assert.equal(aSave.snapshot().recoveryEvents,1);
 });
 const reloaded=fixture(Object.fromEntries(deviceA.storage));aSave=await reloaded.load();await aSave.setWallet(addrA);
 await check('reload and wallet reconnection retain an actionable terminal conflict and a safe export',async()=>{
   assert(aSave.snapshot().runConflict);assert.equal(aSave.snapshot().recoveryEvents,1);
   const record=JSON.parse(JSON.stringify(aSave.recoveryRecord()));assert.equal(record.wallet,addrA);assert.equal(record.runs[0].events[0].source,'basket');assert.equal(record.runs[0].conflict.ack,1);
   assert(!/access_token|refresh_token|fixture-refresh/.test(JSON.stringify(record)));
   await aSave.setWallet(addrB);assert(!aSave.snapshot().runConflict);assert.equal(aSave.snapshot().recoveryEvents,0);await aSave.setWallet(addrA);assert(aSave.snapshot().runConflict);
 });
 await check('explicit recovery archives rejected events before unblocking a fresh map and purchase',async()=>{
   const before=aSave.snapshot().profile;await aSave.recover();assert(!aSave.snapshot().runConflict);assert.equal(aSave.snapshot().pendingEvents,0);assert.equal(aSave.snapshot().recoveryEvents,1);assert.deepEqual(aSave.snapshot().profile,before);
   assert.equal(JSON.parse(reloaded.storage.get(prefix+'-wallet-recovery-'+addrA))[0].events[0].source,'basket');assert.deepEqual(JSON.parse(reloaded.storage.get(prefix+'-wallet-outbox-'+addrA)),[]);
   await aSave.beginMap(1);aSave.record('death',{},0);await aSave.flush();assert.equal(aSave.snapshot().profile.total_score,before.total_score);
   await aSave.purchase('costume-superman');assert.equal(aSave.snapshot().profile.sqk,before.sqk-50);assert(aSave.snapshot().profile.purchases.includes('costume-superman'));
   const reload=fixture(Object.fromEntries(reloaded.storage)),rs=await reload.load();await rs.setWallet(addrA);assert.equal(rs.snapshot().recoveryEvents,1);assert(!rs.snapshot().runConflict);assert.equal(rs.snapshot().profile.sqk,before.sqk-50);
 });
 await check('a terminal conflict reconciles committed but unacknowledged events without double-crediting',async()=>{
   const before=aSave.snapshot().profile.total_score;await aSave.beginMap(1);aSave.record('forage',{source:'chest'},0);lose='hf_progress';await aSave.flush();assert.equal(aSave.snapshot().pendingEvents,1);assert(!aSave.snapshot().runConflict);
   await takeover();aSave.record('forage',{source:'basket'},0);await aSave.flush();
   const record=aSave.recoveryRecord().runs.at(-1);assert.equal(record.conflict.ack,1);assert.equal(record.events.length,1);assert.equal(record.events[0].seq,2);assert.equal(record.events[0].source,'basket');assert.equal(aSave.snapshot().profile.total_score,before+6);
   await aSave.recover();assert.equal(aSave.snapshot().profile.total_score,before+6);
 });
 await check('transient failures stay retryable and an unavailable state check cannot retire events',async()=>{
   await aSave.beginMap(1);aSave.record('forage',{source:'log'},0);offlineProgress=true;offlineState=true;await aSave.flush();assert(!aSave.snapshot().runConflict);assert.equal(aSave.snapshot().pendingEvents,1);
   offlineProgress=false;await takeover();await aSave.flush();assert(!aSave.snapshot().runConflict);assert.equal(aSave.snapshot().pendingEvents,1);
   offlineState=false;await aSave.retry();assert(aSave.snapshot().runConflict);assert.equal(aSave.recoveryRecord().runs.at(-1).events[0].source,'log');
 });
 await check('failed archive storage keeps the terminal queue and its recovery record intact',async()=>{
   const setter=reloaded.ctx.localStorage.setItem;reloaded.ctx.localStorage.setItem=(key,value)=>{if(key.includes('-wallet-recovery-'))throw new Error('Injected storage full');setter(key,value);};
   await assert.rejects(()=>aSave.recover(),/could not keep the recovery record/);assert(aSave.snapshot().runConflict);assert.equal(aSave.recoveryRecord().runs.at(-1).events[0].source,'log');
   reloaded.ctx.localStorage.setItem=setter;await aSave.recover();assert(!aSave.snapshot().runConflict);await aSave.beginMap(1);
 });
 await check('a late conflict response for an old wallet never stops or overwrites the selected wallet',async()=>{
   aSave.record('forage',{source:'basket'},0);await takeover();hold='hf_run_state';const pending=aSave.flush();while(!release)await new Promise(done=>setTimeout(done,1));
   const count=reloaded.calls.filter(c=>c==='hamster:run-conflict').length;const switching=aSave.setWallet(addrB);release();release=null;await pending;await switching;
   assert.equal(aSave.snapshot().profile.wallet,addrB);assert(!aSave.snapshot().runConflict);assert.equal(reloaded.calls.filter(c=>c==='hamster:run-conflict').length,count);
   await aSave.setWallet(addrA);assert(aSave.snapshot().runConflict);await aSave.recover();
 });
 await mkdir('test/scratch/squeek',{recursive:true});await writeFile('test/scratch/squeek/client.json',JSON.stringify({checks:count,limitations:'Explicit Auth fixtures; no live signature verification.'},null,2));console.log(`${count} client/PostgreSQL checks passed.`);
}catch(error){console.error(error.stack);process.exitCode=1;}finally{await db.close();}
