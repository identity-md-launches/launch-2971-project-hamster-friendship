// Dependency-free gameplay/save tests against the original game, with a tiny
// headless canvas/DOM. Test-only access is injected into the VM, never exported.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

let count = 0;
function check(name, fn) { fn(); count++; console.log('ok', name); }
export async function fixture(seed = {}) {
  const storage = new Map(Object.entries(seed));
  const nodes = new Map();
  const context2d = new Proxy({}, { get: (o,k) => k in o ? o[k] : k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {}, set: (o,k,v) => (o[k]=v,true) });
  function node() { return { textContent: '', hidden: false, disabled: false, style: {}, dataset: {}, classList: { add() {}, remove() {} }, focus() {}, setAttribute() {}, addEventListener() {}, getContext: () => context2d }; }
  const document = { hidden: false, getElementById(id) { if (!nodes.has(id)) nodes.set(id,node()); return nodes.get(id); }, createElement: node, querySelectorAll: () => [], querySelector: () => null, addEventListener() {} };
  let time = 1000;
  const world = { document, console, crypto: webcrypto, navigator: { onLine: true }, performance: { now: () => time += 200 }, Uint8Array, setTimeout, clearTimeout, setInterval() {}, addEventListener() {}, requestAnimationFrame() {}, matchMedia: () => ({ matches:false, addEventListener() {} }), localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v) } };
  world.window = world;
  const ctx = vm.createContext(world);
  for (const file of ['config','rules','save']) vm.runInContext(await readFile(new URL('../src/'+file+'.js', import.meta.url),'utf8'),ctx);
  let source = await readFile(new URL('../src/game.js',import.meta.url),'utf8');
  source = source.replace('  // Title state uses a fresh world', `
    window.testing = {
      get player() { return player; }, get game() { return game; }, get enemies() { return enemies; },
      get boss() { return boss; }, get pickups() { return pickups; }, get shots() { return shots; },
      get burns() { return burns; }, get things() { return things; },
      startGame, respawn, gameOver, hurtPlayer, hitEnemy, damageBoss, updatePlayer, updateEnemy,
      updateBoss, updateShots, updateBurns, updatePickups, updateWorld, interact, available,
      showEnding, advanceDialogue, tick, render, pauseGame, resumeGame,
      press(action) { pressed[action]=true; }, hold(action,value) { held[action]=value; },
      loot(id,weapon) { mapLoot[id]=weapon; }, skills(values) { mapPurchases=values; },
      attack(kind) { var id=++attackId; event('attack',{attack:id,weapon:kind}); return id; }
    };
  // Title state uses a fresh world`);
  vm.runInContext(source,ctx);
  await ctx.HamsterSave.ready;
  return { ctx, t:ctx.testing, storage, nodes };
}

