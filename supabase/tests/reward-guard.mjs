// Migration 008 regression: forged forest collection cannot mint ranked score.
// Disposable PostgreSQL (createHarness, 001–008) with an explicit Auth fixture.
// Elapsed play time is simulated only where stated, by backdating started_at.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHarness} from './major-harness.mjs';
const h=await createHarness(8),results=[];
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
const trail=[14,16,24,40,41,49,50,62,66,67,70,71,79,80,85,86,90,106,108,115,121,124,125,136,145,147,153,158,162,168,171,173,178,180];
// The finding's exact source list (70 points).
const sources=[...trail.map((_,i)=>'trail-'+i),'chest','basket','log','lantern-93','lantern-174','bush-54-0','bush-54-1','bush-54-2','bush-176-0','bush-176-1','bush-176-2'];
const column=s=>s.startsWith('trail-')?trail[Number(s.slice(6))]:{basket:8,chest:58,log:127,'lantern-93':93,'lantern-174':174}[s]??(s.startsWith('bush-54')?55:177);
// An honest left-to-right walk at Chang's top ground speed (1.7 px/frame).
function honestWalk(){
 const order=[...sources].sort((x,y)=>column(x)-column(y));let x=6*16,f=0;
 return order.map((source,i)=>{f+=Math.ceil(Math.abs(column(source)*16-x)/1.7);x=column(source)*16;return {kind:'forage',source,seq:i+1,frame:f};});
}
const score=async u=>Number((await h.admin('select total_score from hf_private.profiles where user_id=$1',[u.id])).rows[0].total_score);
const active=async u=>(await h.admin("select count(*)::int as n from hf_private.runs where user_id=$1 and status='active' and rules_version=6",[u.id])).rows[0].n;
const backdate=(run,seconds)=>h.admin("update hf_private.runs set started_at=clock_timestamp()-make_interval(secs=>$2) where id=$1",[run,seconds]);
try {
 const a=await h.identity();await h.rpc(a,'hf_wallet_profile');
 await check('reviewer reproduction: 10 runs × all collectibles at frame 0 credit nothing',async()=>{
  for(let i=0;i<10;i++){
   const run=await h.rpc(a,'hf_start_run_v6',{p_map:1});
   await assert.rejects(()=>h.rpc(a,'hf_progress',{p_run:run.id,p_events:sources.map((source,j)=>({kind:'forage',source,seq:j+1,frame:0}))}),/cannot be reached/);
  }
  assert.equal(await score(a),0);
  const board=await h.rpc(null,'hf_lifetime_top100');assert(!(board.rows||[]).some(r=>Number(r.score)>0));
 });
 await check('one wallet keeps at most four open v6 runs',async()=>{assert.equal(await active(a),4);});
 await check('an honest traversal credits all 70 forest points',async()=>{
  const run=await h.rpc(a,'hf_start_run_v6',{p_map:1}),events=honestWalk();
  await backdate(run.id,Math.ceil(events.at(-1).frame/60)+5);
  const result=await h.rpc(a,'hf_progress',{p_run:run.id,p_events:events});
  assert.equal(result.ack,events.length);assert.equal(result.withheld,0);assert.equal(await score(a),70);
 });
 await check('a collectible teleport across the forest is rejected',async()=>{
  const run=await h.rpc(a,'hf_start_run_v6',{p_map:1});await backdate(run.id,120);
  await assert.rejects(()=>h.rpc(a,'hf_progress',{p_run:run.id,p_events:[{kind:'forage',source:'trail-33',seq:1,frame:1600},{kind:'forage',source:'basket',seq:2,frame:1610}]}),/too far apart/);
  await h.rpc(a,'hf_progress',{p_run:run.id,p_events:[{kind:'forage',source:'trail-33',seq:1,frame:1600}]});
  await assert.rejects(()=>h.rpc(a,'hf_progress',{p_run:run.id,p_events:[{kind:'forage',source:'trail-0',seq:2,frame:1601}]}),/too far apart/);
 });
 await check('concurrent runs share one wallet budget; over-budget events are acknowledged with no credit',async()=>{
  const b=await h.identity();await h.rpc(b,'hf_wallet_profile');
  const runs=[];for(let i=0;i<4;i++){const run=await h.rpc(b,'hf_start_run_v6',{p_map:1});await backdate(run.id,60);runs.push(run);}
  let withheld=0;
  for(const run of runs){const events=honestWalk(),r=await h.rpc(b,'hf_progress',{p_run:run.id,p_events:events});assert.equal(r.ack,events.length);withheld+=r.withheld;}
  const total=await score(b);
  assert(total>=150&&total<=160,'credited '+total); // 150 held + ≤10 s of refillassert.equal(total+withheld,280);
  const board=await h.rpc(null,'hf_lifetime_top100');
  assert.equal(Number(board.rows.find(r=>Number(r.score)===total)?.score),total);
 });
 await check('frames ahead of real elapsed time stay rejected',async()=>{
  const run=await h.rpc(a,'hf_start_run_v6',{p_map:1});
  await assert.rejects(()=>h.rpc(a,'hf_progress',{p_run:run.id,p_events:[{kind:'forage',source:'lantern-174',seq:1,frame:1400}]}),/Invalid game timing/);
 });
}finally{await h.close();}
await mkdir('test/scratch/integration',{recursive:true});
await writeFile('test/scratch/integration/reward-guard.json',JSON.stringify({results,limitations:['Disposable PostgreSQL with explicit Auth fixtures; no production SQL executed.']},null,2));
