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
const out='test/scratch/context',root=resolve('dist'),results=[],errors=[],failures=[],contexts=[];
await mkdir(out+'/shots',{recursive:true});
const h=await createHarness(10);
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
 },{wallet:user.wallet,session:{access_token:user.id,refresh_token:user.id,expires_at:Date.now()/1000+3600}});
 await context.route('https://nhtlwcukeyhvkrjveots.supabase.co/**',async route=>{
  if(c.net.offline){await route.abort('internetdisconnected');return;}
  const req=route.request(),name=new URL(req.url()).pathname.split('/').pop(),body=req.postDataJSON()||{};
  try{
   let data;
   if(name==='hf-replay'&&req.method()==='GET')data={validation:'replay-1',engineHash};
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
 for(const [width,height]of [[390,844],[320,568],[768,1024],[568,320],[844,390],[1024,768]]){
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
   c.net.offline=true;await button.tap();await advance(c,20);
   assert.equal((await game(c)).score,2);assert.equal((await game(c)).state,'dialogue');
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
  await c.context.close();
 }
 await check('desktop E opens the basket through the same replay path',async()=>{
  const user=await h.identity();await h.rpc(user,'hf_wallet_profile');const c=await client(user,1440,900,false);await start(c);
  assert(await c.page.locator('#context-interact').isHidden());await c.page.keyboard.press('e');await advance(c,20);await dialogue(c);
  await c.page.evaluate(()=>window.HamsterSave.retry());assert.equal((await saved(c)).profile.total_score,2);assert.equal((await saved(c)).pendingEvents,0);
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
