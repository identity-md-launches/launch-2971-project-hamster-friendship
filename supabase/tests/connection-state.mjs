// Deterministic client-only failure/recovery tests. No production requests.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {fixture} from '../../scripts/major-fixture.mjs';
const results=[];let mode='missing',calls=0,signs=0;
const f=await fixture({game:false,fetch:async()=>{
 calls++;
 if(mode==='offline')throw new TypeError('Network unavailable in test');
 if(mode==='missing')return{ok:false,json:async()=>({code:'PGRST202',message:'Missing function'})};
 return{ok:true,json:async()=>({schemaVersion:mode==='ready'?7:6,rulesVersion:6,leaderboard:'lifetime',migration:9})};
}});
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
await check('startup checks configured credentials, but a missing backend never becomes a saved profile',async()=>{
 await f.ctx.HamsterSave.ready;const s=f.ctx.HamsterSave.snapshot();assert.equal(s.configured,true);assert.equal(s.backendState,'unavailable');assert.equal(s.cloud,false);assert.match(s.status,/finish cloud setup/);assert.equal(calls,1);
});
await check('missing database migrations block signing before any wallet prompt',async()=>{
 const address='0x'+randomBytes(20).toString('hex');await f.ctx.HamsterSave.setWallet(address);
 await assert.rejects(()=>f.ctx.HamsterSave.signIn({request:async()=>{signs++;}},address),/finish cloud setup/);assert.equal(signs,0);assert.equal(f.ctx.HamsterSave.snapshot().cloud,false);
});
await check('retry discovers a repaired backend without inventing authentication or importing guest totals',async()=>{
 await f.ctx.HamsterSave.saveName('Local Visitor');mode='ready';await f.ctx.HamsterSave.checkConnection();const s=f.ctx.HamsterSave.snapshot();assert.equal(s.backendState,'ready');assert.equal(s.cloud,false);assert.equal(s.profile.total_score,0);assert(s.backendCheckedAt);
});
await check('a later incompatible or offline backend fails clearly and remains unsaved',async()=>{
 mode='old';await assert.rejects(()=>f.ctx.HamsterSave.checkConnection(),/finish cloud setup/);mode='offline';await assert.rejects(()=>f.ctx.HamsterSave.checkConnection(),/Check your connection and retry/);assert.equal(f.ctx.HamsterSave.snapshot().cloud,false);
});
await mkdir('test/scratch/integration',{recursive:true});await writeFile('test/scratch/integration/connection-state.json',JSON.stringify({results,limitations:['HTTP and wallet are explicit local fixtures, not production results.']},null,2));
