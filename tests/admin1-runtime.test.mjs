import test from 'node:test';import assert from 'node:assert/strict';
import {MAP,PLAYABLE_COUNT,TERRITORY_TOPOLOGY,INITIAL_TERRITORY_GROUPING,pointInProvince,MAP_METADATA} from '../src/game/map.ts';
import {validateTerritoryGrouping} from '../src/game/territoryGrouping.ts';
import {MAP_ID} from '../src/game/content.ts';
test('new atlas uses complete real NE Admin1 IDs, explicit old-map isolation and no fabricated 675 target',()=>{
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v3');assert.equal(MAP.length,1162);assert.equal(PLAYABLE_COUNT,1158);assert.equal(INITIAL_TERRITORY_GROUPING.groups.length,1162);
 assert.ok(MAP.some(p=>p.code==='CHN-1808'));assert.equal(MAP.some(p=>p.code.startsWith('STATE_')),false);
 assert.equal(validateTerritoryGrouping(TERRITORY_TOPOLOGY,INITIAL_TERRITORY_GROUPING),true);assert.match(MAP_METADATA.source,/Natural Earth/i);
});
test('every playable atom has land anchor, symmetric in-view edges and exactly one initial management owner',()=>{
 const codes=new Set();for(const p of MAP){assert.equal(codes.has(p.code),false);codes.add(p.code);assert.ok(INITIAL_TERRITORY_GROUPING.atomToGroup[p.code]);
  if(p.playable)assert.equal(pointInProvince(p.id,p.center.x,p.center.z),true,`${p.code} land anchor`);
  else assert.equal(p.neighbors.length,0);
  for(const n of p.neighbors){assert.ok(MAP[n].playable);assert.ok(MAP[n].neighbors.includes(p.id));}
 }
});
