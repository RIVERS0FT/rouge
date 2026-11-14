import test from 'node:test';import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';import {MAP} from '../src/game/map.ts';
import {encodeFrame,applyFrame} from '../src/platform/replication.ts';
const game=()=>createGame([{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'warden',loadout:['infantry']}],42);
test('management partition is sent only on revisions and replica receives exact authoritative merge',()=>{
 const state=game(),home=state.provinces.find(p=>p.owner===0).id;
 const neighbor=MAP[home].neighbors.find(id=>MAP[id].playable&&state.provinces[id].owner===-1);
 assert.ok(neighbor!==undefined);state.provinces[neighbor].owner=0;
 const e=new Engine(state),first=encodeFrame(e.state,undefined,0);let client=applyFrame(null,structuredClone(first.frame));
 const quiet=encodeFrame(e.state,first.base,0);assert.equal(quiet.frame.type,'delta');assert.equal('grouping' in quiet.frame.state,false);assert.ok(JSON.stringify(quiet.frame).length<JSON.stringify(first.frame).length/3);
 const codes=new Map(MAP.map(p=>[p.code,p.id]));const own=e.state.grouping.groups.filter(g=>g.atoms.every(id=>e.state.provinces[codes.get(id)].owner===0));assert.equal(own.length,2);
 assert.equal(e.command(0,{type:'mergeGroups',groups:own.map(g=>g.id),expectedRevision:e.state.grouping.revision}).ok,true);
 const changed=encodeFrame(e.state,quiet.base,0);assert.ok(changed.frame.state.grouping);client=applyFrame(client,structuredClone(changed.frame));assert.deepEqual(client.grouping,e.state.grouping);
 const noChange=encodeFrame(e.state,changed.base,0);assert.equal('grouping' in noChange.frame.state,false);assert.deepEqual(applyFrame(client,noChange.frame).grouping,e.state.grouping);
 const mergedId=e.state.grouping.atomToGroup[own[0].atoms[0]],units=JSON.stringify(e.state.units),provinces=JSON.stringify(e.state.provinces);
 assert.equal(e.command(0,{type:'splitGroup',group:mergedId,atoms:own[0].atoms,expectedRevision:e.state.grouping.revision}).ok,true);
 assert.equal(JSON.stringify(e.state.units),units);assert.equal(JSON.stringify(e.state.provinces),provinces);
 const split=encodeFrame(e.state,noChange.base,0);client=applyFrame(client,structuredClone(split.frame));assert.deepEqual(client.grouping,e.state.grouping);
});
test('replicas reject forged incomplete administrative partitions rather than silently repairing them',()=>{
 const state=game(),frame=encodeFrame(state,undefined,0).frame;frame.state.grouping=structuredClone(frame.state.grouping);frame.state.grouping.groups.pop();assert.throws(()=>applyFrame(null,frame),/invalidSnapshot/);
});
