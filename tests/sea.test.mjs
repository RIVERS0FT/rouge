import test from 'node:test';
import assert from 'node:assert/strict';
import {MAP,provinceByCode} from '../src/game/map.ts';
import {TerrainNavigator,terrainAt,terrainSegment,validateTravel,TERRAIN_REVISION} from '../src/game/terrain-navigation.ts';
const point=code=>MAP[provinceByCode(code)].center;
test('terrain navmesh plans certified land/coast/water segments across Channel',()=>{
 const a=point('GBR-3409'),b=point('FRA-5275'),nav=new TerrainNavigator(),path=nav.plan(a,b);assert.ok(path);assert.equal(path.revision,TERRAIN_REVISION);assert.ok(path.points.some(p=>p.sea));assert.ok(validateTravel(path,a,b));
 for(let i=1;i<path.points.length;i++)assert.ok(terrainSegment(path.points[i-1],path.points[i],path.points[i].sea));
 assert.deepEqual(nav.plan(a,b),path);assert.ok(new TerrainNavigator().plan(a,b));
 const forged=structuredClone(path);forged.points[1].x+=30;assert.equal(validateTravel(forged,a,b),false);
});
test('direct legal land segment stays direct instead of administrative center detours',()=>{
 const a=point('FRA-5275'),b={x:a.x+.01,z:a.z};assert.ok(terrainAt(a,true)>=0);assert.ok(terrainSegment(a,b,false));const p=new TerrainNavigator().plan(a,b);assert.equal(p.points.length,2);assert.deepEqual(p.points[1],{...b,sea:false});
});
test('invalid coordinates and sea-only endpoints cannot fabricate land orders',()=>{
 const nav=new TerrainNavigator(),a=point('GBR-3409');assert.equal(nav.plan({x:NaN,z:0},a),null);assert.equal(nav.plan({x:99999,z:0},a),null);assert.equal(nav.plan(a,a,0,1),null);
});
test('flow fields are physical only: administrative borders/owners are absent from API',()=>{
 const nav=new TerrainNavigator(),a=point('GBR-3409'),b=point('FRA-5275'),p=nav.plan(a,b),builds=nav.builds;assert.ok(builds>=1);assert.deepEqual(nav.plan(a,b),p);assert.equal(nav.builds,builds);nav.clear();assert.deepEqual(nav.plan(a,b),p);
});
test('Hubei to Hunan crosses the administrative boundary directly on continuous land',()=>{
 const a=point('CHN-1807'),b=point('CHN-1808'),path=new TerrainNavigator().plan(a,b);
 assert.ok(path);assert.equal(path.points.length,2);assert.equal(path.points[1].sea,false);assert.ok(validateTravel(path,a,b));
});
