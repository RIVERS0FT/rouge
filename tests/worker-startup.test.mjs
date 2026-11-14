import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/game/engine.ts';
import {countryActions} from '../src/game/countryActions.ts';
import {garrisonFixture} from './helpers/garrison-fixture.mjs';
import {applyFrame} from '../src/platform/replication.ts';
const messages=[],timers=[];
let current=null;
const oldSelf=globalThis.self,oldInterval=globalThis.setInterval;
globalThis.self={postMessage:message=>{const wire=structuredClone(message);messages.push(wire);if(wire.type==='state'||wire.type==='delta')current=applyFrame(current,wire);}};
globalThis.setInterval=callback=>{timers.push(callback);return 0;};
await import('../src/platform/worker.ts');
globalThis.setInterval=oldInterval;
const receive=data=>globalThis.self.onmessage({data});
const fresh=()=>createGame([{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'steward',loadout:['infantry']}],21,'worker-startup');
test('actual worker advertises readiness, initializes, applies upgrades and advances ticks',()=>{
 assert.deepEqual(messages.shift(),{type:'ready'});
 receive({type:'init',state:fresh()});assert.equal(messages.at(-1).type,'state');assert.equal(messages.at(-1).state.tick,0);
 receive({type:'command',command:{type:'upgrade',kind:'infantry',stat:'attack'}});
 assert.deepEqual(messages.at(-2),{type:'result',result:{ok:true}});assert.equal(current.players[0].upgrades.infantry.attack,1);assert.equal(messages.at(-1).type,'delta');
 timers[0]();timers[0]();assert.equal(messages.at(-1).state.tick,2);
});
test('actual worker uses the authoritative full march contract and ignores a payload actor',()=>{
 const {e,from,to}=garrisonFixture(),action=countryActions.march(from,to);
 receive({type:'init',state:e.state});
 const before=current;
 for(const invalid of [{...action,fraction:.5},{type:'march',from,to},{...action,fraction:'1'}]){
  receive({type:'command',command:invalid});
  assert.deepEqual(messages.at(-2),{type:'result',result:{ok:false,error:'invalidCommand'}});
  assert.deepEqual(current,before);
 }
 const rival=before.provinces.find(p=>p.owner===1).id;
 receive({type:'command',actor:1,command:countryActions.march(rival,to)});
 assert.deepEqual(messages.at(-2),{type:'result',result:{ok:false,error:'notOwner'}});
 assert.deepEqual(current,before);
 receive({type:'command',command:action});
 assert.deepEqual(messages.at(-2),{type:'result',result:{ok:true}});
 assert.equal(current.provinces[from].march.pendingIds.length,11);
});
test('actual worker explicitly rejects invalid initialization instead of appearing inert',()=>{
 receive({type:'init',state:{}});assert.deepEqual(messages.at(-1),{type:'error',error:'invalidSave'});
});
test.after(()=>{if(oldSelf===undefined)delete globalThis.self;else globalThis.self=oldSelf;});
