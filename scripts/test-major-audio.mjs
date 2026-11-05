import assert from 'node:assert/strict';
import {fixture} from './major-fixture.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const results=[];async function check(name,fn){await fn();results.push({name,passed:true});console.log('ok',name);}
const nodes=[],oscillators=[];
function param(){return{value:0,calls:[],setValueAtTime(v,t){this.calls.push(['set',v,t]);},linearRampToValueAtTime(v,t){this.calls.push(['linear',v,t]);},exponentialRampToValueAtTime(v,t){this.calls.push(['exponential',v,t]);},setTargetAtTime(v,t,c){this.calls.push(['target',v,t,c]);}};}
class AudioFixture{
 constructor(){this.state='running';this.currentTime=1;this.destination={};}
 createGain(){const n={kind:'gain',gain:param(),connect(to){this.to=to;},disconnect(){}};nodes.push(n);return n;}
 createOscillator(){const n={type:'sine',frequency:param(),connect(to){this.to=to;},disconnect(){},start(t){this.startAt=t;},stop(t){this.stopAt=t;}};oscillators.push(n);return n;}
 createDynamicsCompressor(){const n={kind:'compressor',threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),connect(to){this.to=to;}};nodes.push(n);return n;}
 resume(){this.state='running';return Promise.resolve();}
}
const old={music:0.27,sfx:0.42,musicMuted:true,sfxMuted:false},storage=new Map([['hamster-friendship-audio',JSON.stringify(old)]]);
const f=await fixture({game:false,audio:true,storage,globals:{AudioContext:AudioFixture}}),audio=f.ctx.HamsterAudio;
await check('existing device volume and mute settings survive the upgrade',()=>{const s=audio.snapshot();for(const k of Object.keys(old))assert.equal(s[k],old[k]);});
await audio.unlock();
await check('each weapon builds a distinct oscillator/sweep/envelope signature',()=>{
 const signatures=[];for(const kind of ['shell','gun','sword','bomb']){const index=oscillators.length;audio.sfx(kind);signatures.push(JSON.stringify(oscillators.slice(index).map(n=>({type:n.type,frequency:n.frequency.calls,duration:n.stopAt-n.startAt}))));}assert.equal(new Set(signatures).size,4);
});
await check('the master compressor, conservative gain, per-effect rate limit and 24-voice ceiling bound overlap',()=>{
 const compressor=nodes.find(n=>n.kind==='compressor');assert.equal(compressor.threshold.value,-18);assert.equal(compressor.ratio.value,12);assert.equal(compressor.to.gain.value,0.65);
 const before=oscillators.length;for(let i=0;i<100;i++)audio.sfx('gun');assert.equal(oscillators.length,before);
 for(let i=0;i<100;i++)audio.sfx('unique-effect-'+i);assert.equal(oscillators.length,24);
 oscillators.forEach(n=>n.onended());const after=oscillators.length;audio.sfx('new-effect');assert(oscillators.length>after);
});
await check('SFX mute suppresses every weapon, and changing settings writes the original storage key',()=>{
 audio.set('sfxMuted',true);const before=oscillators.length;for(const k of ['shell','gun','sword','bomb'])audio.sfx(k);assert.equal(oscillators.length,before);audio.set('sfx',0.65);assert.equal(JSON.parse(storage.get('hamster-friendship-audio')).sfx,0.65);assert.equal(JSON.parse(storage.get('hamster-friendship-audio')).musicMuted,true);
});
await mkdir('test/scratch/major',{recursive:true});await writeFile('test/scratch/major/audio-results.json',JSON.stringify({results,limitations:['Graph/envelope checks use a Web Audio fixture. Speaker loudness and subjective listening have not been measured.']},null,2));console.log(results.length+' audio checks passed.');
