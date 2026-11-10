import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {decodeSave,validateState} from '../src/game/save.ts';
import {regionGarrison} from '../src/game/capacity.ts';
test('map-order browser fixture is a valid save with compatible owner production',()=>{
 const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-map-order-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
 const {state}=decodeSave(fixture.value);
 assert.equal(validateState(state),true);
 assert.equal(regionGarrison(state,0,fixture.source),12);
 assert.equal(state.provinces[fixture.target].owner,-1);
 assert.deepEqual(state.players[1].country,fixture.country);
 for(const region of [fixture.source,fixture.enemy]){
  const p=state.provinces[region];assert.ok(state.players[p.owner].loadout.includes(p.kind));
 }
});
