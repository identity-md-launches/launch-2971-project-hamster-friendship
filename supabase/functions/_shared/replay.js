import {loadEngine,engineHash} from './engine.js';
export {engineHash};
export const protocol='replay-1';
const clone=value=>JSON.parse(JSON.stringify(value));

// This adapter has no browser storage, transport, wallet, DOM input or render
// loop. Only persisted server state and validated control values reach physics.
export async function createReplay(config,saved=null) {
 const nodes=new Map(),emitted=[];
 const drawing=new Proxy({}, {get:(_,k)=>k==='createRadialGradient'?()=>({addColorStop(){}}):k==='measureText'?text=>({width:text.length*5}):()=>{}});
 function node(){return {textContent:'',hidden:false,disabled:false,style:{setProperty(){}},dataset:{},classList:{add(){},remove(){},toggle(){}},focus(){},setAttribute(){},getAttribute(){return null;},addEventListener(){},getContext:()=>drawing,getBoundingClientRect:()=>({left:0,top:0,width:320,height:192})};}
 const document={body:{dataset:{}},getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){}};
 const window={matchMedia:()=>({matches:false,addEventListener(){}}),addEventListener(){},dispatchEvent(){},requestAnimationFrame(){},
  HamsterSave:{beginMap:async()=>({loot:config.loot,monsters:config.monsters,purchases:config.skills}),snapshot:()=>({profile:config.profile||{highest_map:config.map,purchases:config.skills,produce_points:0,cosmetics:{}}}),subscribe(){},record(kind,data,frame){emitted.push({...data,kind,frame});return emitted.length;},input(){},checkpoint(){},flush(){}},
  HamsterAudio:{sfx(){},unlock(){},play(){}}};
 let time=0;
 loadEngine(window,document,{now:()=>time+=200},class {constructor(type){this.type=type;}});
 await window.replayEngine.init(config,saved?.world);
 emitted.length=0;
 const expected=clone(saved?.expected||[]);
 return {
  step(input){window.replayEngine.step(input);expected.push(...emitted.splice(0));},
  finish(){window.replayEngine.finish();expected.push(...emitted.splice(0));},
  expected,
  snapshot(){return {world:window.replayEngine.snapshot(),expected:clone(expected)};}
 };
}

const fields={attack:['attack','weapon'],hit:['attack','target'],defeat:['target'],pickup:['target'],forage:['source'],finish:['map'],death:[],checkpoint:[]};
function controls(input) {
 if(!input || Object.keys(input).some(k=>!['frame','ticks','held','pressed','touch','x','y','weapon'].includes(k)))throw Error('Invalid control record.');
 for(const key of ['frame','ticks','held','pressed'])if(!Number.isSafeInteger(input[key]))throw Error('Invalid control number.');
 if(input.frame<0||input.ticks<1||input.ticks>60||input.held<0||input.held>255||input.pressed<0||input.pressed>255||input.pressed&&input.ticks!==1)throw Error('Invalid control range.');
 if(typeof input.touch!=='boolean'||!Number.isFinite(input.x)||!Number.isFinite(input.y)||Math.hypot(input.x,input.y)>1.00000001||(!input.touch&&(input.x!==0||input.y!==0)))throw Error('Invalid movement vector.');
 if(!['shell','gun','bomb','sword'].includes(input.weapon))throw Error('Invalid weapon selection.');
}
// The caller obtains context exclusively from SQL. A request cannot supply a
// checkpoint, map, loot, player position, target position or reward amount.
export async function validateReplay(context,events) {
 if(!Array.isArray(events)||events.length<1||events.length>128||JSON.stringify(events).length>65536)throw Error('Submit 1–128 bounded game events.');
 const replay=await createReplay(context.config,context.state);
 let seq=context.seq,steps=0;
 const accepted=[];
 for(const event of events) {
  if(!Number.isSafeInteger(event.seq)||event.seq<1)throw Error('Missing event sequence.');
  if(event.seq<=seq)continue;
  if(context.status!=='active')throw Error('This map has already ended. Start it again.');
  if(event.seq!==seq+1)throw Error('Game events must arrive in order.');
  if(!Object.hasOwn(fields,event.kind)||!Number.isSafeInteger(event.frame)||event.frame<0)throw Error('Unknown game event.');
  if(event.frame>context.maxFrame)throw Error('Invalid game timing.');
  if(!Array.isArray(event.inputs)||event.inputs.length>120)throw Error('Movement replay is required. Keep the pending save and update the game.');
  for(const input of event.inputs) {
   controls(input);
   if(replay.expected.length)throw Error('A previous gameplay event was omitted.');
   for(let t=0;t<input.ticks;t++) {
    if(++steps>1800)throw Error('Replay batch is too large.');
    if(input.frame+t>context.maxFrame||input.frame+t>10368000)throw Error('Invalid game timing.');
    replay.step({...input,frame:input.frame+t});
    if(replay.expected.length && t<input.ticks-1)throw Error('A gameplay event was omitted from the controls.');
   }
  }
  // The player may quit a run, but a claimed death never manufactures loot.
  // Early completion is allowed only after the replay actually defeats a boss.
  if(!replay.expected.length && event.kind==='finish')replay.finish();
  if(!replay.expected.length && ['checkpoint','death'].includes(event.kind)) {
   const state=replay.snapshot().world;
   if(event.frame!==state.game.frames)throw Error('Checkpoint does not match the played frames.');
   if(event.kind==='death')context.status='dead';
  } else {
   const actual=replay.expected.shift();
   if(!actual||actual.kind!==event.kind||actual.frame!==event.frame||fields[event.kind].some(k=>actual[k]!==event[k]))throw Error('Gameplay claim does not match server movement, collision or pickup state.');
   if(event.kind==='death')context.status='dead';
   if(event.kind==='finish')context.status='complete';
  }
  const clean={kind:event.kind,seq:event.seq,frame:event.frame};
  for(const field of fields[event.kind])clean[field]=event[field];
  accepted.push(clean);seq=event.seq;
 }
 return {seq,state:replay.snapshot(),events:accepted};
}
