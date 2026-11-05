// Browser + unchanged static export + actual PostgreSQL RPCs. Supabase Auth,
// wallet signatures and HTTP are explicit fixtures, not hosted verification.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHarness} from '../supabase/tests/major-harness.mjs';
const pw=await import(pathToFileURL(resolve('test/scratch/node_modules/playwright/index.mjs')).href),h=await createHarness();
const root=resolve('dist'),results=[],errors=[],transportErrors=[],requests=[],mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://127.0.0.1').pathname;const file=resolve(root,'.'+path+(path.endsWith('/')?'index.html':''));if(!file.startsWith(root+sep))throw Error();res.setHeader('content-type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const url='http://127.0.0.1:'+server.address().port+'/';
await mkdir('test/scratch/major/shots',{recursive:true});
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
let browser,loseBoard=false,activeRun;
try{
 const a=await h.identity();await h.rpc(a,'hf_wallet_profile');await h.admin("update hf_private.profiles set name='Cloud Mouse',sqk=275,total_score=1400,highest_map=1 where user_id=$1",[a.id]);
 browser=await pw.chromium.launch({headless:true});
 async function context(){
  const c=await browser.newContext({viewport:{width:390,height:844}});
  await c.addInitScript(({address})=>{
   const listeners={};let chain=localStorage.getItem('fixture-wallet-chain')||'0x89';window.walletCalls=[];
   const provider={isMetaMask:true,on(name,fn){(listeners[name]||=[]).push(fn);},removeListener(name,fn){listeners[name]=(listeners[name]||[]).filter(f=>f!==fn);},async request(args){window.walletCalls.push(args);if(args.method==='eth_requestAccounts'||args.method==='eth_accounts')return[address];if(args.method==='eth_chainId')return chain;if(args.method==='wallet_switchEthereumChain'){chain='0x1';localStorage.setItem('fixture-wallet-chain',chain);for(const fn of listeners.chainChanged||[])fn(chain);return null;}if(args.method==='personal_sign')return'fixture-signature-not-cryptographically-verified';throw Error('Unexpected wallet method: '+args.method);}};
   window.ethereum=provider;window.addEventListener('eip6963:requestProvider',()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{rdns:'io.metamask',name:'MetaMask'},provider}})));
  },{address:a.wallet});
  await c.route('**/config.js',r=>r.fulfill({contentType:'text/javascript',body:"window.HAMSTER_CONFIG=Object.freeze({supabaseUrl:'https://sql-fixture.invalid',supabasePublishableKey:'fixture-public'});"}));
  const source=(await readFile('dist/game.js','utf8')).replace('  // Title state uses a fresh world',"window.probe={startGame,updatePickups,get pickups(){return pickups;},get player(){return player;}};\n  // Title state uses a fresh world");
  await c.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:source}));
  await c.route('https://sql-fixture.invalid/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname,body=request.postDataJSON()||{};requests.push({path,body});
   if(path==='/auth/v1/token'){await route.fulfill({json:{access_token:a.id,refresh_token:a.id,expires_in:3600}});return;}
   const name=path.split('/').pop();if(loseBoard&&name==='hf_lifetime_top100'){loseBoard=false;await route.fulfill({status:503,json:{message:'Fixture connection interrupted'}});return;}
   try{const data=await h.rpc(request.headers().authorization?a:null,name,body);if(name==='hf_start_run_v6')activeRun=data.id;await route.fulfill({json:data});}catch(error){transportErrors.push(error.message);await route.fulfill({status:400,json:{message:error.message}});}
  });
  const p=await c.newPage();await p.clock.install();p.on('pageerror',e=>errors.push(e.message));await p.goto(url);return{c,p};
 }
 const {c,p}=await context();
 async function login(page){await page.locator('#btn-wallet').click();await page.locator('#wallet-options').getByRole('button',{name:'Connect MetaMask',exact:true}).click();await page.getByRole('button',{name:'Sign in to save',exact:true}).click();await page.waitForFunction(()=>window.HamsterSave.snapshot().cloud);await page.locator('#close-wallet').click();}
 await check('EIP-6963 MetaMask connects, switches network and signs an explicit gas-free login',async()=>{
  await login(p);const calls=await p.evaluate(()=>window.walletCalls);assert(calls.some(c=>c.method==='wallet_switchEthereumChain'));assert.equal(calls.filter(c=>c.method==='personal_sign').length,1);assert(calls.every(c=>['eth_requestAccounts','eth_accounts','eth_chainId','wallet_switchEthereumChain','personal_sign'].includes(c.method)));
  const profile=await p.evaluate(()=>window.HamsterSave.snapshot().profile);assert.equal(profile.sqk,275);assert.equal(profile.total_score,1400);assert.equal(profile.name,'Cloud Mouse');
 });
 await check('real engine produce events save through HTTP/RPC and the lifetime HUD updates during play',async()=>{
  await p.evaluate(async()=>{const t=window.probe;await t.startGame(1,true);const food=t.pickups.find(k=>k.kind==='produce');t.player.x=food.x;t.player.y=food.y;t.updatePickups();await window.HamsterSave.flush();});
  await p.waitForFunction(()=>window.HamsterSave.snapshot().profile.total_score===1401);assert.equal(await p.locator('#hud-lifetime').textContent(),'1,401');assert.equal((await h.rpc(a,'hf_wallet_profile')).total_score,1401);
 });
 await check('leaderboard displays SQL rankings and a transport failure retains them with a working retry',async()=>{
  await p.locator('#btn-menu').click();await p.locator('#btn-leaderboard').click();await p.locator('.leaderboard tbody tr').waitFor();assert.equal(await p.locator('.leaderboard tbody tr td:nth-child(2)').textContent(),'Cloud Mouse');assert.equal(await p.locator('.leaderboard tbody tr td:nth-child(3)').textContent(),'1,401');
  const run=(await h.admin('select seq,frame from hf_private.runs where id=$1',[activeRun])).rows[0];await h.rpc(a,'hf_progress',{p_run:activeRun,p_events:[{kind:'forage',source:'basket',seq:run.seq+1,frame:run.frame}]});await p.clock.fastForward(15001);await p.waitForFunction(()=>document.querySelector('.leaderboard tbody tr td:nth-child(3)')?.textContent==='1,403');
  loseBoard=true;await p.getByRole('button',{name:'Refresh rankings',exact:true}).click();await p.getByText(/Showing the last loaded rankings/).waitFor();assert.equal(await p.locator('.leaderboard tbody tr').count(),1);await p.getByRole('button',{name:'Refresh rankings',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('#panel-content .error'));await p.screenshot({path:'test/scratch/major/shots/cloud-leaderboard.png'});await p.keyboard.press('Escape');
 });
 await check('marketplace purchase and equip preserve a permanent SQK balance and inventory',async()=>{
  await p.locator('#btn-menu').click();await p.locator('#btn-shop').click();await p.locator('[data-item="costume-batman"]').click();await p.getByText('Batman hamster purchased.',{exact:true}).waitFor();await p.locator('[data-item="costume-batman"]').click();await p.getByText('Batman hamster equipped.',{exact:true}).waitFor();assert.equal((await h.rpc(a,'hf_wallet_profile')).sqk,225);await p.keyboard.press('Escape');
 });
 await check('refresh silently restores the same signed wallet profile, score and cosmetics without a new signature',async()=>{
  await p.reload();await p.waitForFunction(()=>window.HamsterSave.snapshot().cloud);const s=await p.evaluate(()=>({profile:window.HamsterSave.snapshot().profile,calls:window.walletCalls}));assert.equal(s.profile.total_score,1403);assert.equal(s.profile.sqk,225);assert.equal(s.profile.cosmetics.costume,'costume-batman');assert.equal(s.calls.filter(c=>c.method==='personal_sign').length,0);
 });
 await check('a second device signing the same wallet retrieves one existing profile and permanent records',async()=>{
  const second=await context();await login(second.p);const s=await second.p.evaluate(()=>window.HamsterSave.snapshot().profile);assert.equal(s.total_score,1403);assert.equal(s.sqk,225);assert.deepEqual(s.purchases,['costume-batman']);assert.equal((await h.admin('select count(*)::int as n from hf_private.wallet_profiles where wallet=$1',[a.wallet])).rows[0].n,1);await second.c.close();
 });
 await check('disconnect switches the title and profile back to the guest without exposing wallet records',async()=>{
  await p.locator('#btn-wallet').click();await p.getByRole('button',{name:'Disconnect',exact:true}).click();await p.waitForFunction(()=>!window.HamsterSave.snapshot().cloud);assert.equal(await p.evaluate(()=>window.HamsterSave.snapshot().profile.name),'Guest');assert.equal(await p.evaluate(()=>window.HamsterSave.snapshot().profile.sqk),0);
 });
 await check('wallet/cloud browser flows produce no JavaScript or unexpected database errors',()=>{assert.deepEqual(errors,[]);assert.deepEqual(transportErrors,[]);assert(requests.some(r=>r.path==='/auth/v1/token'));});
 await c.close();console.log(results.length+' cloud browser checks passed.');
}catch(error){console.error(error.stack);process.exitCode=1;}
finally{await browser?.close();await new Promise(done=>server.close(done));await h.close();await writeFile('test/scratch/major/cloud-browser-results.json',JSON.stringify({results,errors,transportErrors,limitations:['Wallet provider, signatures, Auth and HTTP are fixtures. Database RPCs and rendered game/UI are real. No hosted Supabase or real MetaMask signing is proven.']},null,2));}
