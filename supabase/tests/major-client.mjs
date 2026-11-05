import assert from 'node:assert/strict';
import {fixture} from '../../scripts/major-fixture.mjs';
import {createHarness} from './major-harness.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const h=await createHarness(),results=[],prefix='hamster-friendship-v2';
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
const session=user=>JSON.stringify({access_token:user.id,refresh_token:user.id,expires_at:Date.now()/1000+3600});
const config={supabaseUrl:'https://local-fixture.invalid',supabasePublishableKey:'fixture-public-key'};
let users=new Map(),offline=false,loseReply=false,invalidAck=false,requests=[],authUser;
async function transport(url,options){
 const path=new URL(url).pathname,body=JSON.parse(options.body||'{}'),user=users.get(options.headers.Authorization?.slice(7));requests.push({path,body,keepalive:options.keepalive});
 if(path==='/auth/v1/token')return{ok:true,json:async()=>({access_token:authUser.id,refresh_token:authUser.id,expires_in:3600})};
 if(offline&&path.endsWith('/hf_progress')||offline&&path.endsWith('/hf_run_state'))throw new Error('Fixture transport disconnected');
 try{const data=await h.rpc(user,path.split('/').pop(),body);if(loseReply&&path.endsWith('/hf_progress')){loseReply=false;throw new Error('Fixture reply lost after commit');}return{ok:true,json:async()=>invalidAck&&path.endsWith('/hf_progress')?{}:data};}
 catch(error){return{ok:false,json:async()=>({message:error.message})};}
}
async function client(user,storage=new Map()){
 users.set(user.id,user);if(!storage.has(prefix+'-wallet-session-'+user.wallet))storage.set(prefix+'-wallet-session-'+user.wallet,session(user));
 const f=await fixture({game:false,storage,config,fetch:transport});await f.ctx.HamsterSave.setWallet(user.wallet);return{...f,save:f.ctx.HamsterSave};
}
try{
 const a=await h.identity(),b=await h.identity();users.set(b.id,b);await h.rpc(a,'hf_wallet_profile');await h.rpc(b,'hf_wallet_profile');await h.admin('update hf_private.profiles set sqk=275,total_score=1400,highest_map=4 where user_id=$1',[a.id]);
 const c=await client(a);let setup;
 await check('client restores authoritative wallet profile and starts version-6 ranked play',async()=>{
  assert(c.save.snapshot().cloud);assert.equal(c.save.snapshot().profile.sqk,275);assert.equal(c.save.snapshot().profile.total_score,1400);setup=await c.save.beginMap(1);assert.equal(setup.rulesVersion,6);assert(setup.ranked);
 });
 await check('lost network acknowledgement replays safely and lifetime score is saved during play',async()=>{
  loseReply=true;c.save.record('forage',{source:'chest'},0);await c.save.flush();assert.equal(c.save.snapshot().pendingEvents,1);assert.equal((await h.rpc(a,'hf_wallet_profile')).total_score,1406);
  await c.save.flush();assert.equal(c.save.snapshot().pendingEvents,0);assert.equal(c.save.snapshot().profile.total_score,1406);assert(requests.some(r=>r.path.endsWith('/hf_progress')&&r.keepalive));
 });
 await check('offline events survive refresh in per-run durable storage and sync without totals from the browser',async()=>{
  offline=true;c.save.record('forage',{source:'basket'},0);await c.save.flush();assert.equal(c.save.snapshot().pendingEvents,1);assert([...c.storage.keys()].some(k=>k.includes('-run-outbox-')));
  const reload=await client(a,c.storage);assert.equal(reload.save.snapshot().pendingEvents,1);offline=false;await reload.save.flush();assert.equal(reload.save.snapshot().pendingEvents,0);assert.equal(reload.save.snapshot().profile.total_score,1408);assert.equal((await h.rpc(a,'hf_wallet_profile')).total_score,1408);
 });
 await check('malformed acknowledgement retains events and retry cannot increase an already committed score',async()=>{
  const r=await client(a);await r.save.beginMap(1);invalidAck=true;r.save.record('forage',{source:'trail-0'},0);await r.save.flush();assert.equal(r.save.snapshot().pendingEvents,1);invalidAck=false;await r.save.flush();assert.equal(r.save.snapshot().pendingEvents,0);assert.equal(r.save.snapshot().profile.total_score,1409);
 });
 await check('switching wallets isolates pending queues, profiles and later acknowledgements',async()=>{
  const f=await client(a);await f.save.beginMap(1);offline=true;f.save.record('forage',{source:'log'},0);await f.save.flush();f.storage.set(prefix+'-wallet-session-'+b.wallet,session(b));await f.save.setWallet(b.wallet);assert.equal(f.save.snapshot().profile.wallet,b.wallet);assert.equal(f.save.snapshot().profile.total_score,0);offline=false;await f.save.setWallet(a.wallet);assert.equal(f.save.snapshot().profile.total_score,1411);assert.equal(f.save.snapshot().pendingEvents,0);
 });
 await check('two tabs retain separate queues, and ended-map recovery keeps rejected events downloadable',async()=>{
  const storage=new Map(),one=await client(a,storage);await one.save.beginMap(1);offline=true;one.save.record('forage',{source:'chest'},0);await one.save.flush();
  const two=await client(a,storage);await two.save.beginMap(1).then(()=>assert.fail('Unsent queue should block restart'),()=>{});
  // Explicitly ended maps still need safe recovery; a device start no longer
  // terminates other devices' v6 runs. Model a pre-patch terminal run here.
  const oldRun=JSON.parse([...storage.entries()].find(([key])=>key.includes('-run-outbox-'))[1]);
  await h.admin("update hf_private.runs set status='abandoned' where id=$1",[oldRun.id]);
  const device=await client(a);await device.save.beginMap(1);device.save.record('forage',{source:'basket'},0);await device.save.flush();assert.equal(one.save.snapshot().pendingEvents,1);assert.equal(device.save.snapshot().pendingEvents,1);
  offline=false;await one.save.flush();assert(one.save.snapshot().runConflict);await one.save.recover();assert.equal(one.save.snapshot().recoveryEvents,1);assert(one.save.recoveryRecord().runs[0].events.some(e=>e.source==='chest'));assert(!one.save.snapshot().runConflict);
  await device.save.flush();assert.equal(device.save.snapshot().profile.total_score,1413);
 });
 await check('a stale tab acknowledgement cannot erase a newer durable event from another tab',async()=>{
  const writer=await client(a);await writer.save.beginMap(1);offline=true;writer.save.record('forage',{source:'chest'},0);await writer.save.flush();offline=false;
  let release,arrived;const waiting=new Promise(done=>arrived=done);let held=true;
  const reader=await fixture({game:false,storage:writer.storage,config,fetch:async(url,options)=>{const response=await transport(url,options);if(held&&url.endsWith('/hf_progress')){held=false;arrived();await new Promise(done=>release=done);}return response;}});
  const restoring=reader.ctx.HamsterSave.setWallet(a.wallet);await waiting;
  offline=true;writer.save.record('forage',{source:'basket'},0);await writer.save.flush();offline=false;release();await restoring;
  const key=[...writer.storage.keys()].find(k=>k.includes('-run-outbox-'));assert(key);const durable=JSON.parse(writer.storage.get(key));assert(durable.events.some(e=>e.seq===2&&e.source==='basket'));
  const recovered=await client(a,writer.storage);assert.equal(recovered.save.snapshot().pendingEvents,0);assert.equal(recovered.save.snapshot().profile.total_score,1421);
 });
 await check('signed login binds host, URI, nonce and expiry, uses personal_sign only, and does not import local totals',async()=>{
  const fresh=await h.identity();authUser=fresh;users.set(fresh.id,fresh);
  const legacy=JSON.stringify({name:'Unverified',sqk:999999,total_score:999999});const storage=new Map([[prefix+'-guest',legacy]]);const f=await fixture({game:false,storage,config,fetch:transport});await f.ctx.HamsterSave.setWallet(fresh.wallet);
  const calls=[];await f.ctx.HamsterSave.signIn({request:async args=>{calls.push(args);return 'fixture-only-signature';}},fresh.wallet,false);
  assert.equal(calls.length,1);assert.equal(calls[0].method,'personal_sign');const message=Buffer.from(calls[0].params[0].slice(2),'hex').toString();assert(message.startsWith('fixture.example wants you to sign in'));assert(message.includes('URI: https://fixture.example/game/'));assert(/Nonce: [a-f0-9]{32}/.test(message));assert(message.includes('Expiration Time:'));assert.equal(f.ctx.HamsterSave.snapshot().profile.total_score,0);assert.equal(storage.get(prefix+'-guest'),legacy);
 });
 await check('an incompatible backend fails before asking for a signature, and a declined signature leaves the guest intact',async()=>{
  const fresh=await h.identity();users.set(fresh.id,fresh);
  const bad=await fixture({game:false,config,fetch:async(url,options)=>url.endsWith('/hf_service_status')?{ok:true,json:async()=>({schemaVersion:6,rulesVersion:6,leaderboard:'lifetime'})}:transport(url,options)});await bad.ctx.HamsterSave.setWallet(fresh.wallet);let signs=0;await assert.rejects(()=>bad.ctx.HamsterSave.signIn({request:async()=>{signs++;}},fresh.wallet),/finish cloud setup/);assert.equal(signs,0);assert.equal(bad.ctx.HamsterSave.snapshot().cloud,false);
  const f=await fixture({game:false,config,fetch:transport});await f.ctx.HamsterSave.setWallet(fresh.wallet);await assert.rejects(()=>f.ctx.HamsterSave.signIn({request:async()=>{throw Object.assign(new Error('Declined'),{code:4001});}},fresh.wallet),/Declined/);assert.equal(f.ctx.HamsterSave.snapshot().cloud,false);assert.equal(f.ctx.HamsterSave.snapshot().profile.total_score,0);
 });
 await check('secret API keys and service-role JWTs fail closed before a network or signing call',async()=>{
  for(const key of ['sb_secret_fixture',Buffer.from('{}').toString('base64')+'.'+Buffer.from('{"role":"service_role"}').toString('base64')+'.fixture',Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({role:'service_role',note:'??????'})).toString('base64url')+'.fixture']){
   let calls=0;const f=await fixture({game:false,config:{...config,supabasePublishableKey:key},fetch:()=>{calls++;throw new Error('must not reach network');}});assert(!f.ctx.HamsterSave.snapshot().configured);assert.equal(calls,0);
  }
 });
 await check('the leaderboard client reads only the Supabase public RPC, never local scores',async()=>{
  const before=requests.length;const board=await c.save.leaderboard();assert(board.rows.some(r=>r.score===1421));assert.equal(requests[before].path,'/rest/v1/rpc/hf_lifetime_top100');assert.equal(Object.keys(requests[before].body).length,0);
 });
 await mkdir('test/scratch/major',{recursive:true});await writeFile('test/scratch/major/client-results.json',JSON.stringify({results,limitations:['Auth/token and transport fixtures; signatures are not cryptographically verified by this harness.']},null,2));console.log(results.length+' save-client checks passed.');
}finally{await h.close();}
