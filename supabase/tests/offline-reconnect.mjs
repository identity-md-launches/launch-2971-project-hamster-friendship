// Real disposable PostgreSQL, shipped save.js, fixture Web3 identity and HTTP.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHarness} from './major-harness.mjs';
import {device,runQueues,backdateRun,prefix} from './reward-fixture.mjs';
const h=await createHarness(9),results=[];
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await new Promise(done=>setTimeout(done,10));}assert.fail('Reconnect did not complete');}
try{
 const user=await h.identity();await h.rpc(user,'hf_wallet_profile');const a=await device(h,user);await a.save.beginMap(1);a.net.offline=true;
 a.save.record('forage',{source:'basket'},60);a.save.record('death',{},61);await a.save.flush();const queue=runQueues(a.storage)[0];await backdateRun(h,queue.id);
 let b;
 await check('reload while offline retains the signed session and every pending event',async()=>{
  b=await device(h,user,a.storage,{offline:true});await b.save.ready;assert.equal(b.save.snapshot().cloud,false);assert.equal(b.save.snapshot().pendingEvents,2);assert.equal(runQueues(a.storage).length,1);assert(a.storage.has(prefix+'-wallet-session-'+user.wallet));
 });
 await check('online event restores that session and uploads the original queue without a new signature',async()=>{
  b.net.offline=false;b.ctx.dispatchEvent(new Event('online'));await until(()=>b.save.snapshot().cloud&&b.save.snapshot().pendingEvents===0);
  const p=await h.rpc(user,'hf_wallet_profile');assert.equal(p.total_score,2);assert.equal(p.produce_points,2);assert.equal(runQueues(b.storage).length,0);assert.equal(b.save.snapshot().status,'Wallet profile saved.');
 });
 await check('repeated online events and same-wallet fresh device cannot duplicate lifetime credit',async()=>{
  for(let i=0;i<3;i++)b.ctx.dispatchEvent(new Event('online'));await b.save.retry();const c=await device(h,user);assert.equal(c.save.snapshot().profile.total_score,2);assert.equal((await h.rpc(null,'hf_lifetime_top100')).rows[0].score,2);
 });
 await check('wallet switch during a failed restore leaves the old queue intact and cannot sign in a guest',async()=>{
  const c=await device(h,user,new Map(),{offline:true});await c.save.setWallet('');c.net.offline=false;c.ctx.dispatchEvent(new Event('online'));await c.save.ready;assert.equal(c.save.snapshot().cloud,false);assert.equal(c.save.snapshot().wallet,'');assert.equal(c.save.snapshot().profile.total_score,0);
 });
}finally{await h.close();}
await mkdir('test/scratch/touch',{recursive:true});await writeFile('test/scratch/touch/reconnect-results.json',JSON.stringify({results,limitations:['Disposable PostgreSQL and fixture Auth/HTTP; no production write or real signature.']},null,2));console.log(results.length+' offline reload/reconnect checks passed.');
