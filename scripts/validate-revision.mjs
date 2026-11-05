// Regression coverage for the three revision findings against the built export.
// Test-only engine access, Auth sessions and HTTP are injected; SQL/game/save/UI
// execute for real. Nothing here is bundled into the static website.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHarness} from '../supabase/tests/major-harness.mjs';
const pw=await import(pathToFileURL(resolve('test/scratch/node_modules/playwright/index.mjs')).href);
const h=await createHarness(),root=resolve('dist'),results=[],errors=[],failures=[],limitations=[];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;if(!path.startsWith('/squeek/'))throw Error('not found');
 const file=resolve(root,'.'+path.slice('/squeek'.length)+(path.endsWith('/')?'index.html':''));if(!file.startsWith(root+sep))throw Error('not found');
 res.setHeader('content-type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));
}catch{res.writeHead(404).end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url='http://127.0.0.1:'+server.address().port+'/squeek/';
const injection=`window.probe={startGame,hitEnemy,updatePlayer,updatePickups,render,updateHud,get player(){return player;},get pickups(){return pickups;},get enemies(){return enemies;},get game(){return game;},get shots(){return shots;},release(){pressed={};held={};},loot(i,k){mapLoot[i]=k;}};`;
const source=(await readFile('dist/game.js','utf8')).replace('  // Title state uses a fresh world',injection+'\n  // Title state uses a fresh world');
await mkdir('test/scratch/revision/shots',{recursive:true});
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
let browser;
async function pageAt(viewport,touch=false,user=null){
 const context=await browser.newContext({viewport,isMobile:touch,hasTouch:touch}),page=await context.newPage(),net={offline:false};
 await page.clock.install();await page.clock.pauseAt(new Date());
 page.on('pageerror',error=>errors.push(error.message));page.on('response',r=>{if(r.url().startsWith(url)&&r.status()>=400)failures.push(r.url());});
 await context.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:source}));
 if(user){
  await context.addInitScript(({id,wallet})=>localStorage.setItem('hamster-friendship-v2-wallet-session-'+wallet,JSON.stringify({access_token:id,refresh_token:id,expires_at:Date.now()/1000+3600})),user);
  await context.route('**/config.js',r=>r.fulfill({contentType:'text/javascript',body:"window.HAMSTER_CONFIG={supabaseUrl:'https://sql-fixture.invalid',supabasePublishableKey:'fixture-public'};"}));
  await context.route('https://sql-fixture.invalid/**',async route=>{
   const req=route.request(),name=new URL(req.url()).pathname.split('/').pop();
   if(net.offline&&['hf_progress','hf_run_state'].includes(name)){await route.abort('internetdisconnected');return;}
   try{const data=await h.rpc(req.headers().authorization?user:null,name,req.postDataJSON()||{});await route.fulfill({json:data});}
   catch(error){failures.push(error.message);await route.fulfill({status:400,json:{message:error.message}});}
  });
 }
 await page.goto(url);await page.waitForFunction(()=>Boolean(window.probe));
 if(user)await page.evaluate(wallet=>window.HamsterSave.setWallet(wallet),user.wallet);
 return{context,page,net};
}
async function dropAt(page,x=120,y=146){
 await page.evaluate(async({x,y})=>{const t=window.probe;await t.startGame(1,true);t.game.flash=0;t.game.beam=0;Object.assign(t.player,{x:96,y:146,onGround:true});const e=t.enemies[0];t.loot(e.id,'gun');t.hitEnemy(e,e.hp,0);Object.assign(t.pickups.find(k=>k.kind==='weapon'),{phys:false,x,y});t.updatePickups();t.render();},{x,y});
}
try{
 browser=await pw.chromium.launch({headless:true});
 const mobile=await pageAt({width:844,height:390},true),p=mobile.page;
 await check('touch PICK UP succeeds at the reported 24-pixel outer range without stepping closer',async()=>{
  await dropAt(p);assert(await p.locator('#pickup-weapon').isVisible());assert(await p.locator('#pickup-weapon').isEnabled());
  assert.deepEqual(await p.evaluate(()=>window.probe.player.weapons),['shell']);await p.screenshot({path:'test/scratch/revision/shots/pickup-range.png'});
  await p.locator('#pickup-weapon').tap();await p.evaluate(()=>{const t=window.probe;t.updatePickups();t.release();t.render();});
  assert.deepEqual(await p.evaluate(()=>window.probe.player.weapons),['shell','gun']);assert.equal(await p.evaluate(()=>window.probe.player.ammo.gun),100);assert.equal(await p.locator('#pickup-weapon').isVisible(),false);
 });
 const desktop=await pageAt({width:1440,height:900}),d=desktop.page;
 await check('desktop E claims the offered weapon at the same outer range',async()=>{
  await dropAt(d);await d.locator('#game').focus();await d.keyboard.press('KeyE');
  await d.evaluate(()=>{const t=window.probe;t.updatePickups();t.release();t.render();});
  assert.deepEqual(await d.evaluate(()=>window.probe.player.weapons),['shell','gun']);assert.equal(await d.evaluate(()=>window.probe.player.ammo.gun),100);
 });
 await check('mouse weapon selection returns focus to gameplay and Space jumps while Enter fires',async()=>{
  await d.locator('#slot-1').click();assert.equal(await d.locator(':focus').getAttribute('id'),'game');assert.equal(await d.evaluate(()=>window.probe.player.weapon),'gun');
  await d.keyboard.press('Space');await d.evaluate(()=>{window.probe.updatePlayer();window.probe.release();});
  assert((await d.evaluate(()=>window.probe.player.y))<146);assert.equal(await d.evaluate(()=>window.probe.player.weapon),'gun');
  await d.keyboard.press('Enter');await d.evaluate(()=>{window.probe.updatePlayer();window.probe.release();});
  assert.equal(await d.evaluate(()=>window.probe.player.ammo.gun),99);assert.equal(await d.evaluate(()=>window.probe.shots.filter(s=>s.kind==='gun').length),1);assert.equal(await d.evaluate(()=>window.probe.player.weapon),'gun');
 });
 await check('deliberate keyboard activation retains slot focus and native Enter/Space toggling',async()=>{
  await d.locator('#slot-1').focus();await d.keyboard.press('Enter');assert.equal(await d.locator(':focus').getAttribute('id'),'slot-1');assert.equal(await d.evaluate(()=>window.probe.player.weapon),'shell');
  await d.keyboard.press('Space');assert.equal(await d.locator(':focus').getAttribute('id'),'slot-1');assert.equal(await d.evaluate(()=>window.probe.player.weapon),'gun');assert.equal(await d.evaluate(()=>window.probe.player.ammo.gun),99);
  await d.screenshot({path:'test/scratch/revision/shots/keyboard-slot.png'});await d.keyboard.press('Tab');assert.notEqual(await d.evaluate(()=>document.activeElement.id),'slot-1');
 });
 await check('touch weapon slot selection returns focus to the canvas',async()=>{
  await p.locator('#slot-1').tap();assert.equal(await p.locator(':focus').getAttribute('id'),'game');assert.equal(await p.evaluate(()=>window.probe.player.weapon),'gun');
 });
 const a=await h.identity();await h.rpc(a,'hf_wallet_profile');const one=await pageAt({width:390,height:844},false,a),two=await pageAt({width:390,height:844},false,a);let run;
 await check('two 390-wide devices save both real fruit events after A goes offline and B starts a new run',async()=>{
  await one.page.evaluate(()=>window.probe.startGame(1,true));one.net.offline=true;
  await one.page.evaluate(async()=>{const t=window.probe,food=t.pickups.find(k=>k.forage==='trail-0');t.game.frames=90;t.player.x=food.x;t.player.y=food.y;t.updatePickups();await window.HamsterSave.flush();t.render();});
  assert.equal(await one.page.evaluate(()=>window.HamsterSave.snapshot().pendingEvents),1);
  run=await one.page.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.includes('-run-outbox-')))));
  assert.deepEqual(run.events,[{source:'trail-0',kind:'forage',frame:90,seq:1}]);
  await two.page.evaluate(async()=>{const t=window.probe;await t.startGame(1,true);const food=t.pickups.find(k=>k.forage==='trail-1');t.game.frames=90;t.player.x=food.x;t.player.y=food.y;t.updatePickups();await window.HamsterSave.flush();});
  assert.equal((await h.rpc(a,'hf_run_state',{p_run:run.id})).status,'active');assert.equal((await h.rpc(a,'hf_wallet_profile')).total_score,1);
  one.net.offline=false;await one.page.locator('#btn-menu').click();await one.page.locator('#btn-profile').click();await one.page.locator('#profile-retry').click();
  await one.page.waitForFunction(()=>window.HamsterSave.snapshot().profile.total_score===2&&window.HamsterSave.snapshot().pendingEvents===0);
  const s=await one.page.evaluate(()=>window.HamsterSave.snapshot());assert.equal(s.runConflict,false);assert.equal(s.recoveryEvents,0);assert.equal(s.profile.produce_points,2);assert.equal(await one.page.locator('#profile-recover').isVisible(),false);
  await one.page.screenshot({path:'test/scratch/revision/shots/two-device-save.png'});assert.equal((await h.rpc(a,'hf_wallet_profile')).total_score,2);
 });
 await check('retry, browser refresh and a fresh SQL leaderboard retain exactly both points without duplicates',async()=>{
  await h.rpc(a,'hf_progress',{p_run:run.id,p_events:run.events});await one.page.reload();await one.page.evaluate(wallet=>window.HamsterSave.setWallet(wallet),a.wallet);
  const s=await one.page.evaluate(()=>window.HamsterSave.snapshot());assert.equal(s.profile.total_score,2);assert.equal(s.profile.produce_points,2);assert.equal(s.pendingEvents,0);assert.equal(s.recoveryEvents,0);
  await one.page.locator('#btn-menu').click();await one.page.locator('#btn-leaderboard').click();await one.page.locator('.leaderboard tbody tr').waitFor();assert.equal(await one.page.locator('.leaderboard tbody tr td:nth-child(3)').textContent(),'2');
  assert.equal((await h.admin('select count(*)::int as n from hf_private.wallet_profiles where wallet=$1',[a.wallet])).rows[0].n,1);
 });
 await check('final revision flows have no JavaScript or unexpected local/SQL resource failures',()=>{assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);});
 for(const c of [mobile,desktop,one,two])await c.context.close();
 try{const wk=await pw.webkit.launch({headless:true});await wk.close();limitations.push('WebKit launches but these revision flows were not exercised in WebKit.');}catch{limitations.push('WebKit cannot launch: missing GTK4, GStreamer and related host libraries; no Safari result claimed.');}
 console.log(results.length+' revision browser checks passed.');
}catch(error){console.error(error.stack);process.exitCode=1;limitations.push('Interrupted: '+error.message);}
finally{
 await browser?.close();await new Promise(done=>server.close(done));await h.close();
 await writeFile('test/scratch/revision/browser-results.json',JSON.stringify({results,errors,failures,limitations:[...limitations,'Auth sessions, HTTP and deterministic position/frame access are fixtures; game/save/UI/SQL are real. No hosted Supabase or physical device proof.']},null,2));
}
