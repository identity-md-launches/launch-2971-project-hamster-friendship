// Supabase Edge Function. Runtime-provided backend credentials stay here;
// never copy them to config.js, the repository, logs or the static export.
import {validateReplay,engineHash,protocol} from '../_shared/replay.js';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method==='GET')return Deno.env.get('SUPABASE_URL')&&Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  ? reply(200,{validation:protocol,engineHash}) : reply(503,{message:'Cloud replay is not configured.'});
 if(req.method!=='POST')return reply(405,{message:'Use POST to save progress.'});
 const authorization=req.headers.get('authorization');
 if(!authorization?.startsWith('Bearer '))return reply(401,{message:'Sign in with your wallet to save.'});
 try{
  const reader=req.body?.getReader();if(!reader)return reply(400,{message:'Missing save.'});
  let length=0;const chunks:Uint8Array[]=[];
  while(true){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>65536){await reader.cancel();return reply(413,{message:'Save batch is too large.'});}chunks.push(next.value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const body=JSON.parse(new TextDecoder().decode(bytes));
  if(Object.keys(body).some(k=>!['p_run','p_events'].includes(k))||typeof body.p_run!=='string'||!/^[-0-9a-f]{36}$/i.test(body.p_run))return reply(400,{message:'Invalid run request.'});
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return reply(503,{message:'Cloud replay is not configured. Your pending save is kept.'});
  async function rpc(name:string,data:unknown,token:string){
   const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:token,'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(10000)});
   const result=await response.json();if(!response.ok)throw new Error(result.message||'Cloud save failed. Retry.');return result;
  }
  // The user's JWT is verified by PostgREST, and player_id verifies Web3 wallet
  // ownership. Merely decoding a token would not authenticate the request.
  const context=await rpc('hf_replay_context',{p_run:body.p_run},authorization);
  if(context.engineHash&&context.engineHash!==engineHash)throw Error('Replay engine version changed. Keep the pending save for recovery.');
  const previous=context.seq,result=await validateReplay(context,body.p_events);
  return reply(200,await rpc('hf_replay_commit',{p_auth_user:context.authUser,p_run:body.p_run,p_previous:previous,p_events:result.events,p_state:result.state,p_hash:engineHash},'Bearer '+key));
 }catch(error){return reply(400,{message:error instanceof Error?error.message:'Cloud replay failed. Keep the pending save and retry.'});}
});
