import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/game/engine.ts';
import {encodeLocalFrame,applyLocalFrame} from '../src/platform/localFrames.ts';
const setup=[{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'warden',loadout:['infantry'],ai:true}];
const fixture=createGame(setup,13,'binary-local-frames');
function wire(encoded){const frame=structuredClone(encoded.frame,{transfer:encoded.transfer});assert.equal(encoded.frame.units.byteLength,0);return frame;}
test('large local army ledgers retain exact order, changed poses and routes across removals and additions',()=>{
 const state=structuredClone(fixture),position={x:1,z:2,sea:false};
 const formation={from:0,phase:'march',position,heading:0,columns:1,lastContact:0,route:{revision:'r',index:1,points:[position,{x:2,z:2,sea:false}]}};
 state.armies=Array.from({length:260},(_,id)=>({id:id+1,owner:0,to:1,formed:0,size:1,formation:structuredClone(formation)}));
 const first=encodeLocalFrame(state),initial=applyLocalFrame(null,wire(first)),frozen=structuredClone(initial);
 state.armies[1].formation.position={x:4,z:2};state.armies[2].formation.readyAt=undefined;
 state.armies[3].formation.route={...state.armies[3].formation.route,points:[position]};
 state.armies.splice(4,1);state.armies.unshift({...structuredClone(state.armies[0]),id:500});state.armies.reverse();state.tick++;
 const encoded=encodeLocalFrame(state,first.base),frame=wire(encoded);
 assert.equal(frame.state.armies.length,4);assert.equal(frame.armyOrder.length,260);
 assert.deepEqual(applyLocalFrame(initial,frame),state);assert.deepEqual(initial,frozen);
 for(const order of [[...frame.armyOrder,1],[...frame.armyOrder,999],frame.armyOrder.filter(id=>id!==500)]){
  assert.throws(()=>applyLocalFrame(initial,{...frame,armyOrder:order}),/invalidSnapshot/);
 }
});
test('transferable local frames retain complete state and AI choices without mutating previous UI snapshots',()=>{
 const state=structuredClone(fixture);state.players[1].choices=['industry'];state.players[1].drafts=1;
 const initial=encodeLocalFrame(state),before=applyLocalFrame(null,wire(initial)),frozen=structuredClone(before);
 state.tick+=2;state.units[0].x+=.000001;state.players[0].funds+=.1;
 const delta=encodeLocalFrame(state,initial.base),after=applyLocalFrame(before,wire(delta));
 assert.deepEqual(after,state);assert.deepEqual(before,frozen);assert.deepEqual(after.players[1].choices,['industry']);assert.equal(delta.frame.full,false);
});
test('immutable paths are reused, replaced, halted and removed with their original numeric precision',()=>{
 const state=structuredClone(fixture),u=state.units[0];u.travel={revision:'codec-test',index:1,points:[{x:u.x,z:u.z,sea:false},{x:u.x+.1234567890123,z:u.z,sea:false}]};
 const first=encodeLocalFrame(state);let current=applyLocalFrame(null,wire(first)),base=first.base;const points=current.units[0].travel.points;
 state.tick++;u.travel.index=1;const second=encodeLocalFrame(state,base);assert.equal(second.frame.paths.length,0);current=applyLocalFrame(current,wire(second));base=second.base;
 assert.equal(current.units[0].travel.points,points);assert.deepEqual(current,state);
 u.travel={...u.travel,points:structuredClone(u.travel.points)};const replacement=encodeLocalFrame(state,base);assert.equal(replacement.frame.paths.length,1);current=applyLocalFrame(current,wire(replacement));base=replacement.base;
 assert.notEqual(current.units[0].travel.points,points);assert.deepEqual(current,state);
 u.travel=undefined;u.transport=undefined;u.assault=undefined;const absent=encodeLocalFrame(state,base);current=applyLocalFrame(current,wire(absent));base=absent.base;assert.deepEqual(current,state);
 delete u.travel;delete u.transport;delete u.assault;const halted=encodeLocalFrame(state,base);current=applyLocalFrame(current,wire(halted));base=halted.base;assert.deepEqual(current,state);
 state.units.shift();const dead=encodeLocalFrame(state,base);current=applyLocalFrame(current,wire(dead));assert.deepEqual(current,state);
});
test('local decoding rejects sequence gaps, duplicate units and inconsistent optional-field flags',()=>{
 const state=structuredClone(fixture),first=encodeLocalFrame(state),current=applyLocalFrame(null,wire(first));
 const gap=encodeLocalFrame({...state,tick:2},first.base).frame;gap.baseTick=99;assert.throws(()=>applyLocalFrame(current,gap),/snapshotGap/);
 const duplicate=encodeLocalFrame(state,first.base).frame,width=duplicate.units.length/state.units.length;duplicate.units[width]=duplicate.units[0];assert.throws(()=>applyLocalFrame(current,duplicate),/invalidSnapshot/);
 const flags=encodeLocalFrame(state,first.base).frame;flags.units[18]=2;assert.throws(()=>applyLocalFrame(current,flags),/invalidSnapshot/);
});
