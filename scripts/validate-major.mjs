// Actual production export at a static subpath. Test-only engine access is
// injected through a Playwright route; no probe hook ships in dist/.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
const pw=await import(pathToFileURL(resolve('test/scratch/node_modules/playwright/index.mjs')).href);
const {default:AxeBuilder}=await import(pathToFileURL(resolve('test/scratch/node_modules/@axe-core/playwright/dist/index.mjs')).href);
const root=resolve('dist'),results=[],limitations=[],errors=[],failures=[];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://127.0.0.1').pathname;if(!path.startsWith('/squeek/'))throw Error('not found');const file=resolve(root,'.'+path.slice('/squeek'.length)+(path.endsWith('/')?'index.html':''));if(!file.startsWith(root+sep))throw Error('not found');res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const url='http://127.0.0.1:'+server.address().port+'/squeek/';
await mkdir('test/scratch/major/shots',{recursive:true});
let browser;
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
async function menu(page,id){await page.locator('#btn-menu').click();await page.locator('#'+id).click();}
const injection=`window.probe={startGame,updateHud,updateBoss,updatePickups,updatePlayer,updateEnemy,damageBoss,hitEnemy,render,addChestnuts,get player(){return player;},get enemies(){return enemies;},get boss(){return boss;},get game(){return game;},get pickups(){return pickups;},get shots(){return shots;},press(a){pressed[a]=true;},release(){pressed={};held={};},loot(i,k){mapLoot[i]=k;}};`;
try{
 browser=await pw.chromium.launch({headless:true});
 const desktop=await browser.newContext({viewport:{width:1440,height:900}}),page=await desktop.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failures.push(r.url());});
 await check('production export loads at a subpath with complete metadata and no console/resource errors',async()=>{
  await page.goto(url);await page.waitForFunction(()=>Boolean(window.__hamster));assert.equal(await page.title(),'Squeek · The Lost Alice');for(const sel of ['link[rel="icon"]','meta[name="description"]','meta[property="og:title"]','meta[property="og:image"]'])assert(await page.locator(sel).getAttribute(sel.startsWith('link')?'href':'content'));
  await page.screenshot({path:'test/scratch/major/shots/desktop-entry.png'});assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
 });
 await check('keyboard Tab reaches the game and Connect, and closing the wallet returns focus',async()=>{
  await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('class'),'skip-link');await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('id'),'game');await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('id'),'btn-wallet');assert.equal(await page.locator('#btn-wallet').evaluate(b=>getComputedStyle(b).outlineStyle),'solid');await page.keyboard.press('Enter');await page.locator('#wallet-dialog[open]').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator(':focus').getAttribute('id'),'btn-wallet');
 });
 await check('entry and profile pass automated WCAG A/AA checks',async()=>{
  let audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();assert.deepEqual(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
  await menu(page,'btn-profile');audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();assert.deepEqual(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);await page.keyboard.press('Escape');
 });
 await check('desktop start, story, keyboard movement, jump, pause and resume work on the unmodified export',async()=>{
  await page.locator('#btn-start').click();for(let i=0;i<5;i++){await page.locator('#dlg-next').click();await page.waitForTimeout(125);}
  await page.waitForFunction(()=>window.__hamster.snapshot().state==='playing');const x=await page.evaluate(()=>window.__hamster.snapshot().x);
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(200);await page.keyboard.up('ArrowRight');assert((await page.evaluate(()=>window.__hamster.snapshot().x))>x);
  await page.keyboard.press('Space');await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__hamster.snapshot().state==='paused');await page.locator('#btn-resume').click();await page.waitForFunction(()=>window.__hamster.snapshot().state==='playing');
 });
 await check('profile validation, wardrobe, audio settings and real unavailable-leaderboard state are usable',async()=>{
  await menu(page,'btn-profile');await page.locator('#player-name').fill('River Mouse');await page.getByRole('button',{name:'Save name',exact:true}).click();await page.getByText('Name set for this visit only.',{exact:true}).waitFor();await page.keyboard.press('Escape');
  await menu(page,'btn-audio');await page.locator('#music-mute').check();await page.locator('#sfx-volume').fill('32');await page.keyboard.press('Escape');await menu(page,'btn-audio');assert(await page.locator('#music-mute').isChecked());assert.equal(await page.locator('#sfx-volume').inputValue(),'32');await page.keyboard.press('Escape');
  await page.locator('#btn-change').click();await page.getByText(/No costumes owned yet/).waitFor();await page.keyboard.press('Escape');await menu(page,'btn-leaderboard');await page.getByText(/Lifetime rankings need the existing Supabase/).waitFor();assert.equal(await page.locator('.leaderboard tbody tr').count(),0);await page.keyboard.press('Escape');
 });
 const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),mobile=await phone.newPage();mobile.on('pageerror',e=>errors.push(e.message));
 await check('390-wide first screen includes game, Start and Connect with no horizontal overflow',async()=>{
  await mobile.goto(url);const box=await mobile.locator('#btn-start').boundingBox();assert(box.y>=0&&box.y+box.height<=844);assert(await mobile.locator('#btn-wallet').isVisible());assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await mobile.screenshot({path:'test/scratch/major/shots/phone-entry.png'});
  await mobile.locator('#btn-wallet').click();await mobile.getByRole('link',{name:'Open in MetaMask',exact:true}).waitFor();assert((await mobile.getByRole('link',{name:'Open in MetaMask',exact:true}).getAttribute('href')).includes('/squeek/'));await mobile.keyboard.press('Escape');
 });
 await check('phone start, rotate fallback, portrait opt-in and landscape resize preserve the run',async()=>{
  await mobile.locator('#btn-start').click();await mobile.locator('#btn-portrait').click();for(let i=0;i<5;i++){await mobile.locator('#dlg-next').click();await mobile.waitForTimeout(125);}
  await mobile.waitForFunction(()=>window.__hamster.snapshot().state==='playing');await mobile.setViewportSize({width:844,height:390});await mobile.waitForTimeout(100);assert.equal((await mobile.evaluate(()=>window.__hamster.snapshot())).map,1);assert(await mobile.locator('#joystick').isVisible());assert(await mobile.getByRole('button',{name:'Attack',exact:true}).isVisible());
  const boxes=await Promise.all(['#joystick','.attack-btn','.jump-btn','#slot-1','#slot-2','#slot-3'].map(s=>mobile.locator(s).boundingBox()));for(const b of boxes){assert(b.width>=44&&b.height>=44);assert(b.x>=0&&b.y>=0&&b.x+b.width<=844&&b.y+b.height<=390);}for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y),'touch controls overlap');}
 });
 await desktop.close();await phone.close();
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
 const source=(await readFile('dist/game.js','utf8')).replace('  // Title state uses a fresh world',injection+'\n  // Title state uses a fresh world');
 await p.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:source}));await p.goto(url);await p.waitForFunction(()=>Boolean(window.probe));
 await check('all four worlds render their own scenery and bosses from the actual engine',async()=>{
  for(let map=1;map<=4;map++){
   await p.evaluate(async map=>{await window.probe.startGame(map,true);const t=window.probe;t.player.x=3000;t.player.y=146;t.player.vx=0;t.player.vy=0;t.enemies.forEach(e=>{e.homeX=0;e.x=0;});t.game.camX=2850;t.game.frames=[60,90,120,150][map-1]*60;t.boss.state='idle';t.boss.t=500;t.game.flash=0;t.game.beam=0;t.updateHud();t.render();},map);
   const snap=await p.evaluate(()=>window.__hamster.snapshot());assert.equal(snap.bossName,['Cockroach','Penguin','Dragon','Shark'][map-1]);await p.screenshot({path:'test/scratch/major/shots/map-'+map+'.png'});
  }
 });
 await check('touch weapon pickup requires a visible PICK UP action; walking near it alone does not claim it',async()=>{
  await p.evaluate(async()=>{const t=window.probe;await t.startGame(1,true);t.enemies.forEach(e=>{e.x=3000;e.homeX=3000;});const e=t.enemies[0];t.loot(e.id,'gun');t.hitEnemy(e,e.hp,0);const drop=t.pickups.find(k=>k.kind==='weapon');Object.assign(drop,{phys:false,x:t.player.x,y:t.player.y});t.updatePickups();t.render();});
  assert.equal(await p.evaluate(()=>window.__hamster.snapshot().weapons.includes('gun')),false);await p.getByRole('button',{name:'Pick up gun',exact:true}).click();await p.waitForFunction(()=>window.__hamster.snapshot().weapons.includes('gun'));assert.equal(await p.evaluate(()=>window.__hamster.snapshot().ammo.gun),100);
  await p.locator('#slot-1').click();assert.equal(await p.evaluate(()=>window.__hamster.snapshot().weapon),'gun');await p.screenshot({path:'test/scratch/major/shots/weapon-pickup.png'});
 });
 await check('one action owns one pointer; a second press cannot release the first held action',async()=>{
  const result=await p.evaluate(()=>{const b=document.querySelector('.jump-btn');function pointer(type,id){b.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:id,pointerType:'touch',clientX:10,clientY:10}));}pointer('pointerdown',8);pointer('pointerdown',9);pointer('pointerup',9);const stays=b.classList.contains('is-pressed');pointer('pointercancel',8);return{stays,released:!b.classList.contains('is-pressed')};});assert.deepEqual(result,{stays:true,released:true});
 });
 await check('growth is visible at 20 and 40 points with unchanged collision body',async()=>{
  await p.evaluate(async()=>{const t=window.probe;await t.startGame(1,true);t.enemies.forEach(e=>{e.x=3000;e.homeX=3000;});t.addChestnuts(20);t.render();});const first=await p.evaluate(()=>window.__hamster.snapshot());assert.equal(first.growth.tier,1);await p.evaluate(()=>window.probe.addChestnuts(20));const second=await p.evaluate(()=>window.__hamster.snapshot());assert.equal(second.growth.tier,2);assert(second.growth.scale>first.growth.scale);assert.deepEqual(second.collision,{w:12,h:14});await p.screenshot({path:'test/scratch/major/shots/growth.png'});
 });
 await check('rendered map progression is automatic and final boss reaches the ending',async()=>{
  for(let map=1;map<=4;map++){await p.evaluate(async map=>{const t=window.probe;await t.startGame(map,true);t.game.frames=[60,90,120,150][map-1]*60;t.boss.state='idle';t.damageBoss(t.boss.hp);t.boss.t=1;t.updateBoss();},map);if(map<4)await p.waitForFunction(map=>window.__hamster.snapshot().map===map+1,map);else await p.waitForFunction(()=>window.__hamster.snapshot().state==='ending');}
 });
 for(const width of [320,390,1440])await check(width+'-wide modal and entry layout stays within viewport',async()=>{
  await p.setViewportSize({width,height:width===1440?900:844});await p.reload();await p.waitForFunction(()=>Boolean(window.probe));assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await menu(p,'btn-guild');assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.keyboard.press('Escape');
 });
 await check('200% text and an RTL mirror keep the primary controls and dialogs usable',async()=>{
  await p.setViewportSize({width:390,height:844});await p.reload();await p.evaluate(()=>{document.documentElement.style.fontSize='200%';document.documentElement.dir='rtl';});await p.waitForTimeout(50);await p.screenshot({path:'test/scratch/major/shots/large-text-rtl.png'});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const chrome=await p.locator('.game-chrome').boundingBox();const b=await p.locator('#btn-start').boundingBox();assert(b.y>=chrome.y+chrome.height,'chrome overlaps the main action at 200% text');assert(b.x>=0&&b.x+b.width<=390&&b.y>=0&&b.y+b.height<=844);await menu(p,'btn-profile');const input=await p.locator('#player-name').boundingBox();assert(input.x>=0&&input.x+input.width<=390);await p.keyboard.press('Escape');await p.evaluate(()=>{document.documentElement.style.fontSize='';document.documentElement.dir='';});
 });
 await check('no runtime errors occurred during production and instrumented flows',()=>{assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);});
 await context.close();await browser.close();browser=null;
 try{const wk=await pw.webkit.launch({headless:true});await wk.close();limitations.push('WebKit launched but the complete interaction suite has not run in WebKit.');}catch(error){limitations.push('WebKit could not launch: missing system libraries (GTK4, GStreamer and related WebKit runtime dependencies). No Safari interaction result is claimed.');}
 console.log(results.length+' browser checks passed.');
}catch(error){console.error(error.stack);process.exitCode=1;limitations.push('Suite interrupted: '+error.message);}
finally{await browser?.close();await new Promise(done=>server.close(done));await writeFile('test/scratch/major/browser-results.json',JSON.stringify({results,limitations,errors,failures},null,2));}
