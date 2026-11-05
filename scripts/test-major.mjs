import assert from 'node:assert/strict';
import {fixture} from './major-fixture.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const results=[];
async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
const f=await fixture(),{t,ctx}=f,rules=ctx.HamsterRules;
await check('all four map durations, bosses and increasing HP are shared deterministic rules',()=>{
 assert.deepEqual(Array.from(rules.maps,m=>[m.seconds,m.boss]),[[60,'Cockroach'],[90,'Penguin'],[120,'Dragon'],[150,'Shark']]);
 for(let map=1;map<=4;map++){assert.equal(rules.hp(map,true),Math.ceil(300*1.2**(map-1)));for(let i=0;i<100;i++){const spec=rules.monster(i/100,0.2,map);assert(rules.environment(map).types.includes(spec.type));}}
 const counts={};for(let i=0;i<10000;i++){const k=rules.drop(i/10000);counts[k]=(counts[k]||0)+1;}assert.deepEqual(counts,{big:1000,small:4000,coin:2000,gun:1000,sword:1000,bomb:1000});
});
await check('all maps instantiate 30 matching enemies, correct bosses and exact appearance thresholds',async()=>{
 for(let map=1;map<=4;map++){await t.startGame(map,true);assert.equal(t.enemies.length,30);assert(t.enemies.every(e=>rules.environment(map).types.includes(e.type)));assert.equal(t.boss.type,rules.environment(map).boss);t.game.frames=rules.environment(map).seconds*60-1;t.updateBoss();assert.equal(t.boss.state,'sleep');t.game.frames++;t.updateBoss();assert.equal(t.boss.state,'waiting');assert(!t.things.some(o=>o.kind==='fragment'));t.render();}
});
await check('forest enemies remain airborne, with visible windup and swoop states instead of burrowing',async()=>{
 await t.startGame(1,true);const e=t.enemies[0];Object.assign(e,{x:400,homeX:400,y:124,homeY:124});t.player.x=460;
 for(let i=0;i<110;i++)t.updateEnemy(e);assert.equal(e.state,'windup');assert(e.y<145);for(let i=0;i<30;i++)t.updateEnemy(e);assert.equal(e.state,'swoop');assert(!['larva','buried','rise'].includes(e.type));
});
await check('glacier, caldera and reef enemies fire only matching ice, fire and water attacks',async()=>{
 for(let map=2;map<=4;map++){await t.startGame(map,true);const e=t.enemies[0];Object.assign(e,{x:400,homeX:400,y:140,homeY:140,fireCd:1});t.player.x=470;t.player.y=140;t.updateEnemy(e);assert(t.shots.length>0);assert(t.shots.every(s=>s.kind===rules.environment(map).attack));}
});
await check('elemental bosses have different timed volley, breath, slide and rush patterns',async()=>{
 for(const [map,state]of[[2,'stunned'],[3,'breath'],[4,'stunned']]){await t.startGame(map,true);Object.assign(t.boss,{state:'windup',t:1,moves:1});t.updateBoss();assert.equal(t.boss.state,state);if(map!==3)assert(t.shots.some(s=>s.kind===rules.environment(map).attack));else{t.boss.t=72;t.updateBoss();assert(t.shots.some(s=>s.kind==='fire'));}}
});
await check('boss defeat advances maps automatically while ordinary enemies remain alive',async()=>{
 for(let map=1;map<=3;map++){await t.startGame(map,true);t.game.frames=rules.environment(map).seconds*60;Object.assign(t.boss,{state:'idle'});t.damageBoss(t.boss.hp);t.boss.t=1;t.updateBoss();await new Promise(done=>setImmediate(done));assert.equal(ctx.__hamster.snapshot().map,map+1);assert.equal(t.game.state,'playing');assert.equal(t.enemies.length,30);}
 await t.startGame(4,true);t.boss.state='idle';t.damageBoss(t.boss.hp);t.boss.t=1;t.updateBoss();assert.equal(t.game.state,'ending');assert.equal(ctx.HamsterSave.snapshot().profile.highest_map,5);
});
await check('victory cannot be cancelled by a lingering attack or a fall during the defeat animation',async()=>{
 const a=await fixture(),q=a.t;await q.startGame(1,true);q.game.frames=3600;q.boss.state='idle';q.damageBoss(q.boss.hp);q.player.y=250;const enemy=q.enemies[0];enemy.x=q.player.x;enemy.y=q.player.y;q.shots.push({kind:'fire',hostile:true,x:q.player.x,y:q.player.y,w:6,h:6,vx:0,vy:0,g:0,life:100,spin:0});q.updateWorld();assert.equal(q.game.state,'playing');assert.equal(q.player.dead,false);q.boss.t=1;q.updateWorld();await new Promise(done=>setImmediate(done));assert.equal(a.ctx.__hamster.snapshot().map,2);
});
await check('page exit during a boss celebration records completion once before the next visit',async()=>{
 const a=await fixture(),q=a.t;await q.startGame(1,true);q.game.frames=3600;q.boss.state='idle';q.damageBoss(q.boss.hp);a.ctx.dispatchEvent(new Event('pagehide'));a.ctx.dispatchEvent(new Event('pagehide'));assert.equal(a.ctx.HamsterSave.snapshot().profile.highest_map,2);q.boss.t=1;q.updateBoss();await new Promise(done=>setImmediate(done));assert.equal(a.ctx.__hamster.snapshot().map,2);
});
await check('fruit and vegetables auto-collect on desktop, once, without any key',async()=>{
 await t.startGame(1,true);const p=t.pickups.find(p=>p.kind==='produce');p.phys=false;t.player.x=p.x;t.player.y=p.y;t.updatePickups();assert.equal(t.game.collected,1);t.updatePickups();assert.equal(t.game.collected,1);assert.equal(ctx.HamsterSave.snapshot().profile.produce_points>=1,true);
});
await check('weapons stay on the ground until E, on desktop and touch; only nearest weapon is claimed',async()=>{
 for(const touch of [false,true]){const a=await fixture({touch}),q=a.t;await q.startGame(1,true);const e=q.enemies[0];q.loot(e.id,'gun');q.hitEnemy(e,e.hp,0);const weapon=q.pickups.find(p=>p.kind==='weapon');weapon.phys=false;q.player.x=weapon.x;q.player.y=weapon.y;q.updatePickups();assert(!q.player.weapons.includes('gun'));q.press('interact');q.updatePickups();q.release();assert(q.player.weapons.includes('gun'));assert.equal(q.player.ammo.gun,100);q.updatePickups();assert.equal(q.player.ammo.gun,100);}
});
await check('every offered weapon in the outer pickup range can be collected by one explicit action',async()=>{
 for(const [dx,dy] of [[24,0],[-24,0],[28,24],[-28,-24],[29,0],[0,25]]){
  const a=await fixture(),q=a.t;await q.startGame(1,true);const e=q.enemies[0];q.loot(e.id,'gun');q.hitEnemy(e,e.hp,0);
  const weapon=q.pickups.find(p=>p.kind==='weapon');Object.assign(q.player,{x:96,y:146});Object.assign(weapon,{phys:false,x:96+dx,y:148+dy});
  const eligible=Math.abs(dx)<29&&Math.abs(dy)<25;assert.equal(Boolean(q.nearbyWeapon()),eligible);
  q.updatePickups();assert(!q.player.weapons.includes('gun'));q.press('interact');q.updatePickups();q.release();assert.equal(q.player.weapons.includes('gun'),eligible);assert.equal(weapon.taken,eligible);
 }
});
await check('one action takes the nearest eligible weapon even if a farther drop is processed first',async()=>{
 const a=await fixture(),q=a.t;await q.startGame(1,true);Object.assign(q.player,{x:96,y:146});
 for(const [i,kind,dx] of [[0,'gun',24],[1,'sword',28]]){const e=q.enemies[i];q.loot(e.id,kind);q.hitEnemy(e,e.hp,0);Object.assign(q.pickups.find(p=>p.target===e.id),{phys:false,x:96+dx,y:146});}
 q.press('interact');q.updatePickups();q.release();assert(q.player.weapons.includes('gun'));assert(!q.player.weapons.includes('sword'));assert.equal(q.player.ammo.gun,100);
 q.press('interact');q.updatePickups();q.release();assert(q.player.weapons.includes('sword'));
});
await check('growth triggers at every 20-point boundary and leaves collision dimensions/footing stable',async()=>{
 const a=await fixture(),q=a.t;await q.startGame(1,true);const before={w:q.player.w,h:q.player.h,x:q.player.x,y:q.player.y};
 q.addChestnuts(19);assert.equal(a.ctx.__hamster.snapshot().growth.tier,0);q.addChestnuts(1);assert.equal(a.ctx.__hamster.snapshot().growth.tier,1);assert(a.ctx.__hamster.snapshot().growth.scale>1.3);q.addChestnuts(20);assert.equal(a.ctx.__hamster.snapshot().growth.tier,2);assert.deepEqual({w:q.player.w,h:q.player.h,x:q.player.x,y:q.player.y},before);assert(rules.growth(1000000).scale<=2.05);q.render();
});
await check('SQK world size is exactly 70% of the prior dimensions, and defeat remains idempotent',async()=>{
 await t.startGame(1,true);const e=t.enemies[0];t.loot(e.id,'coin');t.hitEnemy(e,e.hp,0);t.hitEnemy(e,999,0);const coin=t.pickups.find(p=>p.kind==='coin');assert.equal(coin.w,36*0.7);assert(Math.abs(coin.h-31*0.7)<1e-10);assert.equal(t.pickups.filter(p=>p.kind==='coin').length,1);
});
await check('each weapon dispatches its own sound and retains original damage and ammo rules',async()=>{
 await t.startGame(1,true);for(const kind of ['shell','gun','sword','bomb']){if(!t.player.weapons.includes(kind))t.player.weapons.push(kind);t.player.ammo[kind]=3;t.player.weapon=kind;t.player.throwCd=0;t.press('throw');t.updatePlayer();t.release();assert.equal(f.sounds.at(-1),kind);}
 assert.equal(rules.damage('gun',[]),20);assert.equal(rules.damage('sword',[]),50);assert.equal(rules.damage('bomb',[]),5);assert.equal(rules.damage('gun',['damage-10','damage-20','damage-25']),31);
});
await check('guest scores never become a global board and existing local data stays untouched',async()=>{
 const legacy=JSON.stringify({name:'Retained',sqk:275,total_score:9999,purchases:['costume-batman']}),storage=new Map([['hamster-friendship-v2-guest',legacy]]);const a=await fixture({storage,config:{supabaseUrl:'',supabasePublishableKey:''}});assert.equal(a.ctx.HamsterSave.snapshot().profile.total_score,0);assert(a.ctx.HamsterSave.snapshot().localLegacyAvailable);assert.equal(storage.get('hamster-friendship-v2-guest'),legacy);await assert.rejects(()=>a.ctx.HamsterSave.leaderboard(),/existing Supabase/);
});
await mkdir('test/scratch/major',{recursive:true});await writeFile('test/scratch/major/game-results.json',JSON.stringify({results},null,2));console.log(results.length+' major engine checks passed.');
