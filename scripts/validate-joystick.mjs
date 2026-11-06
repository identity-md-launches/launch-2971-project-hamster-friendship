// Browser check of the production export at a gateway-style subpath:
// joystick behaviour (one analog axis, dead zone, smooth stop, multi-touch)
// and containment of every touch control inside the visible game frame.
// Needs Playwright installed under test/scratch (see README). Writes only to
// test/scratch/joystick/.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
const pw=await import(pathToFileURL(resolve('test/scratch/node_modules/playwright/index.mjs')).href);
const root=resolve('dist'),out=resolve('test/scratch/joystick'),results=[],errors=[],localFailures=[],skipped=[];
await mkdir(out+'/shots',{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(!path.startsWith('/squeek/'))throw Error('Not found');const file=resolve(root,'.'+path.slice('/squeek'.length)+(path.endsWith('/')?'index.html':''));if(!file.startsWith(root+sep))throw Error('Not found');res.setHeader('content-type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const url='http://127.0.0.1:'+server.address().port+'/squeek/';
let page,context,persona='',engine='chromium';
async function check(name,fn){try{await fn();results.push({engine,persona,name,passed:true});console.log('ok  ',engine,persona,name);}catch(e){results.push({engine,persona,name,passed:false,error:e.message});console.log('FAIL',engine,persona,name,e.message);}}
const advance=(ms=100)=>page.clock.runFor(ms);
const snap=()=>page.evaluate(()=>window.__hamster.snapshot());
async function start(){await page.locator('#btn-start').click();await advance();if(await page.locator('#btn-portrait').isVisible()){await page.locator('#btn-portrait').click();await advance();}for(let i=0;i<12&&(await snap()).state==='dialogue';i++){await page.locator('#dlg-next').click();await advance(140);}assert.equal((await snap()).state,'playing');await advance(200);}
async function init(browser,width,height,touch=true){
 context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch&&engine==='chromium'});page=await context.newPage();page.setDefaultTimeout(6000);
 page.on('pageerror',e=>errors.push(engine+' '+persona+': '+e.message));page.on('response',r=>{if(r.url().startsWith(url)&&r.status()>=400)localFailures.push(r.url());});
 await context.route('https://nhtlwcukeyhvkrjveots.supabase.co/**',r=>r.fulfill({status:503,json:{message:'Deliberate unavailable network fixture for control isolation'}}));
 await page.clock.install();await page.clock.pauseAt(new Date());await page.goto(url);await advance();
}
const pointer=(type,x,y,id=11)=>page.locator('#touch-movement').dispatchEvent(type,{pointerType:'touch',pointerId:id,clientX:x,clientY:y,isPrimary:true,button:0,buttons:type==='pointerup'?0:1,bubbles:true});
async function stickCenter(){const b=await page.locator('#joystick').boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2,w:b.width};}
async function boxes(){return page.evaluate(()=>{const f=document.getElementById('touch-frame').getBoundingClientRect(),c=document.getElementById('game').getBoundingClientRect(),stage=document.getElementById('stage').getBoundingClientRect();
 const sel=['#joystick','.weapon-slot','.jump-btn','.attack-btn','#pickup-weapon:not([hidden])','#context-interact:not([hidden])'];const list=[];
 for(const s of sel)for(const n of document.querySelectorAll(s)){const b=n.getBoundingClientRect();if(b.width&&b.height)list.push({s,x:b.x,y:b.y,r:b.right,b:b.bottom,w:b.width,h:b.height});}
 return {frame:{x:f.x,y:f.y,r:f.right,b:f.bottom},canvas:{x:c.x,y:c.y,r:c.right,b:c.bottom},stage:{r:stage.right,b:stage.bottom},vw:innerWidth,vh:innerHeight,list,layout:document.getElementById('touch-frame').dataset.layout,fit:document.getElementById('touch-frame').dataset.fit,scale:getComputedStyle(document.getElementById('touch-frame')).getPropertyValue('--pad-scale'),chrome:document.querySelector('.game-chrome').getBoundingClientRect().bottom};});}
