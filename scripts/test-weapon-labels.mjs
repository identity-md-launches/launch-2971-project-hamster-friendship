import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture} from './major-fixture.mjs';
const html=await readFile('src/index.html','utf8');
for(const m of html.matchAll(/<button id="(slot-[123])"[^>]*aria-label="([^"]+)"[^>]*>(.*?)<\/button>/g)){
 const visible=m[3].replace(/<svg[\s\S]*?<\/svg>/g,'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();assert(m[2].startsWith(visible),m[1]);
}
const f=await fixture();await f.t.startGame(1,true);
function names(expected){for(let i=0;i<3;i++)assert(f.nodes.get('slot-'+(i+1)).getAttribute('aria-label').startsWith(expected[i]));}
names(['1 Gun —, not collected','2 Bomb —, not collected','3 Sword —, not collected']);
f.t.player.weapons=['shell','gun','bomb','sword'];f.t.player.ammo={gun:100,bomb:3};f.t.tick();
names(['1 Gun 100 bullets','2 Bomb 3 bombs','3 Sword ∞ uses']);
f.t.press('slot1');f.t.tick();assert.match(f.nodes.get('slot-1').getAttribute('aria-label'),/^1 Gun 100 bullets, selected/);
f.t.player.ammo.gun=1;f.t.press('throw');f.t.tick();assert.equal(f.nodes.get('slot-1').getAttribute('aria-label'),'1 Gun —, not collected');
console.log('4 weapon-label checks passed: initial markup, empty, owned/selected, depleted.');
