import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/game/engine.ts';
import {countryActions} from '../src/game/countryActions.ts';
import {garrisonFixture} from './helpers/garrison-fixture.mjs';
import {applyFrame} from '../src/platform/replication.ts';
import {applyLocalFrame} from '../src/platform/localFrames.ts';
import {MAP} from '../src/game/map.ts';
import {reconcileGrouping} from '../src/game/territoryEconomy.ts';
const messages=[],timers=[];
let current=null;
const oldSelf=globalThis.self,oldTimeout=globalThis.setTimeout,oldClearTimeout=globalThis.clearTimeout;
globalThis.self={postMessage:(message,transfer=[])=>{const wire=structuredClone(message,{transfer});messages.push(wire);if(wire.type==='local')current=applyLocalFrame(current,wire);else if(wire.type==='state'||wire.type==='delta')current=applyFrame(current,wire);}};
globalThis.setTimeout=callback=>{const timer={callback,active:true};timers.push(timer);return timer;};
globalThis.clearTimeout=timer=>{if(timer)timer.active=false;};
await import('../src/platform/worker.ts');
const settle=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
const receive=async data=>{globalThis.self.onmessage({data});await settle();};
const advance=async()=>{const timer=timers.find(t=>t.active);assert.ok(timer,'worker scheduled its next frame');timer.active=false;timer.callback();await settle();};
const fresh=()=>createGame([{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'steward',loadout:['infantry']}],21,'worker-startup');
test('actual worker advertises readiness, initializes, applies upgrades and advances ticks',async()=>{
 assert.deepEqual(messages.shift(),{type:'ready'});
 await receive({type:'init',state:fresh()});assert.equal(messages.at(-1).type,'local');assert.equal(messages.at(-1).full,true);assert.equal(messages.at(-1).state.tick,0);
 await receive({type:'command',command:{type:'upgrade',kind:'infantry',stat:'attack'}});
 assert.deepEqual(messages.at(-2),{type:'result',result:{ok:true}});assert.equal(current.players[0].upgrades.infantry.attack,1);assert.equal(messages.at(-1).full,false);
 await advance();await advance();assert.equal(messages.at(-1).state.tick,2);
});
test('actual worker uses the authoritative percentage march contract and ignores a payload actor',async()=>{
 const {e,from,to}=garrisonFixture(),action=countryActions.march(from,to,.5);
 await receive({type:'init',state:e.state});
 const before=current;
 for(const invalid of [{...action,fraction:.6},{type:'march',from,to},{...action,fraction:'1'}]){
  await receive({type:'command',command:invalid});
  assert.deepEqual(messages.at(-2),{type:'result',result:{ok:false,error:'invalidCommand'}});
  assert.deepEqual(current,before);
 }
 const rival=before.provinces.find(p=>p.owner===1).id;
 await receive({type:'command',actor:1,command:countryActions.march(rival,to)});
 assert.deepEqual(messages.at(-2),{type:'result',result:{ok:false,error:'notOwner'}});
 assert.deepEqual(current,before);
 await receive({type:'command',command:action});
 assert.deepEqual(messages.at(-2),{type:'result',result:{ok:true}});
 assert.equal(current.provinces[from].march.pendingIds.length,6);
});
test('small loaded campaigns use the existing synchronous path without starting physics workers',async()=>{
 const previous=globalThis.Worker;
 let workers=0;
 globalThis.Worker=class {constructor(){workers++;throw Error('Unexpected physics worker');}};
 try{
  const {e}=garrisonFixture();
  await receive({type:'init',state:e.state});await advance();await advance();
  assert.equal(workers,0);assert.equal(current.tick,2);
 }finally{if(previous===undefined)delete globalThis.Worker;else globalThis.Worker=previous;}
});
test('actual worker explicitly rejects invalid initialization instead of appearing inert',async()=>{
 await receive({type:'init',state:{}});assert.deepEqual(messages.at(-1),{type:'error',error:'invalidSave'});
});
test('switching to double speed at an odd paused tick keeps publishing complete snapshots',async()=>{
 await receive({type:'init',state:fresh()});await advance();
 await receive({type:'pause',value:true});await receive({type:'command',command:{type:'production',province:-1,kind:'infantry'}});assert.equal(current.tick,1);
 await receive({type:'speed',value:2});await receive({type:'pause',value:false});await advance();assert.equal(current.tick,3);
 await advance();assert.equal(current.tick,5);
});
test('victory on an odd tick publishes the terminal state before stopping the clock',async()=>{
 const state=fresh();for(const p of state.provinces)if(MAP[p.id].playable&&p.owner!==1)p.owner=0;
 for(const u of state.units)u.owner=state.provinces[u.province].owner;
 state.grouping=reconcileGrouping(state);state.domination[0]=29.99;
 await receive({type:'init',state});assert.equal(current.winner,null);await advance();assert.equal(current.tick,1);assert.equal(current.winner,0);
 assert.equal(timers.some(timer=>timer.active),false);
});
test.after(()=>{globalThis.setTimeout=oldTimeout;globalThis.clearTimeout=oldClearTimeout;if(oldSelf===undefined)delete globalThis.self;else globalThis.self=oldSelf;});