async function run() {
  let {ctx,t,storage,nodes} = await fixture();
  const rules=ctx.HamsterRules, save=ctx.HamsterSave;
  check('HP compounds 20% per map, with 100/500 on map 1', () => { assert.equal(rules.hp(1),100); assert.equal(rules.hp(1,true),500); assert.equal(rules.hp(2),120); assert.equal(rules.hp(2,true),600); assert.equal(rules.hp(3),144); });
  check('drop distribution is exactly 70/9/9/12 percent across 100,000 quantiles', () => { const counts={none:0,gun:0,sword:0,grenade:0}; for(let n=0;n<100000;n++) counts[rules.drop(n/100000)||'none']++; assert.deepEqual(counts,{none:70000,gun:9000,sword:9000,grenade:12000}); });
  check('all required catalogue prices are fixed', () => { assert.equal(rules.catalogue.find(i=>i.id==='vest').price,100); for(const i of rules.catalogue.filter(i=>i.slot==='shirt')) assert.equal(i.price,20); for(const i of rules.catalogue.filter(i=>i.slot==='shell')) assert.equal(i.price,100); assert.equal(rules.catalogue.find(i=>i.id==='charged').price,150); assert.equal(rules.catalogue.find(i=>i.id==='piercing').price,250); assert.equal(rules.catalogue.find(i=>i.id==='ricochet').price,300); });
  await t.startGame(1,true);
  check('the authored forest starts with exactly 30 regular enemies and one 500 HP boss', () => { assert.equal(t.enemies.length,30); assert(t.enemies.every(e=>e.hp===100)); assert.equal(t.boss.hp,500); assert.equal(t.player.hp,1); assert(!t.pickups.some(p=>p.kind==='berry')); });
  check('boss is absent before 60 active seconds and appears at 60', () => { t.game.frames=3599; t.updateBoss(); assert.equal(t.boss.state,'sleep'); t.game.frames=3600; t.updateBoss(); assert.equal(t.boss.state,'waiting'); });
  check('gun bullets deal 20 damage through the actual projectile collision path', () => { const e=t.enemies[0]; e.x=130;e.y=146;e.state='patrol'; t.shots.push({id:t.attack('gun'),kind:'gun',x:125,y:146,w:6,h:6,vx:5,vy:0,g:0,life:100,spin:0,hits:[]}); t.updateShots(); assert.equal(e.hp,80); });
  check('sword hits deal 50 through the actual collision path', () => { const e=t.enemies[0]; t.shots.push({id:t.attack('sword'),kind:'sword',x:e.x,y:e.y,w:28,h:18,vx:0,vy:0,g:0,life:1,spin:0,hits:[]}); t.updateShots(); assert.equal(e.hp,30); });
  const victim=t.enemies[0]; t.loot(0,'gun'); t.hitEnemy(victim,30,0,t.attack('shell'));
  check('each defeat drops one large SQK coin and the selected weapon', () => { assert.equal(t.pickups.filter(p=>p.kind==='coin').length,1); const coin=t.pickups.find(p=>p.kind==='coin'); assert.equal(coin.w,42); assert.equal(coin.h,36); assert.equal(t.pickups.find(p=>p.kind==='weapon').weapon,'gun'); });
  let coin=t.pickups.find(p=>p.kind==='coin'); coin.phys=false; t.player.x=coin.x; t.player.y=coin.y; t.updatePickups();
  check('coins require collection, then persist in guest storage', () => { assert.equal(save.snapshot().profile.sqk,1); assert.equal(JSON.parse(storage.get('hamster-friendship-v2-guest')).sqk,1); });
  t.hitEnemy(t.enemies[1],100,0,t.attack('shell'));
  t.hurtPlayer(1,0);
  check('one successful hit kills immediately and clears all uncollected coins', () => { assert.equal(t.game.state,'gameover'); assert.equal(t.player.hp,0); assert(!t.pickups.some(p=>p.kind==='coin')); assert.equal(save.snapshot().profile.sqk,1); });
  await t.respawn();
  check('retry restarts the same map and all 30 enemies, retaining SQK', () => { assert.equal(t.game.state,'playing'); assert.equal(t.enemies.length,30); assert.equal(t.player.x,96); assert.equal(save.snapshot().profile.sqk,1); assert.equal(ctx.__hamster.snapshot().map,1); });
  check('lanterns supply shells without healing or changing the map restart point', () => { const hp=t.player.hp; const x=t.game.checkpoint.x; t.interact(t.things.find(o=>o.kind==='lantern')); assert.equal(t.player.hp,hp); assert.equal(t.game.checkpoint.x,x); assert.equal(t.player.shells,22); });
  await t.startGame(1,true);
  check('shield facing an enemy blocks, while a hit from behind is fatal', () => { const e=t.enemies[0]; e.x=t.player.x+7; e.y=t.player.y; e.dir=-1; t.player.onGround=true;t.player.shield=true;t.player.dir=1;t.player.vy=0;t.updateEnemy(e); assert.equal(t.player.hp,1); e.x=t.player.x+2; t.player.dir=-1;t.updateEnemy(e); assert.equal(t.player.hp,0); });
  await t.startGame(1,true);
  check('falling also ends the map immediately', () => { t.player.y=240;t.updatePlayer();assert.equal(t.game.state,'gameover'); });
  await t.startGame(2,true);
  check('map 2 preserves the original world and scales enemies/boss to 120/600', () => { assert.equal(t.enemies.length,30);assert(t.enemies.every(e=>e.hp===120));assert.equal(t.boss.hp,600);t.render(); });
  await t.startGame(1,true);
  check('grenades create an area; each enemy inside takes 5 damage per second, not an instant burst', () => { const a=t.enemies[0],b=t.enemies[1]; a.x=b.x=140;a.y=b.y=146;a.state=b.state='patrol'; t.burns.push({id:t.attack('grenade'),x:120,y:120,w:80,h:48,life:480,ticks:0});for(let i=0;i<59;i++)t.updateBurns();assert.equal(a.hp,100);t.updateBurns();assert.equal(a.hp,95);assert.equal(b.hp,95);for(let i=0;i<420;i++)t.updateBurns();assert.equal(a.hp,60);assert.equal(t.burns.length,0); });
  await t.startGame(1,true);
  check('charged chestnuts gain 50% damage', () => assert.equal(rules.damage('shell',['charged']),37.5));
  check('piercing chestnuts stop after three different enemies', () => { t.skills(['piercing']);for(let i=0;i<4;i++){t.enemies[i].x=140;t.enemies[i].y=146;t.enemies[i].state='patrol';}t.shots.push({id:t.attack('shell'),kind:'shell',x:140,y:146,w:6,h:6,vx:0,vy:0,g:0,life:100,spin:0,hits:[],bounces:0});t.updateShots();assert.deepEqual(Array.from(t.enemies.slice(0,4),e=>e.hp),[75,75,75,100]);assert.equal(t.shots.length,0); });
  check('ricochet chestnuts bounce exactly once on solid terrain', () => { t.skills(['ricochet']);const s={id:100,kind:'shell',x:70*16,y:8*16,w:6,h:6,vx:1,vy:0,g:0,life:100,spin:0,hits:[],bounces:0};t.shots.push(s);t.updateShots();assert.equal(s.bounces,1);t.updateShots();assert.equal(t.shots.length,0); });
  check('boss gate and fragment still require the regular enemies to be defeated', () => { t.game.bossDefeated=true; assert.equal(t.available(t.things.find(o=>o.kind==='fragment')),false); });
  check('pause freezes active time and resumes', () => { t.pauseGame();const f=t.game.frames;t.tick();assert.equal(t.game.frames,f);t.resumeGame();assert.equal(t.game.state,'playing'); });
  await save.saveName('Forest Friend');
  ({ctx,t}=await fixture(Object.fromEntries(storage)));
  check('name, coins and score survive a new browser context', () => {assert.equal(ctx.HamsterSave.snapshot().profile.name,'Forest Friend');assert.equal(ctx.HamsterSave.snapshot().profile.sqk,1);});
  await assert.rejects(()=>ctx.HamsterSave.purchase('vest'),/Collect 99 more SQK/);count++;console.log('ok insufficient guest balance cannot purchase');
  const funded=await fixture({'hamster-friendship-v2-guest':JSON.stringify({name:'Fixture',sqk:1000,purchases:[],cosmetics:{}})});
  await funded.ctx.HamsterSave.purchase('charged'); await funded.ctx.HamsterSave.purchase('shirt-coral');await funded.ctx.HamsterSave.equip('shirt','shirt-coral');
  await funded.t.startGame(1,true);funded.t.hurtPlayer(1);await funded.t.respawn();
  check('purchases and equipped cosmetics survive death; skills activate on restart', () => { const p=funded.ctx.HamsterSave.snapshot().profile;assert.equal(p.sqk,830);assert.equal(p.cosmetics.shirt,'shirt-coral');assert(funded.ctx.__hamster.snapshot().purchases.includes('charged')); });
  await assert.rejects(()=>ctx.HamsterSave.leaderboard(),/owner connects Supabase/);count++;console.log('ok guest board is never represented as a global leaderboard');
  const complete=await fixture();await complete.t.startGame(1,true);
  await okComplete();
  async function okComplete() {
    for(const e of complete.t.enemies) complete.t.hitEnemy(e,100,0,complete.t.attack('shell'));
    complete.t.boss.state='idle';complete.t.damageBoss(500,complete.t.attack('shell'));
    check('all 31 defeated enemies including the boss drop exactly one SQK each',()=>assert.equal(complete.t.pickups.filter(p=>p.kind==='coin').length,31));
    for(let n=0;n<70;n++)complete.t.updateBoss();
    for(let n=0;n<4&&complete.t.game.state==='dialogue';n++)complete.t.advanceDialogue();
    const fragment=complete.t.things.find(o=>o.kind==='fragment');
    check('clearing every enemy opens the original fragment interaction',()=>assert.equal(complete.t.available(fragment),true));
    complete.t.interact(fragment);for(let n=0;n<6&&complete.t.game.state==='dialogue';n++)complete.t.advanceDialogue();
    check('the original story ending unlocks the next forest tier',()=>{assert.equal(complete.t.game.state,'ending');assert.equal(complete.ctx.HamsterSave.snapshot().profile.highest_map,2);});
    await complete.t.startGame(2,true);
    check('the next tier clears old drops and starts 30 fresh enemies',()=>{assert.equal(complete.t.enemies.length,30);assert.equal(complete.t.pickups.filter(p=>p.kind==='coin').length,0);assert.equal(complete.t.boss.hp,600);});
  }
  console.log(`${count} gameplay/economy/save checks passed.`);
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) await run();
