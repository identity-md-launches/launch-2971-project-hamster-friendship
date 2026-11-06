// Execute the actual Edge entry with a local Deno/fetch adapter. The adapter
// supplies disposable database credentials; no real secrets are read.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createHarness} from './major-harness.mjs';
const h=await createHarness(10),realFetch=globalThis.fetch,service=randomUUID(),base='https://local-replay-fixture.invalid';
let handler,configured=true,calls=0;
globalThis.Deno={serve(fn){handler=fn;},env:{get(name){return configured?name==='SUPABASE_URL'?base:name==='SUPABASE_SERVICE_ROLE_KEY'?service:undefined:undefined;}}};
const user=await h.identity();await h.rpc(user,'hf_wallet_profile');const run=await h.rpc(user,'hf_start_run_v6',{p_map:1});
globalThis.fetch=async(url,options)=>{
 assert(String(url).startsWith(base+'/rest/v1/rpc/'));assert.equal(options.headers.apikey,service);calls++;
 const name=String(url).split('/').pop(),body=JSON.parse(options.body);let result;
 try{
  if(name==='hf_replay_context')result=await h.rpc(options.headers.Authorization==='Bearer '+user.id?user:null,name,body);
  else{
   assert.equal(name,'hf_replay_commit');assert.equal(options.headers.Authorization,'Bearer '+service);
   result=await h.exclusive(async()=>{await h.db.exec('reset role;set role service_role');try{return(await h.db.query('select public.hf_replay_commit($1::uuid,$2::uuid,$3::integer,$4::jsonb,$5::jsonb,$6::text) as v',[body.p_auth_user,body.p_run,body.p_previous,JSON.stringify(body.p_events),JSON.stringify(body.p_state),body.p_hash])).rows[0].v;}finally{await h.db.exec('reset role');}});
  }
  return new Response(JSON.stringify(result),{status:200});
 }catch(error){return new Response(JSON.stringify({message:error.message}),{status:400});}
};
let checks=0;async function check(name,fn){await fn();checks++;console.log('ok',name);}
const request=(body,token=user.id)=>handler(new Request(base+'/functions/v1/hf-replay',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:typeof body==='string'?body:JSON.stringify(body)}));
try{
 await import('../functions/hf-replay/index.ts');
 await check('health and CORS work without a session; POST still requires authentication',async()=>{
  const r=await handler(new Request(base,{method:'GET'}));assert.equal(r.status,200);assert.equal((await r.json()).validation,'replay-1');assert.equal(calls,0);
  assert.equal((await handler(new Request(base,{method:'OPTIONS'}))).status,204);assert.equal((await request({},null)).status,401);
  assert.equal((await request({p_run:run.id,p_events:[]},randomUUID())).status,400);
 });
 await check('request identity/state injections, oversized bodies and missing configuration fail closed',async()=>{
  const count=calls;for(const key of ['p_auth_user','p_state','score','config'])assert.equal((await request({p_run:run.id,p_events:[],[key]:'injected'})).status,400);assert.equal(calls,count);
  assert.equal((await request('x'.repeat(65537))).status,413);configured=false;assert.equal((await request({p_run:run.id,p_events:[]})).status,503);configured=true;
 });
 await check('actual HTTP handler validates controls then commits with the authenticated context identity',async()=>{
  const events=[{kind:'checkpoint',seq:1,frame:1,inputs:[{frame:0,ticks:1,held:0,pressed:0,touch:false,x:0,y:0,weapon:'shell'}]}];
  const result=await request({p_run:run.id,p_events:events});assert.equal(result.status,200);const data=await result.json();assert.equal(data.ack,1);assert.equal(data.profile.wallet,user.wallet);
  const again=await request({p_run:run.id,p_events:events});assert.equal(again.status,200);assert.equal((await again.json()).ack,1);
 });
 await check('actual HTTP handler rejects fabricated rewards and keeps the accepted checkpoint',async()=>{
  const result=await request({p_run:run.id,p_events:[{kind:'forage',source:'basket',seq:2,frame:1,inputs:[]}]});assert.equal(result.status,400);assert.match((await result.json()).message,/does not match/);assert.equal((await h.rpc(user,'hf_run_state',{p_run:run.id})).ack,1);assert.equal((await h.rpc(user,'hf_wallet_profile')).total_score,0);
 });
 console.log(checks+' Edge HTTP checks passed. Deno serving/network/Auth are local adapters, not production.');
}finally{globalThis.fetch=realFetch;delete globalThis.Deno;await h.close();}
