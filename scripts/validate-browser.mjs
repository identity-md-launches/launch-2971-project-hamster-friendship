// Bounded production-export checks. No background server survives this script.
// Pass Playwright's index.mjs and, optionally, PGlite's dist/index.js.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';

if(!process.argv[2])throw new Error('Pass the installed Playwright index.mjs path.');
const pw=await import(pathToFileURL(resolve(process.argv[2])).href);
const root=resolve('dist'), out=resolve('test/scratch/browser-checks');await mkdir(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async(req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(!pathname.startsWith('/preview/')){res.writeHead(404).end();return;}
  const path=resolve(root,pathname.slice('/preview/'.length)||'index.html');
  if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{const data=await readFile(path);res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream'}).end(data);}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/preview/`;
const results=[],limitations=[];let current='';
async function check(name,fn){await fn();results.push({engine:current,name,passed:true});console.log('ok',current,name);}
async function dialogue(page){for(let i=0;i<8;i++){if(await page.evaluate(()=>window.__hamster.snapshot().state!=='dialogue'))return;await page.locator('#dlg-next').click();await page.waitForTimeout(135);}throw new Error('Dialogue did not end');}
async function state(page){return page.evaluate(()=>window.__hamster.snapshot());}
async function audit(page,name){if(!process.argv[5])return; if(!await page.evaluate(()=>Boolean(window.axe)))await page.addScriptTag({path:resolve(process.argv[5])});const result=await page.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});return {violations:r.violations,incomplete:r.incomplete.map(i=>({id:i.id,impact:i.impact,nodes:i.nodes.length})),passes:r.passes.length};});await writeFile(resolve(out,current+'-'+name+'-axe.json'),JSON.stringify(result,null,2));assert.deepEqual(result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})),[]);}
async function shot(page,name){await page.screenshot({path:resolve(out,`${current}-${name}.png`),fullPage:false});}
let browser;
try{
  for(const engine of ['chromium','webkit']){
    current=engine;
    try { browser=await pw[engine].launch({headless:true,...(engine==='webkit'&&process.argv[4]?{executablePath:resolve(process.argv[4])}:{})}); }
    catch(error) { if(engine!=='webkit')throw error; limitations.push({engine,reason:error.message});console.log('NOT RUN WebKit: browser runtime unavailable; see results.json.');continue; }
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true});
    const page=await context.newPage();const errors=[],failed=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',req=>failed.push(req.url()));
    await page.goto(base);await page.waitForFunction(()=>Boolean(window.__hamster));
    await check('390 first screen contains the game and visible Start action',async()=>{const b=await page.locator('#btn-start').boundingBox();assert(b.y>=0&&b.y+b.height<=844);assert(await page.locator('#game').isVisible());assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);});await shot(page,'390-start');await audit(page,'entry');
    await check('profile validates names, saves and restores focus',async()=>{await page.locator('#btn-profile').click();await page.locator('#player-name').fill('<>');await page.getByRole('button',{name:'Save name',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#name-result').textContent.includes('2–20'));assert.equal(await page.locator('#player-name').getAttribute('aria-invalid'),'true');await page.locator('#player-name').fill('Forest Runner');await page.getByRole('button',{name:'Save name',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#name-result').textContent.includes('saved'));await shot(page,'profile');await audit(page,'profile');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'btn-profile');});
    await check('marketplace lists all 10 items and blocks unaffordable purchases',async()=>{await page.locator('#btn-shop').click();assert.equal(await page.locator('.shop-item').count(),10);await page.locator('[data-item="vest"]').click();await page.waitForFunction(()=>document.querySelector('#item-error-vest').textContent.includes('100 more'));await shot(page,'shop');await audit(page,'shop');await page.locator('#player-dialog').evaluate(d=>d.scrollTop=d.scrollHeight);const close=await page.locator('#close-panel').boundingBox();assert(close.y>=0&&close.y+close.height<=844);await shot(page,'shop-bottom');await page.locator('#close-panel').click();});
    await check('unconfigured Top 100 tells the truth and has no seeded rankings',async()=>{await page.locator('#btn-leaderboard').click();await page.waitForFunction(()=>document.querySelector('#panel-content').textContent.includes('owner connects Supabase'));assert.equal(await page.locator('.leaderboard tbody tr').count(),0);await page.keyboard.press('Escape');});
    await check('MetaMask has a mobile opening link when no extension is available',async()=>{await page.locator('#btn-wallet').click();const href=await page.getByRole('link',{name:'Open in MetaMask',exact:true}).getAttribute('href');assert(href.startsWith('https://link.metamask.io/dapp/'));assert(href.endsWith('/preview/'));await shot(page,'wallet-empty');await audit(page,'wallet');await page.keyboard.press('Escape');});
    await check('guest start and original story dialogue work',async()=>{await page.locator('#btn-start').click();await page.waitForFunction(()=>window.__hamster.snapshot().state==='dialogue');const s=await state(page);assert.equal(s.state,'dialogue');assert.equal(s.enemyCount,30);assert.equal(s.regularHp,100);assert.equal(s.bossHp,500);});
    await check('paused dialogue is hidden, untabbable and cannot resume gameplay through covered clicks',async()=>{
      const text=await page.locator('#dlg-text').textContent();
      await page.locator('#btn-pause').click();
      const frame=(await state(page)).frame;
      assert(await page.locator('#dialogue').isHidden());
      assert.equal(await page.evaluate(()=>document.activeElement.id),'btn-resume');
      await shot(page,'390-paused-dialogue');
      await audit(page,'paused-dialogue');
      await page.keyboard.press('Tab');await page.keyboard.press('Tab');
      assert.notEqual(await page.evaluate(()=>document.activeElement.id),'dlg-next');
      for(let i=0;i<5;i++){await page.keyboard.press('Enter');await page.waitForTimeout(150);}
      for(let i=0;i<6;i++)await page.locator('#dlg-next').dispatchEvent('click');
      await page.waitForTimeout(500);
      assert.equal((await state(page)).state,'paused');
      assert.equal((await state(page)).frame,frame);
      assert(await page.locator('#screen-pause').isVisible());
      assert.equal(await page.locator('#dlg-text').textContent(),text);
      await page.locator('#btn-resume').click();
      assert.equal((await state(page)).state,'dialogue');
      assert(await page.locator('#dialogue').isVisible());
      assert(await page.locator('#screen-pause').isHidden());
      assert.equal(await page.evaluate(()=>document.activeElement.id),'dlg-next');
      assert.equal(await page.locator('#dlg-text').textContent(),text);
      await shot(page,'390-resumed-dialogue');
    });
    await check('a player menu preserves suspended dialogue until explicit Resume',async()=>{
      const text=await page.locator('#dlg-text').textContent();
      await page.locator('#btn-profile').click();
      assert.equal((await state(page)).state,'paused');
      assert(await page.locator('#dialogue').isHidden());
      await page.keyboard.press('Escape');
      const frame=(await state(page)).frame;
      await page.waitForTimeout(150);
      assert.equal((await state(page)).state,'paused');
      assert.equal((await state(page)).frame,frame);
      assert(await page.locator('#dialogue').isHidden());
      await page.keyboard.press('Escape');
      assert.equal((await state(page)).state,'dialogue');
      assert.equal(await page.locator('#dlg-text').textContent(),text);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'dlg-next');
      await dialogue(page);
      assert.equal((await state(page)).state,'playing');
    });
    await check('keyboard movement, original basket interaction and jump work',async()=>{const x=(await state(page)).x;await page.keyboard.down('ArrowRight');await page.waitForTimeout(350);await page.keyboard.up('ArrowRight');assert((await state(page)).x>x+15);await page.keyboard.press('KeyE');await page.waitForFunction(()=>window.__hamster.snapshot().state==='dialogue');assert((await page.locator('#dlg-text').textContent()).includes('basket'));await dialogue(page);await page.keyboard.down('Space');await page.waitForTimeout(120);assert((await state(page)).y<140);await page.keyboard.up('Space');await page.waitForFunction(()=>window.__hamster.snapshot().y===146);});
    await check('attack, shield and weapon swap controls work',async()=>{const shells=(await state(page)).shells;await page.keyboard.press('KeyX');await page.waitForTimeout(50);assert.equal((await state(page)).shells,shells-1);await page.keyboard.down('KeyC');await page.waitForTimeout(50);assert.equal((await state(page)).shield,true);await page.keyboard.up('KeyC');await page.keyboard.press('KeyQ');assert.equal((await state(page)).weapon,'shell');});
    await check('pause/resume and menus freeze active gameplay',async()=>{await page.locator('#btn-pause').click();const f=(await state(page)).frame;await page.waitForTimeout(100);assert.equal((await state(page)).frame,f);await page.locator('#btn-resume').click();assert.equal((await state(page)).state,'playing');await page.locator('#btn-profile').click();assert.equal((await state(page)).state,'paused');await page.keyboard.press('Escape');assert.equal((await state(page)).state,'paused');await page.locator('#btn-resume').click();});
    await check('mobile pointer controls move and jump',async()=>{await page.locator('[data-action="right"]').dispatchEvent('pointerdown',{pointerId:1});await page.waitForTimeout(100);await page.locator('[data-action="right"]').dispatchEvent('pointerup',{pointerId:1});const before=(await state(page)).y;await page.locator('[data-action="jump"]').dispatchEvent('pointerdown',{pointerId:2});await page.waitForTimeout(80);await page.locator('[data-action="jump"]').dispatchEvent('pointerup',{pointerId:2});assert((await state(page)).y<before);});
    await check('reload preserves the player name',async()=>{await page.reload();await page.waitForFunction(()=>document.querySelector('#save-summary').textContent.includes('Forest Runner'));});
    await check('320, 768 and 1440 widths have no horizontal overflow',async()=>{for(const width of [320,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);if(width===1440)await shot(page,'1440-start');}});
    await check('200% text enlargement keeps menu content reachable',async()=>{await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='200%');await page.locator('#btn-profile').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.locator('#player-name').fill('TwentyLettersAtMost');assert(await page.getByRole('button',{name:'Save name',exact:true}).isVisible());await shot(page,'enlarged-profile');await page.keyboard.press('Escape');await page.locator('#btn-shop').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.keyboard.press('Escape');await page.locator('#btn-leaderboard').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.keyboard.press('Escape');await page.locator('#btn-wallet').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);await page.keyboard.press('Escape');await page.evaluate(()=>document.documentElement.style.fontSize='');});
    await check('reduced motion and keyboard focus states render',async()=>{await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#btn-profile').focus();await page.keyboard.press('Tab');const outline=await page.evaluate(()=>getComputedStyle(document.activeElement).outlineWidth);assert.equal(outline,'3px');await shot(page,'focus-reduced-motion');});
    await check('production page has no JavaScript errors or failed resource requests',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);});
    await context.close();await browser.close();browser=null;
  }
  current='chromium-wallet';browser=await pw.chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
  const address='0x'+randomBytes(20).toString('hex');
  await page.addInitScript(({address})=>{
    const handlers={};window.walletFixture={calls:[],chain:'0x2105',address,reject:false};
    const provider={isMetaMask:true,on(name,fn){(handlers[name]??=[]).push(fn);},removeListener(name,fn){handlers[name]=(handlers[name]||[]).filter(f=>f!==fn);},async request({method,params}){window.walletFixture.calls.push(method);if(method==='eth_requestAccounts'&&window.walletFixture.reject)throw Object.assign(new Error('Declined'),{code:4001});if(method==='eth_accounts'||method==='eth_requestAccounts')return [window.walletFixture.address];if(method==='eth_chainId')return window.walletFixture.chain;if(method==='wallet_switchEthereumChain'){window.walletFixture.chain=params[0].chainId;(handlers.chainChanged||[]).forEach(fn=>fn(window.walletFixture.chain));return null;}throw new Error('Forbidden wallet method: '+method);}};
    window.walletFixture.emit=(name,value)=>(handlers[name]||[]).forEach(fn=>fn(value));
    window.addEventListener('eip6963:requestProvider',()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:{info:{rdns:'io.metamask',name:'MetaMask',uuid:crypto.randomUUID(),icon:''},provider}})));
  },{address});
  await page.goto(base);
  await check('EIP-6963 MetaMask connection switches to Ethereum Mainnet without signing',async()=>{await page.locator('#btn-wallet').click();await page.locator('#wallet-options').getByRole('button',{name:'Connect MetaMask',exact:true}).click();await page.waitForFunction(()=>window.HamsterWallet.snapshot().connected);const result=await page.evaluate(()=>({wallet:window.HamsterWallet.snapshot(),calls:window.walletFixture.calls}));assert.equal(result.wallet.chainId,'0x1');assert.equal(result.wallet.address,address);assert(result.calls.includes('wallet_switchEthereumChain'));assert(result.calls.every(c=>['eth_requestAccounts','eth_accounts','eth_chainId','wallet_switchEthereumChain'].includes(c)));});
  await check('wallet reconnect on reload uses eth_accounts without a new permission prompt',async()=>{await page.reload();await page.waitForFunction(()=>window.HamsterWallet.snapshot().address!=='');const calls=await page.evaluate(()=>window.walletFixture.calls);assert(calls.includes('eth_accounts'));assert(!calls.includes('eth_requestAccounts'));assert.equal(await page.locator('#btn-wallet').textContent(),'Switch to Mainnet');});
  await check('wrong-network recovery and account changes are handled',async()=>{await page.locator('#btn-wallet').click();await page.locator('#wallet-options').getByRole('button',{name:'Switch to Ethereum Mainnet',exact:true}).click();await page.waitForFunction(()=>window.HamsterWallet.snapshot().connected);await page.evaluate(()=>window.walletFixture.emit('accountsChanged',[]));assert.equal(await page.locator('#btn-wallet').textContent(),'Connect MetaMask');});
  await check('rejected wallet request leaves guest gameplay available',async()=>{await page.evaluate(()=>window.walletFixture.reject=true);await page.locator('#btn-wallet').click();await page.locator('#wallet-options').getByRole('button',{name:'Connect MetaMask',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#wallet-status').textContent.includes('declined'));await shot(page,'rejected');await page.keyboard.press('Escape');await page.locator('#btn-start').click();await page.waitForFunction(()=>window.__hamster.snapshot().state==='dialogue');});
  await context.close();await browser.close();browser=null;

  if(process.argv[3]){
    current='chromium-cloud';const {PGlite}=await import(pathToFileURL(resolve(process.argv[3])).href);const db=await PGlite.create();
    try{
      await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
      await db.exec(await readFile('supabase/migrations/001_friendship.sql','utf8'));
      const key=randomUUID(),sessions=new Map();let cloudUser,failProgress=false,failBoard=false;
      browser=await pw.chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/preview/config.js',route=>route.fulfill({contentType:'text/javascript',body:'window.HAMSTER_CONFIG='+JSON.stringify({supabaseUrl:'https://cloud.test',supabasePublishableKey:key})}));
      // Test instrumentation stays in this intercepted response only. It forces
      // projectile collision positions, then uses the real attack/hit/coin code.
      await page.route('**/preview/game.js',async route=>{
        const source=(await readFile('dist/game.js','utf8')).replace('  // Title state uses a fresh world',`window.testEncounter = function(target) {
          var e=enemies.find(function(enemy){return enemy.id===target;});
          e.state='patrol';
          for(var hit=0;hit<4;hit++){
            game.frames+=16;player.throwCd=0;player.weapon='shell';pressed.throw=true;updatePlayer();pressed={};
            var s=shots[shots.length-1];s.x=e.x-s.vx;s.y=e.y-s.vy-s.g;updateShots();
          }
          var coin=pickups.find(function(p){return p.kind==='coin'&&p.target===target;});
          coin.phys=false;player.x=coin.x;player.y=coin.y;updatePickups();player.x=96;player.y=146;
        };window.testChestnutColor=function(){game.state='playing';shots=[{kind:'shell',x:120,y:120,spin:0}];render();return Array.from(ctx.getImageData(120,122,1,1).data).slice(0,3);};\n  // Title state uses a fresh world`);
        await route.fulfill({contentType:'text/javascript',body:source});
      });
      await page.route('https://cloud.test/**',async route=>{
        const req=route.request(),path=new URL(req.url()).pathname,body=req.postDataJSON()||{};
        const respond=(status,data)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
        if(req.headers().apikey!==key){await respond(401,{message:'Invalid public key'});return;}
        if(path==='/auth/v1/signup'){
          cloudUser=randomUUID();const access=randomUUID();sessions.set(access,cloudUser);await db.exec('reset role');await db.query('insert into auth.users(id) values($1)',[cloudUser]);await respond(200,{access_token:access,refresh_token:access,expires_in:3600,user:{id:cloudUser}});return;
        }
        const name=path.split('/').at(-1),definitions={hf_profile:{p_name:'text'},hf_start_run:{p_map:'integer'},hf_progress:{p_run:'uuid',p_events:'jsonb'},hf_purchase:{p_item:'text'},hf_equip:{p_slot:'text',p_item:'text'},hf_top100:{}};
        if(name==='hf_progress'&&failProgress){await respond(503,{message:'Test connection interrupted.'});return;}
        if(name==='hf_top100'&&failBoard){await respond(503,{message:'Test rankings unavailable.'});return;}
        try{
          const def=definitions[name];if(!def)throw new Error('Unknown RPC');
          const user=sessions.get((req.headers().authorization||'').replace('Bearer ',''));
          await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec(user?'set role authenticated':'set role anon');
          const args=Object.keys(body);if(args.some(k=>!Object.hasOwn(def,k)))throw new Error('Unexpected RPC argument');
          const values=args.map(k=>def[k]==='jsonb'?JSON.stringify(body[k]):body[k]);
          let result;
          if(name==='hf_top100')result=(await db.query('select * from public.hf_top100()')).rows;
          else result=(await db.query('select public.'+name+'('+args.map((k,i)=>k+'=> $'+(i+1)+'::'+def[k]).join(',')+') as result',values)).rows[0].result;
          await respond(200,result);
        }catch(error){await respond(400,{message:error.message});}
      });
      await page.goto(base);await page.waitForFunction(()=>window.HamsterSave.snapshot().cloud);
      await check('Supabase Auth and profile RPC connect through the real client',async()=>{assert.equal(await page.evaluate(()=>window.HamsterSave.snapshot().profile.sqk),0);await page.locator('#btn-profile').click();await page.locator('#player-name').fill('Cloud Runner');await page.getByRole('button',{name:'Save name',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#name-result').textContent.includes('cloud profile'));await page.keyboard.press('Escape');});
      await page.locator('#btn-start').click();await page.waitForFunction(()=>window.__hamster.snapshot().state==='dialogue');await dialogue(page);
      await db.exec('reset role');await db.query("update hf_private.runs set started_at=clock_timestamp()-interval '1 hour' where user_id=$1",[cloudUser]);failProgress=true;
      await check('a defeated enemy creates collectible SQK and a durable cloud outbox',async()=>{await page.evaluate(()=>window.testEncounter(0));assert((await page.evaluate(()=>window.HamsterSave.snapshot().pendingCoins))===1);await page.evaluate(()=>window.HamsterSave.flush());assert((await page.evaluate(()=>window.HamsterSave.snapshot().status)).includes('pending'));});
      await check('pending coins survive reload and retry credits them exactly once',async()=>{await page.reload();await page.waitForFunction(()=>window.HamsterSave.snapshot().cloud);assert.equal(await page.evaluate(()=>window.HamsterSave.snapshot().pendingCoins),1);failProgress=false;await page.locator('#btn-profile').click();await page.getByRole('button',{name:'Retry cloud save',exact:true}).click();await page.waitForFunction(()=>window.HamsterSave.snapshot().pendingEvents===0);const p=await page.evaluate(()=>window.HamsterSave.snapshot().profile);assert.equal(p.sqk,1);assert.equal(p.total_score,100);assert.equal(await page.locator('#profile-sqk').textContent(),'1');assert.equal(await page.locator('#profile-total_score').textContent(),'100');await shot(page,'saved-profile');await page.keyboard.press('Escape');});
      await check('leaderboard loading failure has a working retry and real database results',async()=>{failBoard=true;await page.locator('#btn-leaderboard').click();await page.getByRole('button',{name:'Retry rankings',exact:true}).waitFor();failBoard=false;await page.getByRole('button',{name:'Retry rankings',exact:true}).click();await page.locator('.leaderboard tbody tr').waitFor();assert((await page.locator('.leaderboard').textContent()).includes('Cloud Runner'));assert((await page.locator('.leaderboard').textContent()).includes('100'));await shot(page,'leaderboard');await audit(page,'leaderboard');await page.keyboard.press('Escape');});
      await db.exec('reset role');await db.query('update hf_private.profiles set sqk=120 where user_id=$1',[cloudUser]);await page.reload();await page.waitForFunction(()=>window.HamsterSave.snapshot().cloud);
      await check('cloud purchase and cosmetic equipment use server-validated RPCs and persist',async()=>{await page.locator('#btn-shop').click();await page.locator('[data-item="shirt-blue"]').click();await page.waitForFunction(()=>document.querySelector('#shop-feedback').textContent.includes('purchased'));assert.equal(await page.evaluate(()=>window.HamsterSave.snapshot().profile.sqk),100);await page.locator('[data-item="shirt-blue"]').click();await page.waitForFunction(()=>window.HamsterSave.snapshot().profile.cosmetics.shirt==='shirt-blue');await page.locator('[data-item="shell-gold"]').click();await page.waitForFunction(()=>document.querySelector('#shop-feedback').textContent.includes('purchased'));await page.locator('[data-item="shell-gold"]').click();await page.waitForFunction(()=>window.HamsterSave.snapshot().profile.cosmetics.shell==='shell-gold');await page.keyboard.press('Escape');await page.reload();await page.waitForFunction(()=>window.HamsterSave.snapshot().cloud);assert.equal(await page.evaluate(()=>window.HamsterSave.snapshot().profile.cosmetics.shirt),'shirt-blue');assert.equal(await page.evaluate(()=>window.HamsterSave.snapshot().profile.sqk),0);});
      await check('equipped chestnut skin changes the actual projectile pixels',async()=>{assert.deepEqual(await page.evaluate(()=>window.testChestnutColor()),[242,196,91]);});
      await check('cloud interaction sequence has no uncaught JavaScript errors',async()=>assert.deepEqual(errors,[]));
      await context.close();await browser.close();browser=null;
    }finally{await db.close();}
  }
  await writeFile(resolve(out,'results.json'),JSON.stringify({checks:results,count:results.length,limitations},null,2));
  console.log(`${results.length} browser interaction checks passed.`);
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
