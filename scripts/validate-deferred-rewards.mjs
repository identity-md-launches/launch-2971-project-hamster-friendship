// Built website + real disposable PostgreSQL. Wallet/Auth and HTTP are local
// fixtures; run/refill timestamps are accelerated explicitly for this UI test.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHarness} from '../supabase/tests/major-harness.mjs';
import {walk,backdateRun,refill,session,prefix} from '../supabase/tests/reward-fixture.mjs';
const pw=await import(pathToFileURL(resolve('test/scratch/node_modules/playwright/index.mjs')).href);
const {default:AxeBuilder}=await import(pathToFileURL(resolve('test/scratch/node_modules/@axe-core/playwright/dist/index.mjs')).href);
const h=await createHarness(9),root=resolve('dist'),results=[],errors=[],failures=[],limitations=[];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;if(!path.startsWith('/squeek/'))throw Error('not found');
 const file=resolve(root,'.'+path.slice('/squeek'.length)+(path.endsWith('/')?'index.html':''));if(!file.startsWith(root+sep))throw Error('not found');
 res.setHeader('content-type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));
}catch{res.writeHead(404).end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const url='http://127.0.0.1:'+server.address().port+'/squeek/';
const shots='test/scratch/deferred/shots';await mkdir(shots,{recursive:true});
let browser;const contexts=[];
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
async function client(user){
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),net={offline:false,loseReply:false};contexts.push(context);
 await page.clock.install();await page.clock.pauseAt(new Date());
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(url)&&r.status()>=400)failures.push(r.url());});
 await context.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,value);},{key:prefix+'-wallet-session-'+user.wallet,value:session(user)});
 await context.route('**/config.js',r=>r.fulfill({contentType:'text/javascript',body:"window.HAMSTER_CONFIG={supabaseUrl:'https://sql-fixture.invalid',supabasePublishableKey:'fixture-public'};"}));
 await context.route('https://sql-fixture.invalid/**',async route=>{
  if(net.offline){await route.abort('internetdisconnected');return;}
  const req=route.request(),name=new URL(req.url()).pathname.split('/').pop();
  try{
   const data=await h.rpc(req.headers().authorization?user:null,name,req.postDataJSON()||{});
   if(net.loseReply&&name==='hf_progress'){net.loseReply=false;await route.abort('failed');return;}
   await route.fulfill({json:data});
  }catch(error){failures.push(error.message);await route.fulfill({status:400,json:{message:error.message}});}
 });
 await page.goto(url);await page.evaluate(wallet=>window.HamsterSave.setWallet(wallet),user.wallet);return{context,page,net};
}
const snapshot=c=>c.page.evaluate(()=>window.HamsterSave.snapshot());
const queues=c=>c.page.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes('-run-outbox-')).map(k=>JSON.parse(localStorage.getItem(k))));
async function profilePanel(c){await c.page.locator('#btn-menu').click();await c.page.locator('#btn-profile').click();}
try{
 browser=await pw.chromium.launch({headless:true,...process.env.SQUEEK_CHROMIUM_EXECUTABLE?{executablePath:process.env.SQUEEK_CHROMIUM_EXECUTABLE}:{}});
 const user=await h.identity();await h.rpc(user,'hf_wallet_profile');const clients=[];
 await check('four 390-wide browsers keep 46 offline events in each independent durable store',async()=>{
  for(let i=0;i<4;i++){
   const c=await client(user);await c.page.evaluate(()=>window.HamsterSave.beginMap(1));c.net.offline=true;
   await c.page.evaluate(async events=>{for(const e of events)window.HamsterSave.record(e.kind,e.source?{source:e.source}:{},e.frame);await window.HamsterSave.flush();},walk());
   assert.equal((await snapshot(c)).pendingEvents,46);const q=await queues(c);assert.equal(q.length,1);await backdateRun(h,q[0].id);clients.push(c);
  }
 });
 await check('reconnect saves 150 points and retains two unpaid batches with truthful pending status',async()=>{
  for(const c of clients){c.net.offline=false;await c.page.evaluate(()=>window.HamsterSave.retry());}
  assert.equal((await h.rpc(user,'hf_wallet_profile')).total_score,150);
  for(const c of clients.slice(2)){assert.equal((await snapshot(c)).pendingEvents,46);assert.equal((await queues(c)).length,1);assert.match((await snapshot(c)).status,/Save pending/);}
  await profilePanel(clients[2]);await clients[2].page.getByText(/Lifetime Score shows credited points/).waitFor();
  assert.match(await clients[2].page.locator('#save-summary').textContent(),/Cloud save pending/);
  await clients[2].page.screenshot({path:shots+'/pending-profile-390.png'});
 });
 await check('pending Profile remains usable at 320/390/1440 widths and 200% root text',async()=>{
  const c=clients[2];
  for(const width of [320,390,1440]){await c.page.setViewportSize({width,height:844});await c.page.clock.runFor(100);assert.equal(await c.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const b=await c.page.locator('#profile-save-state').boundingBox();assert(b.width<=width);assert(await c.page.locator('#profile-retry').isVisible());}
  await c.page.setViewportSize({width:390,height:844});await c.page.evaluate(()=>document.documentElement.style.fontSize='200%');await c.page.clock.runFor(100);
  assert.equal(await c.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await c.page.locator('#profile-retry').scrollIntoViewIfNeeded();const box=await c.page.locator('#profile-retry').boundingBox();assert(box.x>=0&&box.x+box.width<=390);
  await c.page.screenshot({path:shots+'/pending-profile-390-large-text.png'});await c.page.evaluate(()=>document.documentElement.style.fontSize='');
 });
 await check('pending status and retry controls pass automated WCAG A/AA checks',async()=>{
  const c=clients[2];await c.page.clock.resume();
  const audit=await new AxeBuilder({page:c.page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  await c.page.clock.pauseAt(await c.page.evaluate(()=>Date.now()));
  assert.deepEqual(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
 });
 await check('refresh keeps the unpaid queue; fresh device has server-held pending rewards without local events',async()=>{
  const c=clients[2];await c.page.reload();await c.page.evaluate(wallet=>window.HamsterSave.setWallet(wallet),user.wallet);
  assert.equal((await snapshot(c)).pendingEvents,46);assert.equal((await snapshot(c)).pendingRewards,(await h.rpc(user,'hf_wallet_profile')).pending_rewards);assert.equal((await queues(c)).length,1);
  const fresh=await client(user);clients.push(fresh);assert.equal((await snapshot(fresh)).pendingEvents,0);assert.equal((await snapshot(fresh)).pendingRewards,(await h.rpc(user,'hf_wallet_profile')).pending_rewards);assert.match((await snapshot(fresh)).status,/Save pending/);
  await profilePanel(fresh);await fresh.page.screenshot({path:shots+'/fresh-device-pending-390.png'});assert.match(await fresh.page.locator('#save-summary').textContent(),/Cloud save pending/);
 });
 await check('partial refill and lost response preserve the remaining batch and exact paid total',async()=>{
  const before=await h.rpc(user,'hf_wallet_profile');await refill(h,user,20);clients[3].net.loseReply=true;await clients[3].page.evaluate(()=>window.HamsterSave.retry());
  const p=await h.rpc(user,'hf_wallet_profile');assert.equal(p.total_score,before.total_score+20);assert.equal(p.pending_rewards,280-p.total_score);assert.equal((await snapshot(clients[3])).pendingEvents,46);assert.equal((await queues(clients[3])).length,1);
 });
 await check('automatic retry settles all 280 points; original queues retire only after complete payment',async()=>{
  await refill(h,user,150);await clients[4].page.clock.runFor(4000);await clients[4].page.waitForFunction(()=>window.HamsterSave.snapshot().pendingRewards===0);
  for(const c of clients.slice(0,4))await c.page.evaluate(()=>window.HamsterSave.retry());
  for(const c of clients){const s=await snapshot(c);assert.equal(s.profile.total_score,280);assert.equal(s.profile.produce_points,280);assert.equal(s.pendingEvents,0);assert.equal(s.pendingRewards,0);assert.equal((await queues(c)).length,0);assert.equal(s.status,'Wallet profile saved.');}
  await clients[4].page.screenshot({path:shots+'/settled-profile-390.png'});
 });
 await check('wallet reconnect, page reload and actual SQL leaderboard preserve 280 without duplication',async()=>{
  const c=clients[4];await c.page.keyboard.press('Escape');await c.page.evaluate(async wallet=>{await window.HamsterSave.setWallet('');await window.HamsterSave.setWallet(wallet);},user.wallet);assert.equal((await snapshot(c)).profile.total_score,280);
  await c.page.reload();await c.page.evaluate(wallet=>window.HamsterSave.setWallet(wallet),user.wallet);assert.equal((await snapshot(c)).profile.total_score,280);
  await c.page.locator('#btn-menu').click();await c.page.locator('#btn-leaderboard').click();await c.page.locator('.leaderboard tbody tr').waitFor();assert.equal(await c.page.locator('.leaderboard tbody tr td:nth-child(3)').textContent(),'280');
  assert.equal((await h.rpc(null,'hf_lifetime_top100')).rows[0].score,280);await c.page.screenshot({path:shots+'/leaderboard-280-390.png'});
 });
 await check('no JavaScript or unexpected local/SQL resource failures in the revised flow',()=>{assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);});
 try{const wk=await pw.webkit.launch({headless:true});await wk.close();limitations.push('WebKit launches; these SQL browser flows were not exercised in WebKit.');}catch{limitations.push('WebKit could not launch in this environment; no Safari result claimed.');}
 console.log(results.length+' deferred reward browser checks passed.');
}catch(error){console.error(error.stack);process.exitCode=1;limitations.push('Interrupted: '+error.message);}
finally{
 for(const c of contexts)await c.close();await browser?.close();await new Promise(done=>server.close(done));await h.close();
 await writeFile('test/scratch/deferred/browser-results.json',JSON.stringify({results,errors,failures,limitations:[...limitations,'Auth/signature/session and HTTP are explicit fixtures. SQL and the production save/UI files run unchanged.','Run start/refill times accelerated for UI edge cases; see separate real-clock regression.','No Supabase production write, real wallet signature or physical device test.']},null,2));
}
