// Disposable real PostgreSQL. Auth identities/HTTP are explicit test fixtures;
// this harness is never included in the website or used as a backend fallback.
import {readFile} from 'node:fs/promises';
import {randomUUID, randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {PGlite} = await import(pathToFileURL(resolve('test/scratch/node_modules/@electric-sql/pglite/dist/index.js')).href);
export async function createHarness(last=6) {
 const db=await PGlite.create();
 await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb);create table auth.identities(user_id uuid,provider text,identity_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 const files=['001_friendship','002_seasons_dice_badges','003_squeek','004_lifetime_persistence','005_verified_wallet_recovery','006_four_worlds'];
 for(const file of files.slice(0,last)) await db.exec(await readFile('supabase/migrations/'+file+'.sql','utf8'));
 let flight=Promise.resolve();
 const exclusive=fn=>{const next=flight.then(fn);flight=next.catch(()=>{});return next;};
 async function admin(sql,args=[]){return exclusive(async()=>{await db.exec('reset role');return db.query(sql,args);});}
 async function identity(wallet='0x'+randomBytes(20).toString('hex'),verified=true) {
  const id=randomUUID();await admin('insert into auth.users(id) values($1)',[id]);
  if(verified)await admin("insert into auth.identities values($1,'web3',$2::jsonb)",[id,JSON.stringify({custom_claims:{address:wallet,chain:'ethereum'}})]);
  return {id,wallet};
 }
 async function rpc(user,name,body={}) {
  const casts={p_map:'integer',p_run:'uuid',p_events:'jsonb',p_name:'text',p_item:'text',p_slot:'text',p_legacy:'uuid'};
  return exclusive(async()=>{
   await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user?.id||'']);await db.exec('set role '+(user?'authenticated':'anon'));
   const keys=Object.keys(body),values=keys.map(k=>casts[k]==='jsonb'?JSON.stringify(body[k]):body[k]);
   return (await db.query('select public.'+name+'('+keys.map((k,i)=>k+'=>$'+(i+1)+'::'+casts[k]).join(',')+') as value',values)).rows[0].value;
  });
 }
 return {db,admin,identity,rpc,exclusive,close:()=>db.close()};
}
