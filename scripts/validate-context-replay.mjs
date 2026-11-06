// Unmodified dist/ at a static-hosting subpath, real button taps, and the real
// replay/SQL path. Auth/session/transport and elapsed run time are local fixtures.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHarness} from '../supabase/tests/major-harness.mjs';
import {replayRpc} from '../supabase/tests/replay-fixture.mjs';
import {engineHash} from '../supabase/functions/_shared/replay.js';

const {chromium}=await import(pathToFileURL(resolve('test/scratch/node_modules/playwright/index.mjs')).href);
const {default:AxeBuilder}=await import(pathToFileURL(resolve('test/scratch/node_modules/@axe-core/playwright/dist/index.mjs')).href);
const out='test/scratch/context',root=resolve('dist'),results=[],errors=[],failures=[],contexts=[];
await mkdir(out+'/shots',{recursive:true});
const h=await createHarness(11);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname;if(!path.startsWith('/squeek/'))throw Error('Not found');
  const file=resolve(root,'.'+path.slice('/squeek'.length)+(path.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+sep))throw Error('Not found');
  res.setHeader('content-type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url='http://127.0.0.1:'+server.address().port+'/squeek/';
let browser;
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
const game=c=>c.page.evaluate(()=>window.__hamster.snapshot());
const saved=c=>c.page.evaluate(()=>window.HamsterSave.snapshot());
const queued=c=>c.page.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes('-run-outbox-')).flatMap(k=>JSON.parse(localStorage.getItem(k)).events));
const advance=(c,ms=100)=>c.page.clock.runFor(ms);
async function dialogue(c){
 for(let i=0;i<10&&(await game(c)).state==='dialogue';i++){await advance(c,140);await c.page.locator('#dlg-next').click();}
 assert.equal((await game(c)).state,'playing');
}
async function client(user,width=390,height=844,touch=true){
 const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});contexts.push(context);
 const page=await context.newPage(),c={context,page,user,net:{offline:false},runs:[]};page.setDefaultTimeout(8000);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{if(response.url().startsWith(url)&&response.status()>=400)failures.push(response.url());});
 await context.addInitScript(({wallet,session})=>{
  const key='hamster-friendship-v2-wallet-session-'+wallet;
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(session));
  if(!localStorage.getItem('hamster-friendship-v2-guest'))localStorage.setItem('hamster-friendship-v2-guest',JSON.stringify({name:'Unverified browser fixture',total_score:99999,sqk:99999}));
  // Explicit provider/session fixtures exercise connection UI without making a
  // fake wallet signature or claiming hosted Auth coverage.
  localStorage.setItem('hamster-wallet-provider','io.metamask');
  window.ethereum={isMetaMask:true,on(){},removeListener(){},async request({method}){
   if(method==='eth_accounts'||method==='eth_requestAccounts')return [wallet];
   if(method==='eth_chainId')return '0x1';if(method==='wallet_switchEthereumChain')return null;
   throw Error('Signing is deliberately unavailable in this provider fixture');
  }};
 },{wallet:user.wallet,session:{access_token:user.id,refresh_token:user.id,expires_at:Date.now()/1000+3600}});
 await context.route('https://nhtlwcukeyhvkrjveots.supabase.co/**',async route=>{
  if(c.net.offline){await route.abort('internetdisconnected');return;}
  const req=route.request(),name=new URL(req.url()).pathname.split('/').pop(),body=req.postDataJSON()||{};
  try{
   let data;
   if(name==='hf-replay'&&req.method()==='GET')data={validation:'replay-1',engineHash,engineVersion:2,supportedEngineVersions:[1,2]};
   else if(name==='hf-replay')data=await replayRpc(h,user,body.p_run,body.p_events);
   else data=await h.rpc(req.headers().authorization?user:null,name,body);
   if(name==='hf_start_run_v6'){
    c.runs.push(data.id);
    await h.admin("update hf_private.runs set started_at=clock_timestamp()-interval '2 hours' where id=$1",[data.id]);
   }
   await route.fulfill({json:data});
  }catch(error){failures.push(error.message);await route.fulfill({status:400,json:{message:error.message}});}
 });
 await page.clock.install();await page.clock.pauseAt(new Date());await page.goto(url);await advance(c);
 await page.evaluate(wallet=>window.HamsterSave.setWallet(wallet),user.wallet);
 await page.waitForFunction(()=>window.HamsterSave.snapshot().cloud);
 assert.equal((await saved(c)).cloud,true);return c;
}
async function start(c){
 await c.page.locator('#btn-start').click();
 await c.page.waitForFunction(()=>!document.getElementById('btn-start').disabled,null,{polling:20});await advance(c);
 if(await c.page.locator('#btn-portrait').isVisible()){await c.page.locator('#btn-portrait').click();await advance(c);}
 await dialogue(c);
 await c.page.keyboard.down('ArrowRight');await advance(c,250);await c.page.keyboard.up('ArrowRight');await advance(c,20);
 assert((await game(c)).x>=110&&(await game(c)).x<=130);
}
try{
 browser=await chromium.launch({headless:true});
 for(const [width,height]of (process.argv.includes('--focused')?[]:[[390,844],[320,568],[768,1024],[568,320],[844,390],[1024,768]])){
  const user=await h.identity();await h.rpc(user,'hf_wallet_profile');const c=await client(user,width,height);
  await check(`${width}×${height}: product and Start fit the first screen`,async()=>{
   const b=await c.page.locator('#btn-start').boundingBox();assert(b.y>=0&&b.y+b.height<=height);
   assert.equal(await c.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(width===390)await c.page.screenshot({path:out+'/shots/entry-390.png'});
  });
  await check(`${width}×${height}: tapping Open records its input and preserves the offline reward`,async()=>{
   await start(c);const button=c.page.getByRole('button',{name:'Open',exact:true});await button.waitFor({state:'visible'});
   const b=await button.boundingBox();assert(b.width>=44&&b.height>=44);assert(b.x>=0&&b.x+b.width<=width&&b.y>=0&&b.y+b.height<=height);
   if(width===390)await c.page.screenshot({path:out+'/shots/open-390.png'});
   c.net.offline=true;await button.tap();await advance(c,50);
   assert.equal((await game(c)).score,2,JSON.stringify(await game(c)));assert.equal((await game(c)).state,'dialogue');
   await dialogue(c);await advance(c,1050);await c.page.evaluate(()=>window.HamsterSave.flush());
   const events=await queued(c),basket=events.find(e=>e.source==='basket');
   assert(basket?.inputs.some(input=>input.pressed&16),'button did not record interact');
   assert(events.some(e=>e.kind==='checkpoint'),'natural tick checkpoint missing');
   assert((await saved(c)).pendingEvents>=2);assert.equal((await h.rpc(user,'hf_wallet_profile')).total_score,0);
  });
  await check(`${width}×${height}: retry credits 2 points, clears the queue and allows Restart chapter`,async()=>{
   const oldRun=c.runs[0],events=await queued(c);c.net.offline=false;
   await c.page.evaluate(()=>window.HamsterSave.retry());
   assert.equal((await saved(c)).profile.total_score,2);assert.equal((await saved(c)).pendingEvents,0);assert.equal((await saved(c)).runConflict,false);
   assert.equal((await h.rpc(user,'hf_run_state',{p_run:oldRun})).ack,events.at(-1).seq);
   await c.page.evaluate(()=>window.HamsterSave.retry());assert.equal((await saved(c)).profile.total_score,2);
   await c.page.locator('#btn-menu').click();await c.page.keyboard.press('Escape');
   assert.equal((await game(c)).state,'paused');await c.page.locator('#btn-restart').click();
   await c.page.waitForFunction(()=>!document.getElementById('btn-restart').disabled,null,{polling:20});
   await dialogue(c);
   assert.equal(c.runs.length,2);assert.notEqual(c.runs[1],oldRun);assert.equal((await saved(c)).pendingEvents,0);
   assert.equal(await c.page.locator('#game-error').textContent(),'');
   if(width===390){
    const fresh=await client(user);assert.equal((await saved(fresh)).profile.total_score,2);
    await fresh.page.locator('#btn-menu').click();await fresh.page.locator('#btn-profile').click();
    await fresh.page.screenshot({path:out+'/shots/recovered-profile-390.png'});await fresh.context.close();
   }
  });
  await check(`${width}×${height}: clean Profile retains verified wallet, personal best and working cloud name saves without importing or deleting browser data`,async()=>{
   const legacy=await c.page.evaluate(()=>localStorage.getItem('hamster-friendship-v2-guest'));
   await c.page.locator('#btn-menu').click();await c.page.locator('#btn-profile').click();
   assert.equal(await c.page.locator('#profile-total_score').textContent(),'2');
   assert.equal(await c.page.locator('#player-dialog .wallet-address').textContent(),user.wallet);
   assert(!/Retry cloud save|An older browser save|Download older browser save/.test(await c.page.locator('body').textContent()));
   assert.equal(await c.page.locator('#profile-retry').count(),0);
   await c.page.locator('#player-name').fill('Cloud Keeper');await c.page.getByRole('button',{name:'Save name',exact:true}).click();
   await c.page.getByText('Name saved to your cloud profile.',{exact:true}).waitFor();assert.equal((await h.rpc(user,'hf_profile')).name,'Cloud Keeper');
   assert.equal(await c.page.evaluate(()=>localStorage.getItem('hamster-friendship-v2-guest')),legacy);
   assert.equal((await h.rpc(user,'hf_profile')).total_score,2);
   assert.equal(await c.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(width===390||width===1440)await c.page.screenshot({path:out+'/shots/clean-profile-'+width+'.png'});
   await c.page.clock.resume();const report=await new AxeBuilder({page:c.page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();assert.deepEqual(report.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
   await c.page.keyboard.press('Escape');await c.page.waitForFunction(()=>document.activeElement?.id==='btn-menu');
  });
  await c.context.close();
 }
 await check('native multi-touch movement and attack replay through engine 2, settle rewards and restore the best after refresh',async()=>{
  const user=await h.identity();await h.rpc(user,'hf_wallet_profile');const c=await client(user,844,390,true);
  await c.page.locator('#btn-start').tap();await c.page.waitForFunction(()=>!document.getElementById('btn-start').disabled);await advance(c,100);await dialogue(c);
  assert(await c.page.locator('#touch-movement').isVisible(),'First drag must work immediately after dialogue, before another animation frame');
  await c.page.evaluate(()=>{window.__touchEvents=[];for(const type of ['pointerdown','pointerup','pointercancel','gotpointercapture','lostpointercapture'])window.addEventListener(type,e=>window.__touchEvents.push({type,id:e.pointerId,target:e.target.id||e.target.className}),true);});
  const cdp=await c.context.newCDPSession(c.page),points=[];
  const send=(type,contacts=points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:contacts.map(p=>({...p,radiusX:2,radiusY:2,force:1}))});
  points.push({id:1,x:20,y:260});await send('touchStart');points[0].x=280;await send('touchMove');await advance(c,300);
  const attack=await c.page.locator('.attack-btn').boundingBox();points.push({id:2,x:attack.x+attack.width/2,y:attack.y+attack.height/2});await send('touchStart');await advance(c,50);
  assert((await game(c)).attacks>0);const releasedAction=points.splice(1,1);await send('touchEnd',releasedAction);await advance(c,1400);
  const moving=await game(c);assert(moving.x>200,JSON.stringify({state:moving.state,x:moving.x,frame:moving.frame,trace:await c.page.evaluate(()=>window.__touchEvents),controls:(await queued(c)).flatMap(e=>e.inputs||[]).map(i=>({frame:i.frame,ticks:i.ticks,touch:i.touch,x:i.x}))}));assert(moving.score>0);await c.page.screenshot({path:out+'/shots/cloud-direct-touch-844.png'});
  points.splice(0,1);await send('touchEnd');await advance(c,200);await cdp.detach();
  await c.page.evaluate(()=>window.HamsterSave.retry());const state=await saved(c);assert.equal(state.pendingEvents,0);assert.equal(state.runConflict,false);
  assert.equal(state.profile.total_score,(await game(c)).score);
  assert.equal((await h.rpc(user,'hf_replay_context',{p_run:c.runs[0]})).engineVersion,2);
  await c.page.reload();await advance(c,100);await c.page.waitForFunction(()=>window.HamsterSave.snapshot().cloud);assert.equal((await saved(c)).profile.total_score,state.profile.total_score);
  await c.context.close();
 });
 await check('leaderboard refresh displays backend personal bests after lower and higher administrative run fixtures',async()=>{
  const user=await h.identity();await h.rpc(user,'hf_wallet_profile');await h.rpc(user,'hf_profile',{p_name:'Ranking fixture'});
  async function run(score){const r=await h.rpc(user,'hf_start_run_v6',{p_map:1,p_engine:2});await h.admin("update hf_private.runs set score=$2,status='dead' where id=$1",[r.id,score]);}
  await run(5);await run(8);await run(6);
  const c=await client(user,390,844,true);await c.page.locator('#btn-menu').click();await c.page.locator('#btn-leaderboard').click();
  const entry=c.page.locator('.leaderboard tbody tr').filter({hasText:'Ranking fixture'});await entry.waitFor();assert.equal(await entry.locator('td').nth(2).textContent(),'8');
  await run(4);await c.page.getByRole('button',{name:'Refresh rankings'}).click();await c.page.waitForFunction(()=>!document.querySelector('#panel-content [aria-busy]'));assert.equal(await entry.locator('td').nth(2).textContent(),'8');
  await run(10);await c.page.getByRole('button',{name:'Refresh rankings'}).click();await c.page.waitForFunction(()=>[...document.querySelectorAll('.leaderboard tbody tr')].some(r=>r.textContent.includes('Ranking fixture')&&r.children[2].textContent==='10'));
  assert.equal(await entry.locator('td').nth(2).textContent(),'10');assert.match(await c.page.locator('#panel-content').textContent(),/highest single-run score/);
  await c.page.screenshot({path:out+'/shots/personal-best-board-390.png'});await c.context.close();
 });
 await check('desktop E opens the basket through the same replay path; wallet Sync progress, disconnect, reconnect and page refresh retain the best',async()=>{
  const user=await h.identity();await h.rpc(user,'hf_wallet_profile');const c=await client(user,1440,900,false);await start(c);
  assert(await c.page.locator('#context-interact').isHidden());await c.page.keyboard.press('e');await advance(c,20);await dialogue(c);
  await c.page.evaluate(()=>window.HamsterSave.retry());assert.equal((await saved(c)).profile.total_score,2);assert.equal((await saved(c)).pendingEvents,0);
  await c.page.locator('#btn-wallet').click();await c.page.getByRole('button',{name:'Sync progress',exact:true}).click();
  await c.page.waitForFunction(()=>document.getElementById('wallet-status').textContent==='Wallet profile saved.');
  await c.page.getByRole('button',{name:'Disconnect',exact:true}).click();await c.page.waitForFunction(()=>!window.HamsterSave.snapshot().cloud);
  await c.page.locator('#wallet-options').getByRole('button',{name:'Connect MetaMask',exact:true}).click();await c.page.waitForFunction(()=>window.HamsterSave.snapshot().cloud);
  assert.equal((await saved(c)).profile.total_score,2);await c.page.reload();await advance(c,100);await c.page.waitForFunction(()=>window.HamsterSave.snapshot().cloud);assert.equal((await saved(c)).profile.total_score,2);
  await c.page.locator('#btn-menu').click();await c.page.locator('#btn-profile').click();
  await c.page.evaluate(()=>document.documentElement.style.fontSize='200%');
  for(const width of [390,1440]){
   await c.page.setViewportSize({width,height:900});await advance(c,100);assert.equal(await c.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await c.page.locator('#player-dialog .wallet-address').evaluate(n=>n.scrollIntoView({block:'start',behavior:'instant'}));
   const address=await c.page.locator('#player-dialog .wallet-address').boundingBox(),header=await c.page.locator('#player-dialog .panel-header').boundingBox();assert(address.x>=0&&address.x+address.width<=width);assert(address.y>=header.y+header.height);
   if(width===390)await c.page.screenshot({path:out+'/shots/clean-profile-200percent-390.png'});
  }
  await c.context.close();
 });
 await check('no JavaScript, local asset or replay/SQL failures',()=>{assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);});
}catch(error){console.error(error.stack);process.exitCode=1;}
finally{
 for(const context of contexts)await context.close();await browser?.close();await new Promise(done=>server.close(done));await h.close();
 await writeFile(out+'/browser-results.json',JSON.stringify({results,errors,failures,limitations:[
  'Chromium touch emulation, fixture Auth/session/transport and accelerated elapsed SQL clock. Not physical phones, real signatures or production writes.',
  'Unchanged export and real validateReplay/hf_replay_commit; no position, reward, loot or encounter edits.',
  'Browser time is controlled for deterministic input; SQL time allowance is advanced to avoid waiting in real time.'
 ]},null,2)+'\n');
}
console.log(results.length+' context replay browser checks passed.');
