// Test-only access to the existing engine is injected into a VM, never exported.
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
export async function fixture({storage=new Map(),config,fetch,touch=false,game=true,audio=false,globals={}}={}) {
 const nodes=new Map(),events=new Map(),sounds=[];
 const drawing=new Proxy({}, {get:(o,k)=>k in o?o[k]:k==='createRadialGradient'?()=>({addColorStop(){}}):k==='measureText'?text=>({width:text.length*5}):()=>{},set:(o,k,v)=>(o[k]=v,true)});
 function node(id='') { const handlers=new Map(),attributes={};return {id,textContent:'',hidden:false,disabled:false,style:{setProperty(){}},dataset:{},classList:{add(){},remove(){},toggle(){}},focus(){},setAttribute(k,v){attributes[k]=v;},getAttribute(k){return attributes[k];},addEventListener(k,fn){if(!handlers.has(k))handlers.set(k,[]);handlers.get(k).push(fn);},dispatchEvent(e){for(const fn of handlers.get(e.type)||[])fn(e);},getContext:()=>drawing, getBoundingClientRect:()=>({left:0,top:0,width:96,height:96}),setPointerCapture(){}}; }
 const document={hidden:false,body:{dataset:{}},getElementById(id){if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id);},createElement:()=>node(),querySelectorAll:()=>[],querySelector:()=>null,addEventListener(k,fn){events.set('document:'+k,fn);}};
 let time=1000;
 const ctx={console,document,crypto:webcrypto,Event,TextEncoder,Uint8Array,AbortController,atob,location:{host:'fixture.example',origin:'https://fixture.example',pathname:'/game/'},navigator:{onLine:true},performance:{now:()=>time+=200},setTimeout,clearTimeout,setInterval(){},requestAnimationFrame(){},matchMedia:q=>({matches:touch&&q.includes('pointer: coarse'),addEventListener(){}}),
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k),key:i=>[...storage.keys()][i]??null,get length(){return storage.size;}},
 addEventListener(k,fn){if(!events.has(k))events.set(k,[]);events.get(k).push(fn);},dispatchEvent(e){for(const fn of events.get(e.type)||[])fn(e);},
 HamsterAudio:{sfx:kind=>sounds.push(kind),play(){},unlock(){}},fetch:fetch||(()=>Promise.reject(new Error('No network configured in fixture'))),...globals};
 ctx.window=ctx;vm.createContext(ctx);
 await vm.runInContext(await readFile('src/config.js','utf8'),ctx);if(config)ctx.HAMSTER_CONFIG=config;
 for(const file of ['rules','save',...(audio?['audio']:[])])vm.runInContext(await readFile('src/'+file+'.js','utf8'),ctx);
 if(game){
  let source=await readFile('src/game.js','utf8');source=source.replace('  // Title state uses a fresh world',`
  window.testing={get movement(){return movement;},get player(){return player;},get game(){return game;},get enemies(){return enemies;},get boss(){return boss;},get pickups(){return pickups;},get shots(){return shots;},get things(){return things;},get burns(){return burns;},
   startGame,updatePlayer,updateEnemy,updateBoss,updateShots,updateBurns,updatePickups,updateWorld,damageBoss,hitEnemy,completeMap,gameOver,render,tick,addChestnuts,dropLoot,newBoss,buildEntities,nearbyWeapon,advanceDialogue,moveBody,
   press(action){pressed[action]=true;},release(){pressed={};held={};},hold(action,on){held[action]=on;},loot(id,kind){mapLoot[id]=kind;},attack(kind){var id=++attackId;event('attack',{attack:id,weapon:kind});return id;}};
  // Title state uses a fresh world`);
  vm.runInContext(source,ctx);
 }
 return {ctx,t:ctx.testing,nodes,storage,events,sounds};
}
