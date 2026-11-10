import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {MAP,provinceByCode,pointInProvince} from '../src/game/map.ts';
import {buildingSegment} from '../src/game/buildings.ts';
import {UNIT_RADIUS} from '../src/game/collision.ts';
import {TERRAIN_REVISION,terrainLocalSegment} from '../src/game/terrain-navigation.ts';
import {reconcileGrouping} from '../src/game/territoryEconomy.ts';
import {encodeSave,decodeSave,validateState} from '../src/game/save.ts';
const setups=[{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'steward',loadout:['infantry']}];
function fixture(n=1){
 const state=createGame(setups,21),id=provinceByCode('DEU-3487');state.units=[];
 for(const p of state.provinces){p.owner=-1;p.production=0;}
 state.provinces[id].owner=0;state.provinces[provinceByCode('USA-3521')].owner=1;state.grouping=reconcileGrouping(state);
 for(let i=0;i<n;i++)state.units.push({id:state.nextId++,owner:0,kind:'infantry',...MAP[id].center,hp:100,province:id,origin:id,target:null,destination:null,route:[],cooldown:0});
 return{state,id,center:MAP[id].center};
}
const clear=s=>s.units.every(u=>u.transport?.embarked||buildingSegment(u,u,UNIT_RADIUS[u.kind]));
test('initial spawn and production never overlap rendered houses for different unit sizes',()=>{
 for(const kind of ['infantry','cavalry','artillery','engineer']){
  const e=new Engine(createGame(setups.map(p=>({...p,loadout:[kind]})),21));assert.ok(clear(e.state));
  for(const p of e.state.provinces)if(p.owner>=0)p.production=30;
  for(let i=0;i<10;i++){e.step();assert.ok(clear(e.state));}
 }
});
test('old embedded garrison is repaired before first render, then settles naturally without fixed ring slots',()=>{
 const {state,id,center}=fixture(12),e=new Engine(state);assert.ok(clear(e.state));
 for(let i=0;i<200;i++){e.step();assert.ok(clear(e.state));}
 assert.ok(e.state.units.every(u=>u.province===id&&pointInProvince(id,u.x,u.z)));
 // Central attraction plus physical footprints, rather than an assigned circle.
 const distances=e.state.units.map(u=>Math.hypot(u.x-center.x,u.z-center.z));assert.ok(Math.max(...distances)-Math.min(...distances)>.1);
 assert.ok(e.state.units.every(u=>Math.hypot(u.x-center.x,u.z-center.z)<3.7));
 for(const a of e.state.units)for(const b of e.state.units)if(a.id<b.id)assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=.92-1e-3);
});
test('the engine follows a continuous building detour without centerline oscillation',()=>{
 const {state,id,center}=fixture(),u=state.units[0],goal={x:center.x+5,z:center.z};Object.assign(u,{x:center.x-5,z:center.z,target:id,destination:id});
 u.travel={revision:TERRAIN_REVISION,index:1,points:[{x:u.x,z:u.z,sea:false},{...goal,sea:false},{...center,sea:false}]};
 const e=new Engine(state),moving=e.state.units[0];let crossed=false;
 for(let i=0;i<400;i++){
  const before={x:moving.x,z:moving.z};e.step();assert.ok(buildingSegment(before,moving,.46));assert.ok(terrainLocalSegment(before,moving));
  if(moving.x>center.x+3){crossed=true;break;}
 }
 assert.ok(crossed,'must pass the town rather than oscillate at its perimeter');
});
test('capture from clear ground around the town completes and replay remains deterministic',()=>{
 const {state,id}=fixture(5);state.provinces[id].owner=-1;state.provinces[provinceByCode('DEU-1574')].owner=0;state.grouping=reconcileGrouping(state);
 for(const u of state.units){u.target=id;u.destination=id;}
 const e=new Engine(state);e.step(30);assert.ok(clear(e.state));
 assert.ok(validateState(e.state));const restored=new Engine(decodeSave(encodeSave(e.state,'town occupation')).state);
 e.step(180);restored.step(180);assert.deepEqual(e.state,restored.state);assert.equal(e.state.provinces[id].owner,0);assert.ok(clear(e.state));
});

test('an overcrowded tiny-region save never keeps unresolved troops inside a solid house',()=>{
 const {state}=fixture(12),id=provinceByCode('AND-4876');
 state.provinces[id].owner=0;state.grouping=reconcileGrouping(state);
 for(const u of state.units)Object.assign(u,{...MAP[id].center,province:id,origin:id});
 const e=new Engine(state);assert.ok(clear(e.state));e.step(40);assert.ok(clear(e.state));assert.equal(e.state.units.length,12);
 assert.ok(e.state.units.every(u=>pointInProvince(id,u.x,u.z)));
});
