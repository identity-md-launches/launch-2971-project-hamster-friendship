// Current 001–009 PostgreSQL schema. Administrative balances/ranking rows are
// explicit disposable test fixtures, never production players or client input.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHarness} from './major-harness.mjs';
import {device} from './reward-fixture.mjs';
const h=await createHarness(9),results=[];
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
try{
 const a=await h.identity(),alias=await h.identity(a.wallet.toUpperCase().replace('0X','0x')),other=await h.identity();await h.rpc(a,'hf_wallet_profile');await h.rpc(other,'hf_wallet_profile');
 await check('all current tables, RLS, policies, indexes, RPC grants and fixed search paths satisfy owner verification',async()=>{
  await h.admin('select 1');let booleans=0;for(const file of ['supabase/verify_production.sql','supabase/verify_major.sql'])for(const result of await h.db.exec(await readFile(file,'utf8')))for(const row of result.rows)for(const v of Object.values(row))if(typeof v==='boolean'){assert.equal(v,true,file+' '+JSON.stringify(row));booleans++;}assert(booleans>20);await h.db.exec(await readFile('supabase/test_access.sql','utf8'));
  const indexes=await h.admin("select indexname from pg_indexes where schemaname='hf_private'");assert(indexes.rows.some(r=>r.indexname==='hf_pending_rewards'));
 });
 await check('purchase uses server price, debits SQK once and keeps permanent inventory on retries',async()=>{
  await h.admin('update hf_private.profiles set sqk=100,highest_map=3 where user_id=$1',[a.id]); // Existing earned bankroll fixture.
  const before=await h.rpc(a,'hf_wallet_profile'),cost=Number((await h.admin("select price from hf_private.catalogue where id='costume-batman'")).rows[0].price);
  const bought=await h.rpc(a,'hf_purchase',{p_item:'costume-batman'});assert.equal(bought.sqk,before.sqk-cost);assert.deepEqual(bought.purchases,['costume-batman']);assert.equal(bought.total_score,before.total_score);
  for(let i=0;i<3;i++)assert.deepEqual(await h.rpc(a,'hf_purchase',{p_item:'costume-batman'}),bought);
  assert.equal((await h.admin('select count(*)::int as n from hf_private.purchases where user_id=$1',[a.id])).rows[0].n,1);
 });
 await check('unowned items and insufficient balances cannot change inventory or SQK',async()=>{
  const before=await h.rpc(other,'hf_wallet_profile');await assert.rejects(()=>h.rpc(other,'hf_purchase',{p_item:'costume-batman'}),/Not enough SQK/);await assert.rejects(()=>h.rpc(other,'hf_equip',{p_slot:'costume',p_item:'costume-batman'}),/Buy this costume/);assert.deepEqual(await h.rpc(other,'hf_wallet_profile'),before);
 });
 await check('same wallet on another authenticated device restores SQK, inventory, cosmetics and map unlocks',async()=>{
  await h.rpc(a,'hf_profile',{p_name:'Recovery Friend'});await h.rpc(a,'hf_equip',{p_slot:'costume',p_item:'costume-batman'});const old=await h.rpc(a,'hf_wallet_profile'),fresh=await device(h,alias);assert.deepEqual(JSON.parse(JSON.stringify(fresh.save.snapshot().profile)),old);assert.equal(old.highest_map,3);assert.equal(old.cosmetics.costume,'costume-batman');
  const r=await h.rpc(alias,'hf_start_run_v6',{p_map:3});assert.equal(r.rulesVersion,6);await assert.rejects(()=>h.rpc(alias,'hf_start_run_v6',{p_map:4}),/unlocked map/);
 });
 await check('anonymous/unverified identities and direct browser SQL cannot set permanent scores or SQK',async()=>{
  const unverified=await h.identity(undefined,false);await assert.rejects(()=>h.rpc(unverified,'hf_wallet_profile'),/Sign in with your wallet/);await assert.rejects(()=>h.rpc(null,'hf_wallet_profile'),/permission denied/);
  await h.exclusive(async()=>{await h.db.exec('reset role; set role authenticated');for(const sql of ['update hf_private.profiles set total_score=999999','update hf_private.profiles set sqk=999999','delete from hf_private.purchases'])await assert.rejects(()=>h.db.query(sql),/permission denied/);});
 });
 await check('Global Top 100 reads current permanent SQL scores, excludes zero, caps 100, and has stable ties without wallet data',async()=>{
  const users=[];for(let i=0;i<105;i++){const u=await h.identity();await h.rpc(u,'hf_wallet_profile');await h.admin('update hf_private.profiles set name=$2,total_score=$3 where user_id=$1',[u.id,'Ranking Fixture '+i,2000+Math.floor(i/2)]);users.push(u);}
  const board=await h.rpc(null,'hf_lifetime_top100'),again=await h.rpc(null,'hf_lifetime_top100');assert.equal(board.rows.length,100);assert.equal(board.rows[0].score,2052);assert(board.rows.every((r,i,all)=>r.score>0&&(i===0||r.score<=all[i-1].score)));assert.deepEqual(board.rows,again.rows);assert(board.rows.every(r=>Object.keys(r).sort().join(',')==='highest_map,name,score'));for(const u of users)assert(!JSON.stringify(board).includes(u.wallet));
 });
}finally{await h.close();}
await mkdir('test/scratch/touch',{recursive:true});await writeFile('test/scratch/touch/persistence-results.json',JSON.stringify({results,limitations:['Disposable PGlite PostgreSQL with fixture verified identities. No hosted Supabase or cryptographic Web3 verification.','Bankroll and Top 100 fixture rows seeded administratively in the disposable database.','Single connection: independent-connection contention not exercised.']},null,2));console.log(results.length+' current persistence checks passed.');
