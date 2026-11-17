import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/game/engine.ts';
import {stats} from '../src/game/content.ts';
import {validateState,encodeSave,decodeSave,writeAutosave,readSave} from '../src/game/save.ts';

const state=createGame(['A','B'].map(name=>({name,leader:'warden',loadout:['infantry']})),39,'positive-health-save');

test('positive floating-point combat remnants save and restore without changing their health',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 for(const hp of [196-(196-2.842170943040401e-14),1.4210854715202004e-14,Number.EPSILON,Number.MIN_VALUE]){
  const snapshot=structuredClone(state);snapshot.units[0].hp=hp;
  assert.ok(hp>0);assert.ok(validateState(snapshot));assert.deepEqual(decodeSave(encodeSave(snapshot,'Surviving troop')).state,snapshot);
  writeAutosave(storage,snapshot,'Surviving troop');assert.deepEqual(readSave(storage,'auto').state,snapshot);
 }
});

test('dead, nonfinite and over-healed units still cannot enter a save',()=>{
 const snapshot=structuredClone(state),unit=snapshot.units[0],maximum=stats(snapshot.players[unit.owner],unit.kind).hp;
 for(const hp of [0,-Number.MIN_VALUE,-1,NaN,Infinity,maximum+.02]){
  unit.hp=hp;assert.equal(validateState(snapshot),false);assert.throws(()=>encodeSave(snapshot,'Invalid'),/invalidSave/);
 }
});
