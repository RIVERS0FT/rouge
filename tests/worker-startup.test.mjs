import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/game/engine.ts';
const messages=[],timers=[];
const oldSelf=globalThis.self,oldInterval=globalThis.setInterval;
globalThis.self={postMessage:message=>messages.push(structuredClone(message))};
globalThis.setInterval=callback=>{timers.push(callback);return 0;};
await import('../src/platform/worker.ts');
globalThis.setInterval=oldInterval;
const receive=data=>globalThis.self.onmessage({data});
const fresh=()=>createGame([{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'steward',loadout:['infantry']}],21,'worker-startup');
test('actual worker advertises readiness, initializes, applies upgrades and advances ticks',()=>{
 assert.deepEqual(messages.shift(),{type:'ready'});
 receive({type:'init',state:fresh()});assert.equal(messages.at(-1).type,'state');assert.equal(messages.at(-1).state.tick,0);
 receive({type:'command',command:{type:'upgrade',kind:'infantry',stat:'attack'}});
 assert.deepEqual(messages.at(-2),{type:'result',result:{ok:true}});assert.equal(messages.at(-1).state.players[0].upgrades.infantry.attack,1);
 timers[0]();timers[0]();assert.equal(messages.at(-1).state.tick,2);
});
test('actual worker explicitly rejects invalid initialization instead of appearing inert',()=>{
 receive({type:'init',state:{}});assert.deepEqual(messages.at(-1),{type:'error',error:'invalidSave'});
});
test.after(()=>{if(oldSelf===undefined)delete globalThis.self;else globalThis.self=oldSelf;});
