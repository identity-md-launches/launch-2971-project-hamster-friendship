// Exact reviewer walk, real wall clock before upload AND during wallet refill.
// No run, budget, score, HP, position or database timestamp is edited.
// Auth identities are disposable fixtures. No production writes or real wallet.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHarness} from './major-harness.mjs';
import {walk} from './reward-fixture.mjs';
const h=await createHarness(9),started=Date.now(),observations=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
 const u=await h.identity();await h.rpc(u,'hf_wallet_profile');const runs=[];
 for(let i=0;i<4;i++)runs.push(await h.rpc(u,'hf_start_run_v6',{p_map:1}));
 console.log('Four runs started; waiting 75 seconds for actual elapsed play time.');await delay(75000);
 const replies=[];for(const r of runs)replies.push(await h.rpc(u,'hf_progress',{p_run:r.id,p_events:walk()}));
 const p=await h.rpc(u,'hf_wallet_profile');assert.equal(p.total_score,150);assert.equal(p.produce_points,150);assert.equal(p.pending_rewards,130);assert.deepEqual(replies.map(r=>r.ack),[46,46,46,46]);
 observations.push({seconds:(Date.now()-started)/1000,score:p.total_score,produce:p.produce_points,pending:p.pending_rewards,acks:replies.map(r=>r.ack),pendingPerRun:replies.map(r=>r.pendingPoints)});console.log(JSON.stringify(observations.at(-1)));
 // These retries exercise the one-point/second budget without a clock hook.
 for(let i=0;i<5;i++){
  await delay(1000);const next=(await h.rpc(u,'hf_settle_rewards')).profile;
  assert(next.total_score>=151);assert(next.total_score<=150+Math.ceil((Date.now()-started-75000)/1000));assert.equal(next.total_score+next.pending_rewards,280);assert.equal(next.produce_points,next.total_score);
  observations.push({seconds:(Date.now()-started)/1000,score:next.total_score,pending:next.pending_rewards});console.log(JSON.stringify(observations.at(-1)));
 }
 console.log('Waiting for actual budget refill; all unpaid rewards remain in PostgreSQL.');
 // Each wait is under 60s, with progress output for the foreground runner.
 for(let i=0;i<3;i++){await delay(42000);console.log('Real refill elapsed '+((Date.now()-started-75000)/1000).toFixed(1)+' seconds.');}
 const final=(await h.rpc(u,'hf_settle_rewards')).profile;assert.equal(final.total_score,280);assert.equal(final.produce_points,280);assert.equal(final.pending_rewards,0);
 for(const r of runs)assert.equal((await h.rpc(u,'hf_progress',{p_run:r.id,p_events:walk()})).pendingPoints,0);
 assert.equal((await h.rpc(u,'hf_wallet_profile')).total_score,280);assert.equal((await h.rpc(null,'hf_lifetime_top100')).rows[0].score,280);
 observations.push({seconds:(Date.now()-started)/1000,score:final.total_score,produce:final.produce_points,pending:final.pending_rewards,leaderboard:280,replayScore:280});console.log(JSON.stringify(observations.at(-1)));
 await mkdir('test/scratch/deferred',{recursive:true});await writeFile('test/scratch/deferred/real-clock.json',JSON.stringify({passed:true,observations,limitations:['Disposable PGlite PostgreSQL with explicit Auth fixtures, not production Supabase.','No game/budget/clock database fields edited; no client-side time acceleration.']},null,2));
}finally{await h.close();}
