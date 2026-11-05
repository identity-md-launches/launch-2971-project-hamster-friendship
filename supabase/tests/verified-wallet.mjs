// Real PostgreSQL upgrade from 004 with the actual Supabase Web3 identity shape.
// Auth rows are fixtures, not proof of live signature verification.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {web3Identity} from './web3-identity.mjs';
const {PGlite}=await import(pathToFileURL(resolve(process.argv[2]||'test/scratch/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=await PGlite.create(),id=randomUUID(),alias=randomUUID(),invalid=randomUUID(),other=randomUUID();
const address='0x'+'a'.repeat(40),otherAddress='0x'+'b'.repeat(40),results=[];
let uid=id;
async function admin(sql,args=[]){await db.exec('reset role');return db.query(sql,args);}
async function asUser(user=uid){uid=user;await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);await db.exec('set role authenticated');}
async function rpc(name,args=[],casts=[]){return(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)+(casts[i]?'::'+casts[i]:'')).join(',')+') as value',args)).rows[0].value;}
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);create table auth.identities(user_id uuid,provider text,identity_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 for(const file of ['001_friendship','002_seasons_dice_badges','003_squeek','004_lifetime_persistence'])await db.exec(await readFile('supabase/migrations/'+file+'.sql','utf8'));
 for(const user of [id,alias,invalid,other])await admin('insert into auth.users(id) values($1)',[user]);
 for(const[user,wallet]of[[id,address],[alias,address.toUpperCase().replace('0X','0x')],[other,otherAddress]])await admin("insert into auth.identities values($1,'web3',$2::jsonb)",[user,JSON.stringify(web3Identity(wallet))]);
 // Existing wallet link and history are pre-existing data, not created through
 // 004's broken login helper or an invented flat Auth identity.
 await admin("insert into hf_private.profiles(user_id,name,sqk,total_score,highest_map,cosmetics) values($1,'Original Friend',275,1400,4,'{\"costume\":\"costume-batman\"}')",[id]);
 await admin('insert into hf_private.wallet_profiles values($1,$1,$2)',[id,address]);
 await admin("insert into hf_private.purchases(user_id,item,paid) values($1,'costume-batman',50)",[id]);
 await check('004 reproduces the real-identity failure before the upgrade',async()=>{await asUser(id);await assert.rejects(()=>rpc('hf_wallet_profile'),/Sign in with your wallet/);});
 await admin('select 1');const snapshot=await readFile('supabase/preservation_snapshot.sql','utf8'),before=await db.exec(snapshot);
 const identitiesBefore=(await admin('select * from auth.identities order by user_id')).rows;
 await check('005 upgrades without rewriting identities, profile links, balances, purchases or history',async()=>{
   await db.exec(await readFile('supabase/migrations/005_verified_wallet_recovery.sql','utf8'));
   assert.deepEqual(await db.exec(snapshot),before);assert.deepEqual((await admin('select * from auth.identities order by user_id')).rows,identitiesBefore);
   await asUser(id);const p=await rpc('hf_wallet_profile');assert.equal(p.wallet,address);assert.equal(p.sqk,275);assert.equal(p.total_score,1400);assert.equal(p.highest_map,4);assert.deepEqual(p.purchases,['costume-batman']);
   assert.deepEqual(await rpc('hf_service_status'),{schemaVersion:5,leaderboard:'lifetime'});
 });
 await check('uppercase verified claims and a different Auth UUID reopen the same unique profile',async()=>{
   const p=await rpc('hf_wallet_profile');await asUser(alias);assert.deepEqual(await rpc('hf_wallet_profile'),p);assert.deepEqual(await rpc('hf_profile'),p);
   assert.equal((await admin('select count(*)::int as n from hf_private.wallet_profiles where wallet=$1',[address])).rows[0].n,1);
 });
 await check('flat claims, wrong provider/chain, malformed addresses and editable metadata do not authenticate',async()=>{
   await admin('update auth.users set raw_user_meta_data=$2::jsonb where id=$1',[invalid,JSON.stringify(web3Identity(address))]);
   const cases=[['web3',{}],['web3',null],['web3',{address,chain:'ethereum'}],['email',web3Identity(address)],['web3',web3Identity(address,{chain:'solana'})],['web3',web3Identity('0x123')],['web3',web3Identity('0x'+'z'.repeat(40))],['web3',{custom_claims:{address}}]];
   for(const[provider,identity]of cases){await admin('delete from auth.identities where user_id=$1',[invalid]);await admin('insert into auth.identities values($1,$2,$3::jsonb)',[invalid,provider,JSON.stringify(identity)]);await asUser(invalid);await assert.rejects(()=>rpc('hf_wallet_profile'),/Sign in with your wallet/);}
 });
 await check('nested claims take precedence over contradictory top-level address fields',async()=>{
   await admin('update auth.identities set identity_data=$2::jsonb where user_id=$1',[invalid,JSON.stringify({...web3Identity(address),address:otherAddress,chain:'solana'})]);await asUser(invalid);assert.equal((await rpc('hf_wallet_profile')).wallet,address);
 });
 await asUser(id);const run=await rpc('hf_start_run_v4',[1]);await rpc('hf_progress',[run.id,JSON.stringify([{kind:'forage',source:'chest',seq:1,frame:0}])],['uuid','jsonb']);await rpc('hf_start_run_v4',[1]);
 await check('owned ended-run state returns the exact acknowledgement and settled authoritative profile',async()=>{
   const state=await rpc('hf_run_state',[run.id],['uuid']);assert.equal(state.status,'abandoned');assert.equal(state.ack,1);assert.equal(state.profile.total_score,1406);assert.equal(state.profile.sqk,275);
   assert.deepEqual(await rpc('hf_run_state',[run.id],['uuid']),state);
 });
 await check('another wallet and anonymous clients cannot inspect or recover someone else’s run',async()=>{
   await asUser(other);await rpc('hf_wallet_profile');await assert.rejects(()=>rpc('hf_run_state',[run.id],['uuid']),/does not belong/);
   await asUser(null);await db.exec('set role anon');await assert.rejects(()=>rpc('hf_run_state',[run.id],['uuid']),/permission denied/);
   await assert.rejects(()=>db.query('select hf_private.wallet_address()'),/permission denied/);
 });
 await check('post-upgrade preservation and permission checks run as SQL',async()=>{
   await admin('select 1');const checks=await db.exec(await readFile('supabase/verify_lifetime.sql','utf8'));for(const result of checks)for(const row of result.rows)for(const value of Object.values(row))if(typeof value==='boolean')assert.equal(value,true);
 });
 await mkdir('test/scratch/revision',{recursive:true});await writeFile('test/scratch/revision/identity.json',JSON.stringify({results,limitations:'Fixture Auth rows; no hosted Supabase login.'},null,2));console.log(`${results.length} verified-wallet upgrade checks passed.`);
}catch(error){console.error(error.stack);process.exitCode=1;}finally{await db.close();}
