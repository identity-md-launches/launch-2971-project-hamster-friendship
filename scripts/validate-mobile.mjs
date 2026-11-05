// Chromium device emulation and deliberate API failures, NOT physical devices.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
const pw=await import(pathToFileURL(resolve(process.argv[2]||'/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs')).href);
const root=resolve('dist'),out=resolve('test/scratch/mobile');await mkdir(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;if(!p.startsWith('/preview/'))return res.writeHead(404).end();const file=resolve(root,decodeURIComponent(p.slice(9))||'index.html');if(!file.startsWith(root+sep))return res.writeHead(403).end();res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream'}).end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+server.address().port+'/preview/';
const results=[],errors=[];let browser,context,page,persona;
async function check(name,fn){try{await fn();results.push({persona,name,passed:true});console.log('ok',persona,name);}catch(e){await page.screenshot({path:resolve(out,'failure.png')});throw new Error(persona+': '+name+': '+e.stack);}}
const state=()=>page.evaluate(()=>window.__hamster.snapshot());
async function resize(width,height){await page.setViewportSize({width,height});await page.waitForFunction(({width,height})=>Math.abs(document.getElementById('stage').clientWidth-width)<2&&Math.abs(document.getElementById('stage').clientHeight-height)<2,{width,height});}
async function intro(){for(let i=0;i<12&&(await state()).state==='dialogue';i++){await page.locator('#dlg-next').click();await page.waitForTimeout(135);}await page.waitForFunction(()=>window.__hamster.snapshot().state==='playing');}
try{
 browser=await pw.chromium.launch({headless:true});
 for(const spec of[
   {name:'iPhone Safari emulation',device:'iPhone 13',portrait:[390,844],landscape:[844,390],fullscreen:false},
   {name:'Android Chrome emulation',device:'Pixel 7',portrait:[393,851],landscape:[851,393],fullscreen:true},
   {name:'MetaMask Mobile emulation',device:'Pixel 7',portrait:[393,851],landscape:[851,393],fullscreen:true}
 ]){
   persona=spec.name;
   context=await browser.newContext({...pw.devices[spec.device],viewport:{width:spec.portrait[0],height:spec.portrait[1]}});
   await context.addInitScript(({fullscreen})=>{
     window.mobileFixture={calls:[],locks:[],listeners:{}};const f=window.mobileFixture;
     Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async direction=>{f.locks.push(direction);throw new DOMException('Deliberate unsupported lock','NotSupportedError');}});
     Object.defineProperty(Element.prototype,'requestFullscreen',{configurable:true,value:fullscreen?async()=>{throw new DOMException('Deliberate denied fullscreen','NotAllowedError');}:undefined});
     const provider={isMetaMask:true,async request({method}){f.calls.push(method);if(method==='eth_accounts'||method==='eth_requestAccounts')return['0x'+'a'.repeat(40)];if(method==='eth_chainId')return'0x1';throw new Error('Unnecessary wallet action '+method);},on(name,fn){f.listeners[name]=fn;},removeListener(name){delete f.listeners[name];}};
     window.addEventListener('eip6963:requestProvider',()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{rdns:'io.metamask',name:'MetaMask'},provider}})));
   },{fullscreen:spec.fullscreen});
   page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push({persona,message:e.message}));await page.goto(base);
   await check('portrait entry exposes Start adventure and the existing scene',async()=>{const b=await page.locator('#btn-start').boundingBox();assert(b.y+b.height<spec.portrait[1]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),spec.portrait[0]);assert(await page.locator('#rotate-overlay').isHidden());});
   await check('connecting requests landscape without a signature, approval or transfer',async()=>{
     await page.locator('#btn-menu').click();await page.locator('#btn-wallet').click();await page.getByRole('button',{name:'Connect MetaMask',exact:true}).click();await page.waitForFunction(()=>window.HamsterWallet.snapshot().connected);
     const f=await page.evaluate(()=>window.mobileFixture);assert(f.locks.includes('landscape'));assert(f.calls.every(m=>['eth_accounts','eth_requestAccounts','eth_chainId','wallet_switchEthereumChain'].includes(m)));assert.equal((await page.evaluate(()=>window.HamsterSave.snapshot())).cloud,false);assert.equal(await page.getByRole('button',{name:'Sign in to save',exact:true}).count(),0);await page.keyboard.press('Escape');
   });
   await check('unsupported orientation lock shows a rotate overlay and freezes the same session',async()=>{
     await page.locator('#btn-start').click();await page.waitForSelector('#rotate-overlay:visible');assert.equal((await state()).state,'paused');const before=await state();await page.waitForTimeout(100);assert.equal((await state()).frame,before.frame);await page.screenshot({path:resolve(out,spec.device+'-rotate.png')});
   });
   await check('portrait to landscape preserves wallet, map, enemies and progress',async()=>{
     const before=await state(),wallet=await page.evaluate(()=>window.HamsterWallet.snapshot().address);await resize(...spec.landscape);await page.waitForSelector('#rotate-overlay',{state:'hidden'});assert.equal((await state()).state,'dialogue');const after=await state();assert.equal(after.map,before.map);assert.equal(after.season,before.season);assert.deepEqual(after.enemyTypes,before.enemyTypes);assert.equal(await page.evaluate(()=>window.HamsterWallet.snapshot().address),wallet);await intro();
   });
   await check('toolbar-sized height changes resize the canvas without restarting or stretching',async()=>{
     const before=await state();await resize(spec.landscape[0],300);const after=await state();assert(after.frame>=before.frame);assert.equal(after.map,before.map);assert.equal(after.score,before.score);
     assert.equal(await page.locator('#game').evaluate(c=>c.height),192);assert.equal(await page.locator('#game').evaluate(c=>getComputedStyle(c).objectFit),'contain');assert.equal(await page.locator('#game').evaluate(c=>c.getContext('2d').imageSmoothingEnabled),false);await resize(...spec.landscape);
   });
   await check('repeated attack and jump touches remain responsive without double-tap zoom',async()=>{
     const before=await state(),scale=await page.evaluate(()=>visualViewport.scale);
     for(let i=0;i<4;i++){await page.locator('[data-action="throw"]').tap();await page.waitForTimeout(300);}
     assert((await state()).attacks>=before.attacks+4);const ground=(await state()).y;await page.locator('[data-action="jump"]').dispatchEvent('pointerdown',{pointerId:20,pointerType:'touch'});await page.waitForTimeout(80);assert((await state()).y<ground);await page.locator('[data-action="jump"]').dispatchEvent('pointerup',{pointerId:20,pointerType:'touch'});assert.equal(await page.evaluate(()=>visualViewport.scale),scale);
     assert.equal(await page.locator('#btn-menu').evaluate(e=>getComputedStyle(e).touchAction),'manipulation');assert.equal(await page.locator('#joystick').evaluate(e=>getComputedStyle(e).touchAction),'none');
   });
   await check('pinch magnification keeps stage dimensions and is not globally disabled',async()=>{
     const before=await page.locator('#stage').boundingBox();const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:2});await page.waitForFunction(()=>visualViewport.scale>1.9);await page.waitForTimeout(80);const after=await page.locator('#stage').boundingBox();assert(Math.abs(before.width-after.width)<2);assert(Math.abs(before.height-after.height)<2);
     assert(!/user-scalable\s*=\s*(no|0)|maximum-scale/.test(await page.locator('meta[name="viewport"]').getAttribute('content')));assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).touchAction),'auto');await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await cdp.detach();
   });
   await check('rotation back pauses safely and portrait opt-out resumes the current run',async()=>{
     const before=await state();await resize(...spec.portrait);await page.waitForSelector('#rotate-overlay:visible');assert.equal((await state()).state,'paused');assert.equal((await state()).map,before.map);const paused=await state();await page.locator('#btn-portrait').click();await page.waitForFunction(()=>window.__hamster.snapshot().state==='playing');assert((await state()).frame>=paused.frame);assert(await page.locator('#rotate-overlay').isHidden());
   });
   await check('fullscreen denial or absence leaves manual rotation and Home Screen guidance usable',async()=>{
     await resize(...spec.landscape);
     if(spec.fullscreen){await page.locator('#btn-fullscreen').click();await page.waitForSelector('#viewport-notice:visible');assert((await page.locator('#viewport-notice').textContent()).includes('unavailable'));await page.locator('#close-viewport-notice').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'btn-fullscreen');await resize(...spec.portrait);await page.locator('#btn-menu').click();await page.locator('#btn-fullscreen-menu').click();await page.waitForSelector('#viewport-notice:visible');await page.locator('#close-viewport-notice').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'btn-menu');await resize(...spec.landscape);}
     else assert(await page.locator('#btn-fullscreen').isHidden());
     await page.locator('#btn-menu').click();assert((await page.locator('#immersive-help').textContent()).includes('Home Screen'));await page.keyboard.press('Escape');assert((await page.evaluate(()=>window.HamsterWallet.snapshot())).connected);
   });
   await check('reload restores wallet connection using eth_accounts with no fresh signature',async()=>{
     await page.reload();await page.waitForFunction(()=>window.HamsterWallet.snapshot().connected);const methods=await page.evaluate(()=>window.mobileFixture.calls);assert(methods.includes('eth_accounts'));assert(!methods.includes('eth_requestAccounts'));assert(!methods.includes('personal_sign'));
   });
   await check('standalone manifest and original hamster icons load under a static subpath',async()=>{
     const data=await page.evaluate(async()=>{const url=document.querySelector('link[rel="manifest"]').href;const r=await fetch(url);return{type:r.headers.get('content-type'),manifest:await r.json(),url};});assert(data.type.includes('manifest'));assert.equal(data.manifest.name,'squeek.hamster');assert.equal(data.manifest.display,'standalone');assert.equal(data.manifest.orientation,'landscape');assert.equal(data.manifest.start_url,'./');for(const icon of data.manifest.icons){assert(icon.src.startsWith('./'));const response=await page.request.get(new URL(icon.src,data.url).href);assert(response.ok());}
   });
   await context.close();
 }
 assert.deepEqual(errors,[]);
 console.log(`${results.length} emulated mobile checks passed.`);
}catch(error){console.error(error.stack);process.exitCode=1;}finally{if(browser)await browser.close();await new Promise(done=>server.close(done));await writeFile(resolve(out,'results.json'),JSON.stringify({results,errors,limitations:'Chromium emulation with fixture EIP-1193 providers and deliberate API failures. No physical iPhone, Android, MetaMask app, real signature or hosted Supabase was tested.'},null,2));}
