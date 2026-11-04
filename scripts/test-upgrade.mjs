import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { fixture } from './test.mjs';
let count = 0;
async function check(name, fn) { await fn(); count++; console.log('ok', name); }
const f = await fixture(), rules = f.ctx.HamsterRules;
await check('SQK drop boundary is exactly 20%, independently of weapon drops', () => {
  let n=0; for(let i=0;i<100000;i++) if(rules.coinDrop(i/100000)) n++;
  assert.equal(n,20000); assert(rules.coinDrop(0)); assert(rules.coinDrop(0.199999)); assert(!rules.coinDrop(0.2));
});
await check('all four types, both sizes, map HP and damage come from shared rules', () => {
  for(const [i,type] of ['beetle','ant','larva','ember'].entries()) for(const [roll,size,hp] of [[0.1,'small',50],[0.8,'large',100]]) {
    const m=rules.monster(i/4+0.01,roll,3); assert.equal(m.type,type); assert.equal(m.size,size); assert.equal(m.hp,Math.ceil(hp*1.2**2)); assert.equal(m.damage,1.2**2);
  }
  assert.equal(rules.hp(3,true),432);
});
await check('every accepted random byte gives a balanced die face and rejected bytes retry', () => {
  const faces=[0,0,0,0,0,0]; for(let i=0;i<252;i++) faces[rules.die(bytes=>(bytes[0]=i,bytes))-1]++;
  assert.deepEqual(faces,[42,42,42,42,42,42]);let i=0;const bytes=[255,252,251];assert.equal(rules.die(buffer=>(buffer[0]=bytes[i++],buffer)),6);assert.equal(i,3);
});
await check('all 36 pairs yield exact HIGH/LOW/DRAW probabilities', () => {
  const counts={HIGH:0,LOW:0,DRAW:0};for(let a=1;a<=6;a++)for(let b=1;b<=6;b++) counts[rules.diceResult(a,b,'HIGH').outcome]++;
  assert.deepEqual(counts,{HIGH:15,LOW:15,DRAW:6});
});
await f.t.startGame(1,true);
await check('ineligible enemies drop no SQK; a repeated defeat cannot duplicate score or drops', () => {
  f.t.coinDrops.fill(false);const e=f.t.enemies[0];f.t.hitEnemy(e,e.hp,0,f.t.attack('shell'));f.t.hitEnemy(e,999,0);
  assert.equal(f.t.pickups.filter(p=>p.kind==='coin').length,0);assert.equal(f.ctx.HamsterSave.snapshot().profile.total_score,100);
});
await check('ranged ember monster fires a damaging fire projectile and a frontal shield blocks it', () => {
  const e=f.t.enemies[1];Object.assign(e,{type:'ember',state:'patrol',fireCd:1,x:150,y:146,vx:0,vy:0,damage:1.2});
  f.t.player.x=100; f.t.player.y=146;f.t.player.onGround=true;f.t.updateEnemy(e);
  const shot=f.t.shots.find(s=>s.kind==='fire');assert(shot);assert.equal(shot.damage,1.2);
  Object.assign(shot,{x:110,y:146,vx:-1.6,vy:0});f.t.player.shield=true;f.t.player.dir=1;f.t.updateShots();assert.equal(f.t.player.hp,1);assert(!f.t.shots.includes(shot));
  f.t.shots.push({kind:'fire',x:110,y:146,w:6,h:6,vx:-1.6,vy:0,g:0,life:30,spin:0,damage:1.2});f.t.player.shield=false;f.t.updateShots();assert.equal(f.t.game.state,'gameover');
});
await f.t.startGame(1,true);
await check('chest supplies shells only once',()=>{const chest=f.t.things.find(t=>t.kind==='chest'),shells=f.t.player.shells;f.t.interact(chest);f.t.interact(chest);assert.equal(f.t.player.shells,shells+6);});
const seed={name:'Existing Player',sqk:275,total_score:850,highest_map:4,purchases:['charged','shirt-blue'],cosmetics:{shirt:'shirt-blue'},unknownLegacyField:'retained'};
let draws=0;
const dice=await fixture({'hamster-friendship-v2-guest':JSON.stringify(seed)},{globals:{crypto:{randomUUID:()=>webcrypto.randomUUID(),getRandomValues(bytes){draws++;bytes[0]=5;return bytes;}}}}),save=dice.ctx.HamsterSave;
await check('legacy guest profile is enriched without losing balance, inventory or unknown fields',()=>{const p=save.snapshot().profile;assert.equal(p.sqk,275);assert.equal(p.highest_map,4);assert.equal(p.unknownLegacyField,'retained');assert.deepEqual(Array.from(p.purchases),seed.purchases);assert.equal(p.cosmetics.shirt,'shirt-blue');assert.equal(p.dice.wins,0);});
await check('dice uses two independent draws and request replay cannot increase wins',async()=>{const id=webcrypto.randomUUID();const r=await save.playDice('HIGH',id);assert.equal(draws,2);assert.equal(r.total,12);const retry=await save.playDice('HIGH',id);assert.equal(retry.total,12);assert.equal(draws,2);assert.equal(save.snapshot().profile.dice.correct,1);assert.equal(save.snapshot().profile.sqk,275);});
await check('milestones award exactly one Bronze, Silver and Gold Dice badge at 20/50/100',async()=>{
  for(let i=1;i<100;i++){await save.playDice('HIGH',webcrypto.randomUUID());if([19,20,49,50,99,100].includes(i+1)){const p=save.snapshot().profile;assert.equal(p.badges.filter(b=>b.source==='dice').length,i+1>=100?3:i+1>=50?2:i+1>=20?1:0);}}
  const p=save.snapshot().profile;assert.equal(p.dice.wins,100);assert.equal(p.dice.correct,100);assert.equal(p.sqk,275);
});
await check('Dice badges cannot be exchanged and invalid predictions do not consume a round',async()=>{await assert.rejects(()=>save.exchangeBadge('dice-gold'),/Only earned/);await assert.rejects(()=>save.playDice('DRAW'),/Choose HIGH or LOW/);assert.equal(save.snapshot().profile.dice.rounds,100);assert.equal(save.snapshot().profile.sqk,275);});
await check('draws are distinct from wrong predictions and never change SQK',()=>{assert.equal(rules.diceResult(1,6,'HIGH').correct,false);assert.equal(rules.diceResult(1,6,'LOW').outcome,'DRAW');assert.equal(rules.diceResult(1,1,'HIGH').correct,false);});
await dice.t.startGame(1,true); dice.t.showEnding();dice.t.showEnding();
await check('completion is idempotent and awards earned skill badges',()=>{const p=save.snapshot().profile;assert.equal(p.total_score,1850);assert.equal(p.badges.filter(b=>b.source==='skill').length,2);});
await check('concurrent exchange requests credit once and retain Dice achievements',async()=>{await Promise.all([save.exchangeBadge('skill-bronze'),save.exchangeBadge('skill-bronze')]);const p=save.snapshot().profile;assert.equal(p.sqk,295);assert(!p.badges.some(b=>b.id==='skill-bronze'));assert.equal(p.exchanged.filter(id=>id==='skill-bronze').length,1);assert.equal(p.badges.filter(b=>b.source==='dice').length,3);});
await check('exchanged skill badge is not re-earned on another map clear',async()=>{await dice.t.startGame(2,true);dice.t.showEnding();const p=save.snapshot().profile;assert(!p.badges.some(b=>b.id==='skill-bronze'));});
await check('dice stats, receipts, exchanges, old inventory and progression persist on reload',async()=>{const reloaded=await fixture(Object.fromEntries(dice.storage));const p=reloaded.ctx.HamsterSave.snapshot().profile;assert.equal(p.dice.wins,100);assert.equal(p.sqk,295);assert.equal(p.cosmetics.shirt,'shirt-blue');assert.equal(p.highest_map,4);assert(p.exchanged.includes('skill-bronze'));});
console.log(`${count} upgrade checks passed.`);
