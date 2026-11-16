import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,createGame} from '../src/game/engine.ts';
import {MAP} from '../src/game/map.ts';
import {kernel} from '../src/game/groundKernel.ts';
import {PhysicsPool} from '../src/game/physicsPool.ts';

function fixture(){
 const state=createGame([{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'steward',loadout:['infantry'],ai:true}],81,'parallel-regression');
 state.tick=79;for(const u of state.units)u.cooldown=.1;return state;
}
test('a failed asynchronous frame completes exactly once, including scheduled AI commands',async()=>{
 const state=fixture(),expected=new Engine(state),actual=new Engine(state);expected.step();
 await actual.stepParallel(async()=>{throw Error('Worker unavailable');});
 assert.equal(actual.state.tick,80);assert.deepEqual(actual.state,expected.state);assert.deepEqual(actual.collision,expected.collision);
});
test('an outstanding physics job rejects overlapping steps and commands, then releases the lock',async()=>{
 const e=new Engine(fixture());let release;const gate=new Promise(resolve=>{release=resolve;});
 const pending=e.stepParallel(async()=>{await gate;throw Error('Worker unavailable');});
 await assert.rejects(e.stepParallel(async()=>{throw Error('unexpected');}),/already running/);
 assert.throws(()=>e.step(),/already running/);assert.throws(()=>e.command(0,{type:'upgrade',kind:'infantry',stat:'attack'}),/already running/);
 release();await pending;assert.equal(e.state.tick,80);
 assert.doesNotThrow(()=>e.command(0,{type:'upgrade',kind:'infantry',stat:'attack'}));
});
test('synchronous recovery replaces census views detached by navigation memory growth',async()=>{
 const state=fixture(),expected=new Engine(state),e=new Engine(state);expected.step();const buffer=kernel.memory.buffer;
 e.censusCounts=new Uint32Array(buffer,56*923*923,(state.players.length+1)*MAP.length);
 e.censusOccupants=new Uint32Array(buffer,58*923*923,MAP.length);e.censusNearOwner=new Int32Array(buffer,59*923*923,MAP.length);e.censusEngineers=new Uint8Array(buffer,60*923*923,MAP.length);
 kernel.memory.grow(1);assert.equal(e.censusOccupants.length,0);
 await e.stepParallel(async()=>{throw Error('Worker unavailable');});assert.deepEqual(e.state,expected.state);
});
class FakeWorker {
 terminated=false;onmessage;onerror;onmessageerror;
 constructor(fail=false){this.fail=fail;}
 postMessage(message){if(message.type==='init')queueMicrotask(()=>this.fail?this.onerror({message:'Initialization failed'}):this.onmessage({data:{type:'ready'}}));}
 terminate(){this.terminated=true;}
}
test('pool initialization failure rejects readiness and disposes every worker',async()=>{
 const workers=[],pool=new PhysicsPool(()=>{const w=new FakeWorker(workers.length===1);workers.push(w);return w;},2);
 await assert.rejects(pool.ready(),/Initialization failed|closed/);assert.ok(pool.failed);assert.ok(workers.every(w=>w.terminated));pool.dispose();
});
test('disposing a loading pool settles readiness instead of leaving an unresolved promise',async()=>{
 const worker=new FakeWorker();worker.postMessage=()=>{};const pool=new PhysicsPool(()=>worker,1),ready=pool.ready();pool.dispose();
 await assert.rejects(ready,/disposed|closed/);assert.ok(worker.terminated);
});
