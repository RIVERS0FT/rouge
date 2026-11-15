import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/game/engine.ts';
import {encodeLocalFrame,applyLocalFrame} from '../src/platform/localFrames.ts';
const setup=[{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'warden',loadout:['infantry'],ai:true}];
const fixture=createGame(setup,13,'binary-local-frames');
function wire(encoded){const frame=structuredClone(encoded.frame,{transfer:encoded.transfer});assert.equal(encoded.frame.units.byteLength,0);return frame;}
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
 const duplicate=encodeLocalFrame(state,first.base).frame;duplicate.units[19]=duplicate.units[0];assert.throws(()=>applyLocalFrame(current,duplicate),/invalidSnapshot/);
 const flags=encodeLocalFrame(state,first.base).frame;flags.units[18]=2;assert.throws(()=>applyLocalFrame(current,flags),/invalidSnapshot/);
});
