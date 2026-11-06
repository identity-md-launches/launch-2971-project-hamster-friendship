import {fixture} from '../../scripts/major-fixture.mjs';
import {validateReplay,engineHash} from '../functions/_shared/replay.js';
export async function replayRpc(h,user,run,events) {
 const context=await h.rpc(user,'hf_replay_context',{p_run:run});
 const previous=context.seq,result=await validateReplay(context,events);
 return h.exclusive(async()=>{
  await h.db.exec('reset role;set role service_role');
  try{return (await h.db.query('select public.hf_replay_commit($1::uuid,$2::uuid,$3::integer,$4::jsonb,$5::jsonb,$6::text) as value',[user.id,run,previous,JSON.stringify(result.events),JSON.stringify(result.state),engineHash])).rows[0].value;}finally{await h.db.exec('reset role');}
 });
}
export async function replayDevice(h,user,storage=new Map(),testOptions={}) {
 const net={offline:!!testOptions.offline,loseReply:false},requests=[],errors=[];
 const prefix='hamster-friendship-v2';
 if(!storage.size)storage.set(prefix+'-wallet-session-'+user.wallet.toLowerCase(),JSON.stringify({access_token:user.id,refresh_token:user.id,expires_at:Date.now()/1000+3600}));
 const f=await fixture({storage,touch:!!testOptions.touch,config:{supabaseUrl:'https://fixture.invalid',supabasePublishableKey:'fixture-public'},fetch:async(url,options)=>{
  if(net.offline)throw Error('Deliberate offline fixture');
  const name=new URL(url).pathname.split('/').pop(),body=JSON.parse(options.body||'{}');requests.push({name,body});
  try{
   let data;
   if(name==='hf-replay'&&options.method==='GET')data={validation:'replay-1',engineHash};
   else if(name==='hf-replay')data=await replayRpc(h,user,body.p_run,body.p_events);
   else data=await h.rpc(options.headers.Authorization?user:null,name,body);
   if(name==='hf_start_run_v6'){
    f.run=data.id; if(testOptions.onStart) await testOptions.onStart(h,user,data);
    // Accelerated elapsed clock permits short, deterministic engine tests.
    await h.admin("update hf_private.runs set started_at=clock_timestamp()-interval '2 hours' where id=$1",[data.id]);
   }
   if(net.loseReply&&name==='hf-replay'){net.loseReply=false;throw Error('Deliberate lost committed reply');}
   return {ok:true,json:async()=>data};
  }catch(error){errors.push(error.message);return {ok:false,json:async()=>({message:error.message})};}
 }});
 f.net=net;f.requests=requests;f.errors=errors;f.save=f.ctx.HamsterSave;
 await f.save.setWallet(user.wallet);
 return f;
}
export function tick(f,held=[],pressed=[]) {
 f.t.release();for(const key of held)f.t.hold(key,true);for(const key of pressed)f.t.press(key);
 f.t.tick();while(f.t.game.state==='dialogue')f.t.advanceDialogue();
}
export function queued(f) {return [...f.storage.entries()].filter(([k])=>k.includes('-run-outbox-')).flatMap(([,v])=>JSON.parse(v).events);}
