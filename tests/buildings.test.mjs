import test from 'node:test';
import assert from 'node:assert/strict';
import {MAP,provinceByCode,pointInProvince} from '../src/game/map.ts';
import {BUILDINGS,TOWNS,buildingClearance,buildingSegment,buildingStep,HOUSE_WIDTH,HOUSE_DEPTH} from '../src/game/buildings.ts';
import {TerrainNavigator,terrainLocalSegment,terrainClearance} from '../src/game/terrain-navigation.ts';
import {UNIT_RADIUS} from '../src/game/collision.ts';
const id=provinceByCode('DEU-3487'),c=MAP[id].center;
test('collision and rendered town share all four existing house transforms',()=>{
 assert.equal(TOWNS[id].length,4);
 for(const b of BUILDINGS){assert.ok(pointInProvince(b.province,b.x,b.z));assert.equal(buildingClearance(b,.62),0);assert.equal(buildingSegment(b,b,.46),false);}
});
test('a swept footprint cannot tunnel through a rotated house between clear endpoints',()=>{
 for(const b of TOWNS[id]){
  const a={x:b.x-3,z:b.z},d={x:b.x+3,z:b.z};assert.ok(buildingSegment(a,a,.46));assert.ok(buildingSegment(d,d,.46));assert.equal(buildingSegment(a,d,.46),false);
 }
 assert.equal(HOUSE_WIDTH,.5);assert.equal(HOUSE_DEPTH,.65);
});
test('local building detour reaches the other side, stays on land and never penetrates houses',()=>{
 for(const radius of [.46,.62]){
  let p={x:c.x-3.3,z:c.z};const goal={x:c.x+3.3,z:c.z};let detoured=false;
  for(let tick=0;tick<200&&Math.hypot(p.x-goal.x,p.z-goal.z)>.01;tick++){
   const next=buildingStep(p,goal,radius,.12,(a,b)=>terrainLocalSegment(a,b));assert.ok(buildingSegment(p,next,radius));assert.ok(terrainLocalSegment(p,next));assert.ok(Math.hypot(next.x-p.x,next.z-p.z)<=.12000001);detoured ||= Math.abs(next.z-c.z)>.5;p=next;
  }
  assert.ok(detoured);assert.ok(Math.hypot(p.x-goal.x,p.z-goal.z)<.01,JSON.stringify(p));
 }
});
test('a blocked goal cannot pull a unit into a building or across an illegal terrain segment',()=>{
 const from={x:c.x-3,z:c.z},goal=TOWNS[id][0];let p=from;
 for(let t=0;t<40;t++){const q=buildingStep(p,goal,.62,.2,()=>false);assert.deepEqual(q,p);p=q;}
});

test('town footprints leave real coastal embark and disembark waypoints clear',()=>{
 const nav=new TerrainNavigator(),destination=MAP[provinceByCode('FRA-5275')].center;
 for(const code of ['ABW-5150','AIA+99?']){
  const plan=nav.plan(MAP[provinceByCode(code)].center,destination);assert.ok(plan);
  for(let i=1;i<plan.points.length;i++)if(plan.points[i].sea!==plan.points[i-1].sea){
   const port=plan.points[i-1];assert.ok(buildingSegment(port,port,.62),`${code} port ${i-1}`);
  }
 }
});
