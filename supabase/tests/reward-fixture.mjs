// Auth/HTTP fixtures for disposable PostgreSQL only. Never shipped to browsers.
import {fixture} from '../../scripts/major-fixture.mjs';
export const trail=[14,16,24,40,41,49,50,62,66,67,70,71,79,80,85,86,90,106,108,115,121,124,125,136,145,147,153,158,162,168,171,173,178,180];
export const sources=[...trail.map((_,i)=>'trail-'+i),'chest','basket','log','lantern-93','lantern-174','bush-54-0','bush-54-1','bush-54-2','bush-176-0','bush-176-1','bush-176-2'];
export const column=s=>s.startsWith('trail-')?trail[Number(s.slice(6))]:{basket:8,chest:58,log:127,'lantern-93':93,'lantern-174':174}[s]??(s.startsWith('bush-54')?55:177);
export function walk(){
 let x=96,frame=0;
 const events=[...sources].sort((a,b)=>column(a)-column(b)).map((source,i)=>{frame+=Math.ceil(Math.abs(column(source)*16-x)/1.7)+60;x=column(source)*16;return {kind:'forage',source,seq:i+1,frame};});
 events.push({kind:'death',seq:46,frame:4360});return events;
}
export const config={supabaseUrl:'https://sql-fixture.invalid',supabasePublishableKey:'fixture-public'};
export const prefix='hamster-friendship-v2';
export function session(user){return JSON.stringify({access_token:user.id,refresh_token:user.id,expires_at:Date.now()/1000+3600});}
export const runQueues=storage=>[...storage.entries()].filter(([key])=>key.includes('-run-outbox-')).map(([,value])=>JSON.parse(value));
export async function device(h,user,storage=new Map(),net={offline:false,loseReply:false,loseSettlement:false}){
 storage.set(prefix+'-wallet-session-'+user.wallet.toLowerCase(),session(user));
 const f=await fixture({game:false,config,storage,fetch:async(url,options)=>{
  if(net.offline)throw Error('Offline test fixture');
  try{
   const name=new URL(url).pathname.split('/').pop(),body=JSON.parse(options.body||'{}');
   const data=await h.rpc(options.headers.Authorization?user:null,name,body);
   if((net.invalidPayment&&name==='hf_progress')||(net.invalidState&&name==='hf_run_state'))delete data.pendingPoints;
   if(name==='hf_progress'&&net.afterProgress)await net.afterProgress();
   if((net.loseReply&&name==='hf_progress')||(net.loseSettlement&&name==='hf_settle_rewards')){
    net.loseReply=false;net.loseSettlement=false;throw Error('Test reply lost after commit');
   }
   return {ok:true,json:async()=>data};
  }catch(error){return {ok:false,json:async()=>({message:error.message})};}
 }});
 const save=f.ctx.HamsterSave;await save.setWallet(user.wallet);return {...f,save,net};
}
export const backdateRun=(h,id)=>h.admin("update hf_private.runs set started_at=clock_timestamp()-interval '5 minutes' where id=$1",[id]);
// Explicit clock fixture for fast refill edge tests; real-clock coverage lives
// in deferred-rewards-clock.mjs. No clock hook exists in production SQL.
export const refill=(h,user,seconds)=>h.admin("update hf_private.profiles set reward_at=clock_timestamp()-make_interval(secs=>$2) where user_id=$1",[user.id,seconds]);
