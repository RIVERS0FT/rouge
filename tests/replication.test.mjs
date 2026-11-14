import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {MAP} from '../src/game/map.ts';
import {encodeFrame,applyFrame} from '../src/platform/replication.ts';
import {garrisonFixture} from './helpers/garrison-fixture.mjs';
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

test('authoritative local deltas retain AI choices and exact snapshots without resending idle neutral guards',()=>{
 const state=createGame([{...setup[0]},{...setup[1],ai:true}],77);state.players[1].choices=['industry'];state.players[1].drafts=1;
 const engine=new Engine(state),first=encodeFrame(engine.state,undefined,0,true),before=applyFrame(null,structuredClone(first.frame));
 assert.deepEqual(before,engine.state);
 const frozen=structuredClone(before);engine.step(2);
 const next=encodeFrame(engine.state,first.base,0,true),wire=structuredClone(next.frame),after=applyFrame(before,wire);
 assert.equal(wire.type,'delta');assert.ok(wire.neutral);assert.ok(wire.state.units.every(u=>u.owner>=0));
 assert.deepEqual(after,engine.state);assert.deepEqual(before,frozen);assert.deepEqual(after.players[1].choices,['industry']);
 assert.ok(JSON.stringify(wire).length<JSON.stringify(first.frame).length/3);
});

test('full snapshots reject a different projection before rendering foreign coordinates',()=>{
 const s=createGame(setup);
 assert.throws(()=>applyFrame(null,{type:'state',state:{...s,map:'earth-admin1-mercator-v1',version:2}}),/incompatibleMap/);
 assert.throws(()=>applyFrame(null,{type:'state',state:{...s,version:2}}),/incompatibleMap/);
});

test('local moving units reuse immutable route points across updates, replacement, arrival and death',()=>{
 const {e,from,to}=garrisonFixture({count:3});assert.ok(e.command(0,{type:'march',from,to,fraction:1}).ok);
 const initial=encodeFrame(e.state,undefined,0,true);let base=initial.base,client=applyFrame(null,structuredClone(initial.frame));
 const first=client,frozen=structuredClone(first),id=e.state.units.find(u=>u.travel).id;
 e.step(2);const second=encodeFrame(e.state,base,0,true),wire=structuredClone(second.frame);
 assert.ok(wire.reusedPaths.includes(id));assert.equal(wire.state.units.find(u=>u.id===id).travel.points.length,0);
 client=applyFrame(client,wire);base=second.base;assert.deepEqual(client,e.state);
 assert.equal(client.units.find(u=>u.id===id).travel.points,first.units.find(u=>u.id===id).travel.points);
 assert.deepEqual(first,frozen);
 const unit=e.state.units.find(u=>u.id===id);
 unit.travel={...unit.travel,points:structuredClone(unit.travel.points)};
 const replacement=encodeFrame(e.state,base,0,true);assert.ok(!replacement.frame.reusedPaths?.includes(id));
 client=applyFrame(client,structuredClone(replacement.frame));base=replacement.base;assert.deepEqual(client,e.state);
 // LAN deltas remain self-contained; local path omission is explicitly opt-in.
 assert.equal(encodeFrame(e.state,base,0).frame.reusedPaths,undefined);
 e.halt(unit);const arrived=encodeFrame(e.state,base,0,true);client=applyFrame(client,structuredClone(arrived.frame));base=arrived.base;assert.deepEqual(client,e.state);
 e.state.units=e.state.units.filter(u=>u.id!==id);const dead=encodeFrame(e.state,base,0,true);client=applyFrame(client,structuredClone(dead.frame));assert.deepEqual(client,e.state);
 const corrupt=structuredClone(second.frame);corrupt.reusedPaths.push(-1);assert.throws(()=>applyFrame(first,corrupt),/invalidSnapshot/);
 const duplicate=structuredClone(second.frame);duplicate.reusedPaths.push(id);assert.throws(()=>applyFrame(first,duplicate),/invalidSnapshot/);
 const absent=structuredClone(first);delete absent.units.find(u=>u.id===id).travel;assert.throws(()=>applyFrame(absent,structuredClone(second.frame)),/invalidSnapshot/);
});