function assertContained(m,width,height){
 const e=0.5;assert(m.list.length>=6,'controls visible: '+m.list.length);
 for(const c of m.list){
  assert(c.x>=m.frame.x-e&&c.y>=m.frame.y-e&&c.r<=m.frame.r+e&&c.b<=m.frame.b+e,c.s+' leaves the game frame');
  assert(c.x>=-e&&c.y>=-e&&c.r<=width+e&&c.b<=height+e,c.s+' leaves the viewport');
  assert(c.y>=m.chrome-e,c.s+' overlaps the header/HUD');
  assert(c.w>=44&&c.h>=44,c.s+' smaller than 44px');
 }
 for(let i=0;i<m.list.length;i++)for(let j=i+1;j<m.list.length;j++){const a=m.list[i],b=m.list[j];assert(!(a.x<b.r&&a.r>b.x&&a.y<b.b&&a.b>b.y),a.s+' overlaps '+b.s);}
 if(m.layout==='landscape'){const k=Math.min((m.canvas.r-m.canvas.x)/1,1);void k;}
}
async function jsMovement(){return page.evaluate(()=>({x:window.__hamster.snapshot().x}));}
try{
 for(const name of ['chromium','webkit']){
  engine=name;let browser;
  try{browser=await pw[name].launch({headless:true});}catch(e){const reason=e.message.includes('missing dependencies')?'host is missing WebKit system libraries':e.message.split('\n')[0];skipped.push({engine,reason});console.log('SKIP',engine,reason);continue;}
  const sizes=name==='chromium'?[[844,390],[568,320],[932,430],[1024,768],[390,844],[320,568],[360,640],[740,360],[915,412]]:[[844,390],[390,844],[568,320]];
  for(const [width,height]of sizes){
   persona=width+'x'+height;await init(browser,width,height);
   await check('start reaches play',start);
   await check('every touch control is inside the game frame, viewport and below the HUD, with no overlap',async()=>{
    const m=await boxes();assertContained(m,width,height);results.push({engine,persona,name:'measured pad scale',passed:true,scale:m.scale.trim(),fit:m.fit});
    if(m.layout==='landscape'){for(const c of m.list){assert(c.x>=m.canvas.x-0.5&&c.r<=m.canvas.r+0.5,'outside the drawn picture');}}
    await page.screenshot({path:out+'/shots/play-'+engine+'-'+persona+'.png'});
   });
   await check('pickup and Read prompts together still fit',async()=>{
    // The game re-hides prompts every frame unless Chang is beside an object,
    // so force both visible with a test stylesheet and ask for a refit.
    const tag=await page.addStyleTag({content:'.context-actions > [hidden]{display:inline-grid!important;place-content:center}'});
    await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await advance(100);
    const m=await boxes();m.list.push(...await page.evaluate(()=>[...document.querySelectorAll('.context-actions > *')].map(n=>{const b=n.getBoundingClientRect();return{s:'#'+n.id,x:b.x,y:b.y,r:b.right,b:b.bottom,w:b.width,h:b.height};})));
    assertContained(m,width,height);results.push({engine,persona,name:'measured pad scale with prompts',passed:true,scale:m.scale.trim(),fit:m.fit});
    if(width===844||width===390||width===320||width===568)await page.screenshot({path:out+'/shots/prompts-'+engine+'-'+persona+'.png'});
    await tag.evaluate(n=>n.remove());await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await advance(100);
   });
   await check('joystick: forward and back only, analog, dead zone, smooth stop',async()=>{
    const c=await stickCenter();const x0=(await snap()).x,y0=(await snap()).y;
    // dead zone: small push does nothing
    await pointer('pointerdown',c.x+3,c.y);await pointer('pointermove',c.x+4,c.y-2);await advance(300);
    assert.equal((await snap()).x,x0,'dead zone moved Chang');
    // half push walks slower than full push
    await pointer('pointermove',c.x+c.w*0.18,c.y);await advance(500);const half=(await snap()).x-x0;assert(half>0,'half push did not move forward');
    const x1=(await snap()).x;await pointer('pointermove',c.x+c.w,c.y);await advance(500);const full=(await snap()).x-x1;assert(full>half*1.3,'full push not faster ('+half+' vs '+full+')');
    // vertical finger motion is ignored: pushing straight up/down does not move, does not hover
    await pointer('pointermove',c.x,c.y-c.w);await advance(600);const xv=(await snap()).x;await advance(300);assert(Math.abs((await snap()).x-xv)<=1,'vertical push moved horizontally');
    const yFloor=(await snap()).y;await pointer('pointermove',c.x,c.y+c.w);await advance(400);assert.equal((await snap()).y,yFloor,'down push moved vertically');
    const knob=await page.locator('#joystick-knob').evaluate(n=>getComputedStyle(n).getPropertyValue('--knob-x').trim());assert.equal(knob,'0.0px','knob left the horizontal axis centre for a vertical push');
    // backward
    const xb=(await snap()).x;await pointer('pointermove',c.x-c.w,c.y-c.w*0.4);await advance(500);assert((await snap()).x<xb-4,'back push did not move backward');
    // release: speed decays over several frames rather than stopping in one
    await pointer('pointermove',c.x+c.w,c.y);await advance(600);await pointer('pointerup',c.x+c.w,c.y);
    const r0=(await snap()).x;await advance(17);const r1=(await snap()).x;await advance(400);const r2=(await snap()).x;await advance(300);const r3=(await snap()).x;
    assert(r1>r0,'stopped instantly on release');assert(r2>r1,'did not glide after release');assert.equal(r3,r2,'kept moving after release');
    void y0;
   });
   await check('joystick and Jump/Attack work together (separate fingers)',async()=>{
    const c=await stickCenter();const before=await snap();
    await pointer('pointerdown',c.x+c.w,c.y,21);await advance(200);
    await page.locator('.jump-btn').dispatchEvent('pointerdown',{pointerType:'touch',pointerId:22,clientX:1,clientY:1,bubbles:true});await advance(120);
    const mid=await snap();assert(mid.y<before.y,'jump did not lift Chang while walking');
    await page.locator('.jump-btn').dispatchEvent('pointerup',{pointerType:'touch',pointerId:22,bubbles:true});
    await page.locator('.attack-btn').dispatchEvent('pointerdown',{pointerType:'touch',pointerId:23,bubbles:true});await advance(50);await page.locator('.attack-btn').dispatchEvent('pointerup',{pointerType:'touch',pointerId:23,bubbles:true});
    const after=await snap();assert(after.attacks>before.attacks,'attack did not fire');assert(after.x>before.x,'walking stopped when other fingers pressed');
    await pointer('pointerup',c.x,c.y,21);await advance(800);
   });
   await check('page does not overflow horizontally',async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);});
   await context.close();
  }
  // desktop keyboard unaffected and joystick hidden
  persona='1440x900 desktop';await init(browser,1440,900,false);
  await check('desktop: joystick hidden, keyboard walking works',async()=>{await start();assert.equal(await page.locator('#joystick').isVisible(),false);const x=(await snap()).x;await page.keyboard.down('ArrowRight');await advance(400);await page.keyboard.up('ArrowRight');assert((await snap()).x>x+5);const m=await boxes();for(const c of m.list.filter(c=>c.s==='.weapon-slot'))assert(c.r<=m.frame.r+0.5&&c.b<=m.frame.b+0.5);await page.screenshot({path:out+'/shots/desktop-'+engine+'.png'});});
  await context.close();await browser.close();
 }
}finally{server.close();}
const failed=results.filter(r=>!r.passed);
await writeFile(out+'/results.json',JSON.stringify({url:'local static server /squeek/ subpath',skipped,results,pageErrors:errors,localFailures},null,2)+'\n');
console.log(results.length-failed.length+'/'+results.length+' passed; page errors: '+errors.length+'; local 4xx: '+localFailures.length);
if(failed.length||errors.length||localFailures.length)process.exit(1);
