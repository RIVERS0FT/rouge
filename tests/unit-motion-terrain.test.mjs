import test from 'node:test';
import assert from 'node:assert/strict';
import {MAP,provinceByCode} from '../src/game/map.ts';
import {TOWNS,buildingSegment} from '../src/game/buildings.ts';
import {terrainLocalSegment} from '../src/game/terrain-navigation.ts';
import {unitMotionSegment} from '../src/render/unitMotionSegment.ts';

const infantry={kind:'infantry'},id=provinceByCode('DEU-3487'),center=MAP[id].center;
test('interpolation rejects the full chord across a real house despite safe endpoints',()=>{
 const house=TOWNS[id][0],a={x:house.x-3,z:house.z},b={x:house.x+3,z:house.z};
 assert.ok(buildingSegment(a,a,.46));assert.ok(buildingSegment(b,b,.46));assert.ok(terrainLocalSegment(a,b));
 assert.equal(unitMotionSegment(a,b,infantry),false);
});
test('land interpolation accepts unobstructed ground and ships cannot cut across land',()=>{
 const a={x:center.x-3.2,z:center.z},b={x:center.x-3,z:center.z};
 assert.equal(unitMotionSegment(a,b,infantry),true);
 assert.equal(unitMotionSegment(a,b,{...infantry,transport:{embarked:true}}),false);
 const sea={x:0,z:0};assert.equal(unitMotionSegment(sea,{x:.2,z:0},infantry),false);
});
