// Production UI + PostgreSQL RPCs. Only Supabase Auth, provider signatures and
// HTTP transport are explicit fixtures. No live account or credential is used.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {web3Identity} from '../supabase/tests/web3-identity.mjs';
const {PGlite}=await import(pathToFileURL(resolve(process.argv[2]||'test/scratch/node_modules/@electric-sql/pglite/dist/index.js')).href);
const pw=await import(pathToFileURL(resolve(process.argv[3]||'/opt/imd-tools/playwright-mcp/node_modules/playwright/index.mjs')).href);
const db=await PGlite.create(),root=resolve('dist'),out=resolve('test/scratch/market-browser'),uid=randomUUID(),address='0x'+'a'.repeat(40);
const results=[],errors=[];let browser,server,origin,lose='',busy=Promise.resolve(),holdBoard=false,releaseBoard,failBoard=false;await mkdir(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
async function audit(page,name){if(!process.argv[4])return;await page.addScriptTag({path:resolve(process.argv[4])});const result=await page.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});return{violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),passes:r.passes.length,incomplete:r.incomplete.map(v=>v.id)};});await writeFile(resolve(out,name+'-axe.json'),JSON.stringify(result,null,2));assert.deepEqual(result.violations,[]);}
async function rpc(name,body,authenticated){const work=busy.then(async()=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[authenticated?uid:'']);await db.exec('set role '+(authenticated?'authenticated':'anon'));const keys=Object.keys(body),args=keys.map(k=>k==='p_events'?JSON.stringify(body[k]):body[k]);return(await db.query('select public.'+name+'('+keys.map((k,i)=>k+'=>$'+(i+1)+(k==='p_events'?'::jsonb':'')).join(',')+') as result',args)).rows[0].result;});busy=work.catch(()=>{});return work;}
async function admin(sql,args=[]){await busy;await db.exec('reset role');return db.query(sql,args);}
try{
 await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated;create table auth.users(id uuid primary key);create table auth.identities(user_id uuid,provider text,identity_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 for(const file of['001_friendship.sql','002_seasons_dice_badges.sql','003_squeek.sql','004_lifetime_persistence.sql','005_verified_wallet_recovery.sql'])await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 await db.query('insert into auth.users values($1)',[uid]);await db.query("insert into auth.identities values($1,'web3',$2::jsonb)",[uid,JSON.stringify(web3Identity(address))]);
 await rpc('hf_wallet_profile',{},true);await admin('update hf_private.profiles set sqk=350 where user_id=$1',[uid]);
 server=createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost'),path=url.pathname;try{
  if(path.startsWith('/rest/v1/rpc/')||path==='/auth/v1/token'){
   let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text||'{}');let data;
   if(path==='/auth/v1/token'){assert.equal(body.chain,'ethereum');assert(body.message.includes('wants you to sign in'));data={access_token:'fixture-session',refresh_token:'fixture-refresh',expires_in:3600};}
   else{const name=path.split('/').pop();
    if(name==='hf_lifetime_top100'&&holdBoard){holdBoard=false;await new Promise(done=>releaseBoard=done);}
    if(name==='hf_lifetime_top100'&&failBoard)return res.writeHead(503,{'content-type':'application/json'}).end(JSON.stringify({message:'Injected rankings unavailable.'}));
    data=await rpc(name,body,req.headers.authorization==='Bearer fixture-session');if(name===lose){lose='';res.writeHead(503,{'content-type':'application/json'}).end(JSON.stringify({message:'Injected uncertain response after commit. Retry the purchase.'}));return;}}
   return res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(data));
  }
  if(path==='/preview/config.js')return res.writeHead(200,{'content-type':'text/javascript'}).end(`window.HAMSTER_CONFIG=Object.freeze({supabaseUrl:${JSON.stringify(origin)},supabasePublishableKey:'fixture-public'});`);
  if(!path.startsWith('/preview/'))return res.writeHead(404).end();
  const file=resolve(root,decodeURIComponent(path.slice(9))||'index.html');if(!file.startsWith(root+sep))return res.writeHead(403).end();res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream'}).end(await readFile(file));
 }catch(error){res.writeHead(400,{'content-type':'application/json'}).end(JSON.stringify({message:error.message}));}});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));origin='http://127.0.0.1:'+server.address().port;
 browser=await pw.chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(()=>{window.fixtureWallet={calls:[]};const p={isMetaMask:true,async request({method,params}){window.fixtureWallet.calls.push(method);if(method==='eth_accounts'||method==='eth_requestAccounts')return['0x'+'a'.repeat(40)];if(method==='eth_chainId')return'0x1';if(method==='personal_sign')return'0x'+'1'.repeat(130);throw new Error('Unexpected '+method);},on(){},removeListener(){}};window.addEventListener('eip6963:requestProvider',()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{rdns:'io.metamask',name:'MetaMask'},provider:p}})));});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/preview/');
 const menu=async(id)=>{await page.locator('#btn-menu').click();await page.locator('#'+id).click();};
 await check('connecting MetaMask leaves guest saves off until explicit login',async()=>{await menu('btn-wallet');await page.getByRole('button',{name:'Connect MetaMask',exact:true}).click();assert.equal((await page.evaluate(()=>window.HamsterSave.snapshot())).cloud,false);assert(!(await page.evaluate(()=>window.fixtureWallet.calls)).includes('personal_sign'));});
 await check('explicit login opens the existing verified wallet balance',async()=>{await page.getByRole('button',{name:'Sign in to save',exact:true}).click();await page.waitForFunction(()=>window.HamsterSave.snapshot().cloud);assert.equal((await page.evaluate(()=>window.HamsterSave.snapshot())).profile.sqk,350);assert((await page.evaluate(()=>window.fixtureWallet.calls)).includes('personal_sign'));await page.keyboard.press('Escape');});
 await check('buy, equip and unequip a costume through the real UI',async()=>{await menu('btn-shop');await page.locator('[data-item="costume-deadpool"]').click();await page.waitForFunction(()=>window.HamsterSave.snapshot().profile.sqk===300);assert.equal(await page.locator('[data-item="costume-deadpool"]').textContent(),'Equip');await page.locator('[data-item="costume-deadpool"]').click();await page.waitForFunction(()=>window.HamsterSave.snapshot().profile.cosmetics.costume==='costume-deadpool');assert.equal(await page.locator('[data-item="costume-deadpool"]').textContent(),'Unequip');await page.screenshot({path:resolve(out,'owned-costume.png')});await page.locator('[data-item="costume-deadpool"]').click();await page.waitForFunction(()=>window.HamsterSave.snapshot().profile.cosmetics.costume===null);assert.equal((await page.evaluate(()=>window.HamsterSave.snapshot())).profile.sqk,300);});
 await check('all upgrades charge exactly once and become active immediately',async()=>{for(const[id,balance]of[['damage-10',250],['damage-20',200],['damage-25',50]]){await page.locator('[data-item="'+id+'"]').click();await page.waitForFunction(balance=>window.HamsterSave.snapshot().profile.sqk===balance,balance);assert(await page.locator('[data-item="'+id+'"]').isDisabled());}assert.equal(await page.locator('[data-item="damage-25"]').textContent(),'Owned · active');});
 await check('an insufficient-balance error leaves stored balance and inventory intact',async()=>{await page.locator('[data-item="costume-batman"]').click();await page.waitForFunction(()=>window.HamsterSave.snapshot().profile.sqk===0);await page.locator('[data-item="costume-samurai"]').click();await page.waitForFunction(()=>document.getElementById('item-error-costume-samurai').textContent.includes('Not enough SQK'));assert(!(await page.evaluate(()=>window.HamsterSave.snapshot())).profile.purchases.includes('costume-samurai'));await page.screenshot({path:resolve(out,'insufficient-balance.png')});});
 await page.keyboard.press('Escape');await page.reload();await page.waitForFunction(()=>window.HamsterSave.snapshot().cloud);
 await check('wallet reload restores owned items and balance without a guest merge',async()=>{const s=await page.evaluate(()=>window.HamsterSave.snapshot());assert.equal(s.profile.sqk,0);assert.equal(s.profile.purchases.length,5);});
 await check('lifetime board refreshes continuously from SQL and supports a manual refresh without any reset',async()=>{
  await page.clock.install();await admin('update hf_private.profiles set total_score=27 where user_id=$1',[uid]);await menu('btn-leaderboard');await page.waitForSelector('.leaderboard tbody tr');assert.equal(await page.locator('.leaderboard tbody tr td:nth-child(3)').textContent(),'27');assert.equal(await page.locator('#panel-title').textContent(),'Lifetime Top 100');assert(!(await page.locator('#panel-content').textContent()).includes('00:00'));await page.screenshot({path:resolve(out,'lifetime-board.png')});
  await admin('update hf_private.profiles set total_score=41 where user_id=$1',[uid]);await page.clock.fastForward(15001);await page.waitForFunction(()=>document.querySelector('.leaderboard tbody tr td:nth-child(3)')?.textContent==='41');await admin('update hf_private.profiles set total_score=49 where user_id=$1',[uid]);await page.getByRole('button',{name:'Refresh rankings',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.leaderboard tbody tr td:nth-child(3)')?.textContent==='49');await page.keyboard.press('Escape');
 });
 await check('ranking failure shows an error and a working retry without fake players',async()=>{
   lose='hf_lifetime_top100';await menu('btn-leaderboard');await page.waitForFunction(()=>document.getElementById('panel-content').textContent.includes('Injected uncertain response'));assert.equal(await page.locator('.leaderboard tbody tr').count(),0);await page.getByRole('button',{name:'Refresh rankings',exact:true}).click();await page.waitForSelector('.leaderboard tbody tr');await page.keyboard.press('Escape');
 });
 // Clearly labelled fixture rows exist only in this disposable test database.
 for(let i=0;i<100;i++){const id=randomUUID();await admin('insert into auth.users values($1)',[id]);await admin('insert into hf_private.profiles(user_id,name,total_score) values($1,$2,$3)',[id,'Fixture Player '+i,1000-i]);await admin('insert into hf_private.wallet_profiles values($1,$1,$2)',[id,'0x'+(i+1).toString(16).padStart(40,'0')]);}
 for(const width of[1440,390]){
  await page.setViewportSize({width,height:width===390?844:900});
  await check(width+': automatic refresh retains the table, focused control and reading position during loading and success',async()=>{
   await menu('btn-leaderboard');await page.waitForFunction(()=>document.querySelectorAll('.leaderboard tbody tr').length===100);
   await page.evaluate(()=>{window.retainedTable=document.querySelector('.leaderboard');document.getElementById('close-panel').focus({preventScroll:true});document.getElementById('player-dialog').scrollTop=1600;});
   holdBoard=true;await page.clock.fastForward(15001);for(let n=0;!releaseBoard&&n<100;n++)await new Promise(done=>setTimeout(done,10));assert(releaseBoard,'Refresh request did not arrive');
   assert.equal(await page.locator('#player-dialog').evaluate(d=>d.scrollTop),1600);assert.equal(await page.locator('.leaderboard tbody tr').count(),100);assert(await page.evaluate(()=>window.retainedTable===document.querySelector('.leaderboard')));
   releaseBoard();releaseBoard=null;await page.waitForFunction(()=>!document.querySelector('#panel-content button[aria-busy="true"]'));
   assert.equal(await page.locator('#player-dialog').evaluate(d=>d.scrollTop),1600);assert.equal(await page.evaluate(()=>document.activeElement.id),'close-panel');
  });
  await check(width+': a failed automatic refresh keeps the last known ranking readable and manual retry preserves focus',async()=>{
   failBoard=true;await page.clock.fastForward(15001);await page.waitForFunction(()=>document.getElementById('panel-content').textContent.includes('Showing the last loaded rankings.'));
   assert.equal(await page.locator('.leaderboard tbody tr').count(),100);assert.equal(await page.locator('#player-dialog').evaluate(d=>d.scrollTop),1600);assert.equal(await page.evaluate(()=>document.activeElement.id),'close-panel');
   failBoard=false;await page.getByRole('button',{name:'Refresh rankings',exact:true}).evaluate(b=>{b.focus({preventScroll:true});b.click();});
   await page.waitForFunction(()=>!document.querySelector('#panel-content .error'));assert.equal(await page.locator('#player-dialog').evaluate(d=>d.scrollTop),1600);assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Refresh rankings');
   await page.screenshot({path:resolve(out,'retained-rankings-'+width+'.png')});if(width===390)await audit(page,'retained-rankings');await page.keyboard.press('Escape');
  });
 }
 await check('a late leaderboard response cannot replace another open panel',async()=>{
   await menu('btn-leaderboard');await page.waitForFunction(()=>document.querySelectorAll('.leaderboard tbody tr').length===100);holdBoard=true;await page.clock.fastForward(15001);for(let n=0;!releaseBoard&&n<100;n++)await new Promise(done=>setTimeout(done,10));assert(releaseBoard);
   await page.keyboard.press('Escape');await menu('btn-profile');releaseBoard();releaseBoard=null;await page.waitForTimeout(100);assert.equal(await page.locator('#panel-title').textContent(),'Player profile');assert.equal(await page.locator('.leaderboard').count(),0);await page.keyboard.press('Escape');
 });
 await check('Change it on mobile and desktop equips the same owned inventory without charging',async()=>{
   for(const[width,control]of[[390,'btn-change'],[390,'btn-change-menu'],[1440,'btn-change']]){
     await page.setViewportSize({width,height:900});
     if(control==='btn-change-menu')await menu(control);else await page.locator('#'+control).click();
     assert.equal(await page.locator('#panel-title').textContent(),'Change it');
     const before=(await page.evaluate(()=>window.HamsterSave.snapshot())).profile.sqk;
     await page.locator('[data-item="costume-batman"]').click();await page.waitForFunction(()=>window.HamsterSave.snapshot().profile.cosmetics.costume==='costume-batman');
     assert.equal((await page.evaluate(()=>window.HamsterSave.snapshot())).profile.sqk,before);
     await page.locator('[data-item="costume-batman"]').click();await page.waitForFunction(()=>window.HamsterSave.snapshot().profile.cosmetics.costume===null);await page.keyboard.press('Escape');
   }
 });
 for(const width of[1440,390])await check(width+': disconnect resets all entry labels to the separate guest profile',async()=>{
   await admin('update hf_private.profiles set highest_map=4 where user_id=$1',[uid]);await page.setViewportSize({width,height:width===390?844:900});await page.reload();await page.waitForFunction(()=>window.HamsterSave.snapshot().cloud);
   assert.equal(await page.locator('#btn-start').textContent(),'Continue map 4');assert.equal(await page.locator('#hud-map').textContent(),'4');assert(await page.locator('#btn-replay').isVisible());
   await menu('btn-wallet');await page.getByRole('button',{name:'Disconnect',exact:true}).click();await page.keyboard.press('Escape');
   const s=await page.evaluate(()=>window.HamsterSave.snapshot());assert.equal(s.profile.highest_map,1);assert.equal(s.profile.sqk,0);assert.equal(await page.locator('#btn-start').textContent(),'Start adventure');assert.equal(await page.locator('#start-title').textContent(),'The chestnut forest');assert.equal(await page.locator('#hud-map').textContent(),'1');assert(await page.locator('#btn-replay').isHidden());
   await menu('btn-wallet');await page.getByRole('button',{name:'Connect MetaMask',exact:true}).click();await page.waitForFunction(()=>window.HamsterSave.snapshot().cloud);await page.keyboard.press('Escape');assert.equal(await page.locator('#btn-start').textContent(),'Continue map 4');
 });
 await page.setViewportSize({width:1440,height:900});
 await check('a second device stops the stale world and Profile offers recovery instead of a retry loop',async()=>{
   await page.locator('#btn-start').click();await page.waitForFunction(()=>window.__hamster.snapshot().state==='playing');
   await page.evaluate(async()=>{window.HamsterSave.record('forage',{source:'chest'},0);await window.HamsterSave.flush();});
   const second=await context.newPage();await second.goto(origin+'/preview/');await second.waitForFunction(()=>window.HamsterSave.snapshot().cloud);await second.evaluate(()=>window.__hamster.restart());
   await page.evaluate(async()=>{window.HamsterSave.record('forage',{source:'basket'},0);await window.HamsterSave.flush();});
   const s=await page.evaluate(()=>window.HamsterSave.snapshot());assert(s.runConflict);assert.equal(s.recoveryEvents,1);assert.equal(s.pendingEvents,0);assert.equal((await page.evaluate(()=>window.__hamster.snapshot())).state,'gameover');
   await menu('btn-profile');assert(await page.locator('#profile-recover').isVisible());assert(await page.locator('#profile-retry').isHidden());assert((await page.locator('#profile-save-state').textContent()).includes('Restart from cloud profile'));await page.screenshot({path:resolve(out,'run-conflict.png')});await second.close();
 });
 await check('recovery download retains rejected progress without Auth credentials and restart restores authoritative data',async()=>{
   await page.setViewportSize({width:390,height:844});await page.locator('#profile-recover').scrollIntoViewIfNeeded();assert(await page.locator('#player-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth));await page.screenshot({path:resolve(out,'run-conflict-390.png')});await audit(page,'run-conflict');
   const before=await page.evaluate(()=>window.HamsterSave.snapshot().profile),downloadEvent=page.waitForEvent('download');await page.locator('#profile-recovery-download').click();const download=await downloadEvent;await download.saveAs(resolve(out,'recovery-fixture.json'));
   const text=await readFile(resolve(out,'recovery-fixture.json'),'utf8'),record=JSON.parse(text);assert.equal(record.wallet,address);assert.equal(record.runs[0].events[0].source,'basket');assert(!/access_token|refresh_token|fixture-session/.test(text));
   await page.locator('#profile-recover').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>window.__hamster.snapshot().state==='playing');assert(await page.locator('#player-dialog').isHidden());
   const s=await page.evaluate(()=>window.HamsterSave.snapshot());assert(!s.runConflict);assert.equal(s.recoveryEvents,1);assert.equal(s.pendingEvents,0);assert.deepEqual(s.profile,before);assert.equal((await page.evaluate(()=>window.__hamster.snapshot())).map,before.highest_map);
   await page.reload();await page.waitForFunction(()=>window.HamsterSave.snapshot().cloud);assert.equal((await page.evaluate(()=>window.HamsterSave.snapshot())).recoveryEvents,1);await menu('btn-profile');assert(await page.locator('#profile-recovery-download').isVisible());assert(await page.locator('#profile-recover').isHidden());await page.keyboard.press('Escape');
 });
 await check('two browser tabs buying the same item deduct once in PostgreSQL',async()=>{await admin('update hf_private.profiles set sqk=100 where user_id=$1',[uid]);await page.evaluate(()=>window.HamsterSave.retry());const second=await context.newPage();await second.goto(origin+'/preview/');await second.waitForFunction(()=>window.HamsterSave.snapshot().cloud);await Promise.all([page.evaluate(()=>window.HamsterSave.purchase('costume-samurai')),second.evaluate(()=>window.HamsterSave.purchase('costume-samurai'))]);const p=await rpc('hf_profile',{},true);assert.equal(p.sqk,50);assert.equal(p.purchases.filter(i=>i==='costume-samurai').length,1);await second.close();});
 await check('a committed purchase with a lost HTTP reply can be retried once',async()=>{lose='hf_purchase';await menu('btn-shop');await page.locator('[data-item="costume-superman"]').click();await page.waitForFunction(()=>document.getElementById('item-error-costume-superman').textContent.length>0);await page.locator('[data-item="costume-superman"]').click();await page.waitForFunction(()=>window.HamsterSave.snapshot().profile.purchases.includes('costume-superman'));assert.equal((await page.evaluate(()=>window.HamsterSave.snapshot())).profile.sqk,0);await page.screenshot({path:resolve(out,'purchase-retried.png')});});
 await check('no script errors in wallet, purchase, error and ranking flows',async()=>assert.deepEqual(errors,[]));
 await writeFile(resolve(out,'results.json'),JSON.stringify({results,limitations:'Auth and signatures are test fixtures; SQL and UI are real.'},null,2));
 console.log(`${results.length} marketplace/wallet browser checks passed.`);
}catch(error){console.error(error.stack);process.exitCode=1;}finally{if(browser)await browser.close();if(server)await new Promise(done=>server.close(done));await db.close();}
