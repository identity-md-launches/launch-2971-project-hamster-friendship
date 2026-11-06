// Live, public-key-only probes. No fabricated wallet, Auth user or player data.
// An unavailable endpoint is not evidence that its underlying table is absent.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import vm from 'node:vm';
import {resolve,dirname} from 'node:path';
const context={window:{}};vm.runInNewContext(await readFile('src/config.js','utf8'),context);
const {supabaseUrl:base,supabasePublishableKey:key}=context.window.HAMSTER_CONFIG;
if(base!=='https://nhtlwcukeyhvkrjveots.supabase.co'||!key.startsWith('sb_publishable_'))throw Error('Expected the assigned project and a browser publishable key.');
const probes=[];
async function probe(name,path,{method='GET',body,headers={}}={}){
 try{
  const response=await fetch(base+path,{method,headers:{apikey:key,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>null);
  // Never record cookies, Authorization headers or session tokens.
  const result={name,path,method,status:response.status,body:data};probes.push(result);console.log(name+': HTTP '+response.status);return result;
 }catch(error){const result={name,path,method,status:null,error:error.message};probes.push(result);console.log(name+': '+error.message);return result;}
}
const auth=await probe('Project Auth connectivity','/auth/v1/settings');
// No invented account or signature: Auth checks the provider before validating
// the missing credentials. An explicit disabled response is actionable; other
// errors cannot establish that a real signed login would work.
const web3=await probe('Ethereum Web3 provider preflight (no login credentials)','/auth/v1/token?grant_type=web3',{method:'POST',body:{chain:'ethereum'}});
const service=await probe('Application schema version','/rest/v1/rpc/hf_service_status',{method:'POST',body:{}});
const board=await probe('Actual lifetime leaderboard','/rest/v1/rpc/hf_lifetime_top100',{method:'POST',body:{}});
await probe('Unauthenticated profile RPC','/rest/v1/rpc/hf_wallet_profile',{method:'POST',body:{p_legacy:null}});
await probe('Unauthenticated progress RPC (no run or events)','/rest/v1/rpc/hf_progress',{method:'POST',body:{p_run:null,p_events:[]}});
await probe('Private schema exposure','/rest/v1/profiles?select=user_id&limit=0',{headers:{'Accept-Profile':'hf_private'}});
await probe('Catalog discovery permission','/rest/v1/',{headers:{Accept:'application/openapi+json'}});
const replay=await probe('Authoritative replay health','/functions/v1/hf-replay');
const applicationReachable=service.status===200&&board.status===200&&replay.status===200;
const rpcReady=applicationReachable&&service.body?.schemaVersion===7&&service.body?.rulesVersion===6&&service.body?.leaderboard==='lifetime'&&service.body?.migration===11&&service.body?.scoreMode==='personal-best'&&board.body?.scoreMode==='personal-best'&&replay.body?.validation==='replay-1'&&replay.body?.engineVersion===2;
const web3State=web3.body?.error_code==='web3_provider_disabled'?'disabled':'not verified';
const report={checkedAt:new Date().toISOString(),project:base,keyType:'publishable',connectivityPassed:auth.status===200,web3State,applicationReachable,rpcReady,personalBestReady:rpcReady,integrationComplete:false,productionMigrationsExecuted:[],probes,
 mandatoryTests:[
  {test:'Connect to actual production project',status:auth.status===200?'passed':'failed',evidence:'Auth settings request above'},
  {test:'Read and write an authenticated player record',status:'blocked',reason:'No verified wallet session; player RPC unavailable if status above is 404'},
  {test:'Save a player score',status:'blocked',reason:'Requires installed RPCs and real authenticated game events'},
  {test:'Refresh and retain score',status:'not performed',reason:'No production score was saved'},
  {test:'Reconnect same wallet across devices',status:'not performed',reason:'No real wallet signature/session available'},
  {test:'Leaderboard from actual records',status:board.status===200?'read endpoint reached; record comparison not performed':'failed',reason:'Requires saved production records for comparison'},
  {test:'RLS prevents unauthorized score modification',status:'not verified',reason:'Missing RPCs or schema-exposure denial cannot prove installed RLS policies'}
 ],
 tables:['profiles','catalogue','purchases','runs','attacks','badges','dice_receipts','wallet_profiles','legacy_tickets','settings','daily_scores','lifetime_entries','personal_best_baselines'].map(name=>({schema:'hf_private',name,status:'not inspectable with supplied publishable key'})),
 limitations:['No Supabase MCP or direct database administrative access available.','No production migration, player creation, score write, refresh recovery or real signature is claimed.','Execute supabase/inspect_production.sql through the authorized SQL Editor, then only missing migrations.','Ethereum Web3 provider state: '+web3State+'. A preflight is not a real signed login.']};
const args=process.argv.slice(2),i=args.indexOf('--out'),out=resolve(i<0?'artifacts/supabase-production.json':args[i+1]);await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');
console.log('Report: '+out+'; production integration remains unverified.');
if(!rpcReady||auth.status!==200||web3State==='disabled')process.exitCode=1;
