import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {MAP} from '../src/game/map.ts';
import {encodeFrame,applyFrame} from '../src/platform/replication.ts';
const setup=[{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'warden',loadout:['infantry']}];
const wire=x=>JSON.parse(JSON.stringify(x));
test('all map search values are strings even for unnamed source geometries',()=>{
 for(const p of MAP)for(const field of [...p.name,p.code])assert.ok(typeof field==='string'&&field.length>0,p.code);
 assert.ok(MAP.some(p=>p.name.some(n=>n.toLocaleLowerCase().includes('江苏'))));
});
test('global replication applies ordered deltas without mutating earlier UI snapshots',()=>{
 const e=new Engine(createGame(setup,13));const initial=encodeFrame(e.state,undefined,1);const first=applyFrame(null,wire(initial.frame));
 e.step(2);assert.equal(e.command(1,{type:'upgrade',kind:'infantry',stat:'attack'}).ok,true);
 const update=encodeFrame(e.state,initial.base,1);assert.equal(update.frame.type,'delta');
 assert.ok(JSON.stringify(update.frame).length<JSON.stringify(initial.frame).length/3);
 const second=applyFrame(first,wire(update.frame));assert.deepEqual(second,e.state);
 assert.equal(first.players[1].upgrades.infantry.attack,0);assert.equal(second.players[1].upgrades.infantry.attack,1);
 assert.throws(()=>applyFrame({...first,tick:99},update.frame),/snapshotGap/);
 assert.equal(encodeFrame(e.state,undefined,1).frame.type,'state');
});
test('replication never sends another player pending talent candidates',()=>{
 const s=createGame(setup);s.players[0].choices=['drill'];s.players[1].choices=['march'];
 const a=encodeFrame(s,undefined,1);assert.deepEqual(a.frame.state.players[0].choices,[]);assert.deepEqual(s.players[0].choices,['drill']);
 const b=encodeFrame(s,a.base,1);assert.deepEqual(b.frame.state.players[0].choices,[]);assert.deepEqual(b.frame.state.players[1].choices,['march']);
});

test('full snapshots reject a different projection before rendering foreign coordinates',()=>{
 const s=createGame(setup);
 assert.throws(()=>applyFrame(null,{type:'state',state:{...s,map:'earth-admin1-mercator-v1',version:2}}),/incompatibleMap/);
 assert.throws(()=>applyFrame(null,{type:'state',state:{...s,version:2}}),/incompatibleMap/);
});
