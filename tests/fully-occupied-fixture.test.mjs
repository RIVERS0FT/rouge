import test from 'node:test';
import assert from 'node:assert/strict';
import {createFullyOccupiedFixture} from './fully-occupied-fixture.mjs';
import {MAP} from '../src/game/map.ts';
import {validateState,encodeSave,decodeSave} from '../src/game/save.ts';

test('acceptance fixture has 100 living AI and every playable region occupied, with legal save roundtrip',()=>{
 const {state}=createFullyOccupiedFixture();
 assert.equal(state.players.length,101);
 assert.equal(state.players.filter(p=>p.ai).length,100);
 for(const province of state.provinces){
  assert.equal(province.owner>=0,MAP[province.id].playable);
  if(province.owner>=0)assert.equal(province.kind,state.players[province.owner].loadout[0]);
 }
 for(const player of state.players){
  assert.ok(state.provinces.some(p=>p.owner===player.id));
  assert.ok(state.units.some(u=>u.owner===player.id));
 }
 assert.ok(state.units.length>5000);
 assert.equal(state.units.some(u=>u.owner<0),false);
 assert.equal(validateState(state),true);
 assert.deepEqual(decodeSave(encodeSave(state,'acceptance')).state,state);
});
