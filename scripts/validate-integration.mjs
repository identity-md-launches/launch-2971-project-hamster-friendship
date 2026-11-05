// Validate the unchanged static export and its real production failure state.
// No fake wallet or simulated database. --relay forwards real HTTP via Node
// when the sandbox browser cannot directly reach the production host.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(resolve('test/scratch/node_modules/playwright/index.mjs')).href);
const root=resolve('dist'),results=[],errors=[],localFailures=[],productionResponses=[],productionFailures=[],consoleErrors=[],unexpectedConsoleErrors=[];
const relay=process.argv.includes('--relay');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;if(!path.startsWith('/squeek/'))throw Error('Not found');
 const file=resolve(root,'.'+path.slice('/squeek'.length)+(path.endsWith('/')?'index.html':''));if(!file.startsWith(root+sep))throw Error('Not found');
 res.setHeader('content-type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));
}catch{res.writeHead(404).end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port,url=origin+'/squeek/';
await mkdir('test/scratch/integration/shots',{recursive:true});
let browser,backend;
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});
 if(relay)await page.route('https://nhtlwcukeyhvkrjveots.supabase.co/**',async route=>{
  const req=route.request(),sent=req.headers();
  try{
   const response=await fetch(req.url(),{method:req.method(),headers:{apikey:sent.apikey,'Content-Type':'application/json'},body:req.postData()||undefined,signal:AbortSignal.timeout(15000)});
   await route.fulfill({status:response.status,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:await response.text()});
  }catch{await route.abort('failed');}
 });
 page.on('pageerror',error=>errors.push(error.message));
 page.on('console',message=>{
  if(message.type()!=='error')return;
  const remote=message.location().url.startsWith('https://nhtlwcukeyhvkrjveots.supabase.co/');
  const entry={text:message.text(),source:remote?'Supabase':message.location().url?'Local page':'Unspecified'};
  consoleErrors.push(entry);if(!remote)unexpectedConsoleErrors.push(entry);
 });
 page.on('response',response=>{const u=new URL(response.url());if(u.host==='nhtlwcukeyhvkrjveots.supabase.co')productionResponses.push({path:u.pathname,status:response.status()});else if(u.origin===origin&&response.status()>=400)localFailures.push(u.pathname);});
 page.on('requestfailed',request=>{const u=new URL(request.url());if(u.host==='nhtlwcukeyhvkrjveots.supabase.co')productionFailures.push({path:u.pathname,error:request.failure()?.errorText});else if(u.origin===origin)localFailures.push(u.pathname+': '+request.failure()?.errorText);});
 await check('configured export checks the actual backend without claiming an authenticated save',async()=>{
  await page.goto(url);await page.evaluate(()=>window.HamsterSave.ready);
  backend=await page.evaluate(()=>{const s=window.HamsterSave.snapshot();return{configured:s.configured,cloud:s.cloud,backendState:s.backendState,backendError:s.backendError};});
  console.log(JSON.stringify(backend));assert.equal(backend.configured,true);assert.equal(backend.cloud,false);assert.equal(backend.backendState,'unavailable');assert(backend.backendError);assert.match(await page.locator('#entry-save').textContent(),/not saved/);
 });
 await check('390-wide first screen shows the game and Start; 320 and 1440 widths do not overflow',async()=>{
  for(const width of [390,320,1440]){
   await page.setViewportSize({width,height:width===1440?900:844});
   await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
   const start=await page.locator('#btn-start').boundingBox();assert(start&&start.y>=0&&start.y+start.height<=844);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:'test/scratch/integration/shots/entry-'+width+'.png'});
  }
  await page.setViewportSize({width:390,height:844});
 });
 await check('profile connection retry ends with a readable failure and an enabled retry',async()=>{
  await page.locator('#btn-menu').click();await page.locator('#btn-profile').click();
  await page.getByRole('button',{name:'Check cloud connection',exact:true}).click();
  await page.waitForFunction(()=>window.HamsterSave.snapshot().backendState!=='checking');
  assert(await page.locator('#profile-retry').isEnabled());assert.equal(await page.locator('#profile-save-state').textContent(),backend.backendError);
  await page.screenshot({path:'test/scratch/integration/shots/profile-unavailable.png'});
  await page.keyboard.press('Escape');assert.equal(await page.locator(':focus').getAttribute('id'),'btn-menu');
 });
 await check('failed real leaderboard request displays no invented records and offers retry',async()=>{
  await page.locator('#btn-menu').click();await page.locator('#btn-leaderboard').click();
  await page.locator('#panel-content .error').waitFor();console.log('Leaderboard: '+await page.locator('#panel-content .error').textContent());
  assert.equal(await page.locator('.leaderboard tbody tr').count(),0);assert(await page.getByRole('button',{name:'Refresh rankings',exact:true}).isEnabled());
  await page.screenshot({path:'test/scratch/integration/shots/leaderboard-unavailable.png'});await page.keyboard.press('Escape');
 });
 await check('wallet sheet is reachable by keyboard and closes back to its connect control',async()=>{
  await page.locator('#btn-wallet').focus();await page.keyboard.press('Enter');await page.locator('#wallet-dialog[open]').waitFor();assert(await page.getByRole('link',{name:'Open in MetaMask',exact:true}).isVisible());await page.keyboard.press('Escape');assert.equal(await page.locator(':focus').getAttribute('id'),'btn-wallet');await page.screenshot({path:'test/scratch/integration/shots/wallet-focus.png'});
 });
 await check('a guest name is clearly temporary and refresh never claims it was saved',async()=>{
  await page.locator('#btn-menu').click();await page.locator('#btn-profile').click();await page.locator('#player-name').fill('Cloud Visitor');await page.getByRole('button',{name:'Save name',exact:true}).click();await page.getByText('Name set for this visit only.',{exact:true}).waitFor();
  await page.reload();await page.evaluate(()=>window.HamsterSave.ready);assert.equal(await page.evaluate(()=>window.HamsterSave.snapshot().profile.name),'Guest');assert.equal(await page.evaluate(()=>window.HamsterSave.snapshot().cloud),false);
 });
 await check('export interactions have no JavaScript errors, unexpected console errors or missing local assets',()=>{assert.deepEqual(errors,[]);assert.deepEqual(localFailures,[]);assert.deepEqual(unexpectedConsoleErrors,[]);});
}catch(error){console.error(error.stack);results.push({name:error.message,passed:false});process.exitCode=1;}
finally{
 await browser?.close();await new Promise(done=>server.close(done));
 await writeFile('test/scratch/integration/browser-live-'+(relay?'relay':'direct')+'.json',JSON.stringify({transport:relay?'Real production HTTP forwarded through Node fetch':'Direct browser networking',results,backend,errors,consoleErrors,unexpectedConsoleErrors,localFailures,productionResponses,productionFailures,limitations:['No authenticated production player read/write or real wallet signature.','Expected production failures are recorded, not counted as successful persistence.']},null,2));
}
