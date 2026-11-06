// Production export at a gateway-style subpath. Chromium touch emulation; no
// fake successful backend. SQL/Auth acceptance is in the separate save suites.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium,webkit}=await import(pathToFileURL(resolve('test/scratch/node_modules/playwright/index.mjs')).href);
const {default:AxeBuilder}=await import(pathToFileURL(resolve('test/scratch/node_modules/@axe-core/playwright/dist/index.mjs')).href);
const root=resolve('dist'),out=resolve('test/scratch/touch'),results=[],errors=[],localFailures=[],limitations=[];
await mkdir(out+'/shots',{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(!path.startsWith('/squeek/'))throw Error('Not found');const file=resolve(root,'.'+path.slice('/squeek'.length)+(path.endsWith('/')?'index.html':''));if(!file.startsWith(root+sep))throw Error('Not found');res.setHeader('content-type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const url='http://127.0.0.1:'+server.address().port+'/squeek/';
let browser,page,context,persona='';
async function check(name,fn){await fn();results.push({persona,name,passed:true});console.log('ok',persona,name);}
async function advance(ms=100){await page.clock.runFor(ms);}
const snapshot=()=>page.evaluate(()=>window.__hamster.snapshot());
async function start(){await page.locator('#btn-start').click();await advance();if(await page.locator('#btn-portrait').isVisible()){await page.locator('#btn-portrait').click();await advance();}for(let i=0;i<10&&(await snapshot()).state==='dialogue';i++){await page.locator('#dlg-next').click();await advance(140);}assert.equal((await snapshot()).state,'playing');}
async function init(width,height,touch=true){
 context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});page=await context.newPage();page.setDefaultTimeout(6000);
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(url)&&r.status()>=400)localFailures.push(r.url());});
 await context.route('https://nhtlwcukeyhvkrjveots.supabase.co/**',r=>r.fulfill({status:503,json:{message:'Deliberate unavailable network fixture for control isolation'}}));
 await page.clock.install();await page.clock.pauseAt(new Date());await page.goto(url);await advance();
}
async function synthetic(type,x,y,id=101){await page.locator('#touch-movement').dispatchEvent(type,{pointerType:'touch',pointerId:id,clientX:x,clientY:y,bubbles:true});}
try{
 browser=await chromium.launch({headless:true});
 for(const [width,height]of [[320,568],[390,844],[768,1024],[568,320],[844,390],[1024,768]]){
  persona=width+'×'+height;await init(width,height);
  await check('first screen includes product, main action and nearby touch directions without overflow',async()=>{
   const b=await page.locator('#btn-start').boundingBox();assert(b.y>=0&&b.y+b.height<=height);assert(await page.locator('.touch-instructions').isVisible());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:out+'/shots/entry-'+width+'.png'});
  });
  await check('start, story and portrait opt-out reach the existing game',start);
  await check('invisible movement fills the full left half; combat slots stay in the right half',async()=>{
   const b=await page.locator('#touch-movement').boundingBox();assert.equal(b.x,0);assert.equal(b.y,0);assert.equal(b.width,width/2);assert.equal(b.height,height);assert.equal(await page.locator('#joystick').count(),0);
   const css=await page.locator('#touch-movement').evaluate(e=>{const c=getComputedStyle(e);return{background:c.backgroundColor,border:c.borderWidth,shadow:c.boxShadow,touch:c.touchAction};});assert.deepEqual(css,{background:'rgba(0, 0, 0, 0)',border:'0px',shadow:'none',touch:'none'});
   for(const selector of ['.weapon-slots','.attack-btn','.jump-btn']){const box=await page.locator(selector).boundingBox();assert(box.x>=width/2,selector+' enters movement half');assert(box.x+box.width<=width,selector+' overflows');}
   const boxes=await page.locator('.weapon-slot,.attack-btn,.jump-btn').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height};}));
   for(let i=0;i<boxes.length;i++){assert(boxes[i].w>=44&&boxes[i].h>=44);for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y),'combat controls overlap');}}
  });
  await check('arbitrary left-half touch origins move horizontally and vertically',async()=>{
   const x=width*.15,y=height*.55,before=await snapshot();await synthetic('pointerdown',x,y);await synthetic('pointermove',x+50,y-50);await advance(200);const after=await snapshot();assert(after.x>before.x);assert(after.y<before.y);await synthetic('pointerup',x+50,y-50);await advance(100);
   await page.screenshot({path:out+'/shots/moving-'+width+'.png'});
  });
  await check('simultaneous story and weapon prompts are reachable below chrome and do not overlap combat controls',async()=>{
   const geometry=await page.evaluate(()=>{
    const prompts=['pickup-weapon','context-interact'].map(id=>document.getElementById(id)),hidden=prompts.map(n=>n.hidden);prompts.forEach(n=>n.hidden=false);
    const box=n=>{const b=n.getBoundingClientRect();return{id:n.id,x:b.x,y:b.y,w:b.width,h:b.height};};
    const controls=[...document.querySelectorAll('.weapon-slot,.attack-btn,.jump-btn,#pickup-weapon,#context-interact')].map(box),chrome=box(document.querySelector('.game-chrome'));
    prompts.forEach((n,i)=>n.hidden=hidden[i]);return{controls,chrome};
   });
   for(let i=0;i<geometry.controls.length;i++){
    const a=geometry.controls[i];assert(a.x>=0&&a.x+a.w<=width&&a.y>=0&&a.y+a.h<=height,a.id+' escapes viewport');
    if(a.id==='pickup-weapon'||a.id==='context-interact'){assert(a.y>=geometry.chrome.y+geometry.chrome.h,a.id+' is behind chrome');assert(a.x>=width/2,a.id+' enters movement half');}
    for(const b of geometry.controls.slice(i+1))assert(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y),'overlap: '+a.id+' '+b.id);
   }
  });
  await check('right-side start does not become movement; movement and attack have independent ownership',async()=>{
   const before=await snapshot();await page.locator('#game').dispatchEvent('pointerdown',{pointerType:'touch',pointerId:200,clientX:width*.8,clientY:height*.5});await page.locator('#game').dispatchEvent('pointermove',{pointerType:'touch',pointerId:200,clientX:width*.2,clientY:height*.4});await advance(70);assert(Math.abs((await snapshot()).x-before.x)<8);
   const x=width*.16,y=height*.6;await synthetic('pointerdown',x,y);await synthetic('pointermove',x+56,y);await page.locator('[data-action="throw"]').dispatchEvent('pointerdown',{pointerType:'touch',pointerId:202});await advance(50);await page.locator('[data-action="throw"]').dispatchEvent('pointerup',{pointerType:'touch',pointerId:202});assert((await snapshot()).attacks>before.attacks);const moving=await snapshot();await advance(100);assert((await snapshot()).x>moving.x);await synthetic('pointercancel',x+56,y);
  });
  await check('menu interaction clears movement, traps focus and restores the trigger',async()=>{
   await synthetic('pointerdown',width*.2,height*.5);await synthetic('pointermove',width*.2+56,height*.5);await page.locator('#btn-menu').click();assert.equal((await snapshot()).state,'paused');await page.keyboard.press('Escape');await advance(50);assert.equal(await page.locator(':focus').getAttribute('id'),'btn-menu');assert.equal((await snapshot()).state,'paused');await page.locator('#btn-resume').click();await advance(50);assert.equal((await snapshot()).state,'playing');
   const before=await snapshot();await synthetic('pointermove',0,0);await advance(100);assert(Math.abs((await snapshot()).x-before.x)<8);
  });
  await check('playing controls pass automated WCAG A/AA audit',async()=>{
   await page.clock.resume();const report=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();assert.deepEqual(report.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
  });
  await context.close();
 }
 persona='native Chromium touch, 844×390';await init(844,390);await start();
 await check('direct drag settles under a resting finger and release stops horizontal drift without scrolling',async()=>{
  const before=await snapshot();await synthetic('pointerdown',120,220);await synthetic('pointermove',150,190);await advance(700);const settled=await snapshot();await advance(250);const resting=await snapshot();
  assert(settled.x>before.x&&settled.y<before.y);assert(Math.abs(resting.x-settled.x)<=1);assert(Math.abs(resting.y-settled.y)<=1);
  await synthetic('pointermove',180,190);await advance(100);await synthetic('pointerup',180,190);await advance(150);const stopped=await snapshot();await advance(100);assert(Math.abs((await snapshot()).x-stopped.x)<=1);
  assert.equal(await page.evaluate(()=>scrollX||scrollY),0);
 });
 await check('native captured touch can cross the center while a second finger attacks, then both release cleanly',async()=>{
  const cdp=await context.newCDPSession(page),points=[];const send=(type,contacts=points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:contacts.map(p=>({...p,radiusX:2,radiusY:2,force:1}))});
  const before=await snapshot();points.push({id:1,x:200,y:230});await send('touchStart');points[0].x=250;points[0].y=185;await send('touchMove');await advance(120);assert((await snapshot()).x>before.x);assert((await snapshot()).y<before.y);
  const attack=await page.locator('.attack-btn').boundingBox();points.push({id:2,x:attack.x+attack.width/2,y:attack.y+attack.height/2});await send('touchStart');await advance(40);assert((await snapshot()).attacks>before.attacks);
  points[0].x=500;await send('touchMove');const a=await snapshot();await advance(100);assert((await snapshot()).x>a.x);
  const releasedAction=points.splice(1,1);await send('touchEnd',releasedAction);const beforeRelease=await snapshot();await advance(100);assert((await snapshot()).x>beforeRelease.x,'releasing Attack must leave the movement finger active');points.splice(0,1);await send('touchEnd');await advance(150);assert.equal(await page.locator('.is-pressed').count(),0);await cdp.detach();
 });
 await check('rotation clears an active native gesture and resumes the same run with a new touch',async()=>{
  const before=await snapshot();await synthetic('pointerdown',200,210);await synthetic('pointermove',256,210);await page.setViewportSize({width:390,height:844});await advance();assert.equal((await snapshot()).state,'paused');await page.locator('#btn-portrait').click();await advance();assert.equal((await snapshot()).map,before.map);const a=await snapshot();await synthetic('pointermove',0,0);await advance(100);assert(Math.abs((await snapshot()).x-a.x)<8);
 });
 await context.close();
 persona='desktop 1440×900';await init(1440,900,false);await start();
 await check('desktop keys move, jump and attack, mouse attacks, and touch surface is hidden',async()=>{
  assert(await page.locator('#touch-movement').isHidden());await page.locator('#game').focus();const before=await snapshot();await page.keyboard.down('ArrowRight');await advance(250);await page.keyboard.up('ArrowRight');assert((await snapshot()).x>before.x);const ground=(await snapshot()).y;await page.keyboard.down('Space');await advance(80);assert((await snapshot()).y<ground);await page.keyboard.up('Space');await page.keyboard.press('Enter');await advance(30);assert((await snapshot()).attacks>before.attacks);
  await advance(300);const attacks=(await snapshot()).attacks;await page.mouse.click(400,400);await advance(40);assert((await snapshot()).attacks>attacks);
 });
 await check('keyboard wallet prompt and GUILD stay reachable, with visible focus and natural wrapping at large text',async()=>{
  await page.locator('#btn-wallet').focus();await page.keyboard.press('Enter');assert(await page.locator('#wallet-dialog').isVisible());assert(await page.getByRole('link',{name:'Open in MetaMask',exact:true}).isVisible());await page.keyboard.press('Escape');await advance(50);assert.equal(await page.locator(':focus').getAttribute('id'),'btn-wallet');
  await page.screenshot({path:out+'/shots/desktop-focus.png'});
  await page.locator('#btn-menu').click();await page.locator('#btn-guild').click();
  const chapter=page.locator('.guild-chapter').first();if(!await chapter.evaluate(d=>d.open))await chapter.locator('summary').click();assert(await chapter.evaluate(d=>d.open));assert(await chapter.locator('p').last().isVisible());assert.match(await chapter.locator('p').last().textContent(),/Touch and drag anywhere on the left/);
  await page.clock.resume();await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.waitForFunction(w=>Math.abs(document.getElementById('stage').clientWidth-w)<2,width);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await chapter.locator('p').last().evaluate(n=>n.scrollIntoView({block:'start',behavior:'instant'}));const b=await chapter.locator('p').last().boundingBox(),header=await page.locator('#player-dialog .panel-header').boundingBox();assert(b.x>=0&&b.x+b.width<=width);assert(b.y>=header.y+header.height,'Help text hides beneath sticky heading');await page.screenshot({path:out+'/shots/guild-large-text-'+width+'.png'});}
 });
 await context.close();
 try{const wk=await webkit.launch({headless:true});await wk.close();limitations.push('WebKit launched, but this Chromium CDP touch suite was not run in WebKit.');}catch(error){limitations.push('WebKit could not launch: missing system libraries. No Safari/physical-device result claimed.');}
 await check('no page errors or missing local assets in export interactions',()=>{assert.deepEqual(errors,[]);assert.deepEqual(localFailures,[]);});
 console.log(results.length+' export touch checks passed.');
}catch(error){console.error(error.stack);process.exitCode=1;limitations.push('Interrupted: '+error.message);if(page&&!page.isClosed())await page.screenshot({path:out+'/shots/failure.png'}).catch(()=>{});}
finally{await browser?.close();await new Promise(done=>server.close(done));await writeFile(out+'/browser-results.json',JSON.stringify({results,errors,localFailures,limitations:[...limitations,'Chromium emulation and native CDP touch, not physical phones.','Backend unavailable responses deliberately isolate controls; no successful production save or wallet signature simulated.','Axe is automated coverage, not a screen-reader or complete accessibility certification.']},null,2));}
