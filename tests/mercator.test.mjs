import {test} from 'node:test';
import assert from 'node:assert/strict';
import {project,unproject,MAX_LATITUDE,WORLD_SCALE,groundScale} from '../src/game/geo.ts';
import {MAP,containsPart,provinceAt,pointInProvince,provinceByCode,STARTS} from '../src/game/map.ts';
import {createGame,Engine} from '../src/game/engine.ts';
import {cellAt,cellCenter} from '../src/game/navigation.ts';
import {validateState,encodeSave,decodeSave} from '../src/game/save.ts';
const setup=[{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'steward',loadout:['infantry']}];
test('Mercator control points, roundtrip, pole clamp and non-linear latitude spacing',()=>{
 for(const[lon,lat]of [[0,0],[116.4,39.9],[-74,40.7],[179.9,-45],[-179.9,80]]){const p=project(lon,lat),q=unproject(p.x,p.z);assert.ok(Math.abs(q.lon-lon)<1e-9);assert.ok(Math.abs(q.lat-lat)<1e-9);}
 assert.ok(Math.abs(project(0,MAX_LATITUDE).z+180*WORLD_SCALE)<1e-8);
 assert.equal(project(0,90).z,project(0,MAX_LATITUDE).z);
 assert.ok(Math.abs(project(0,60).z)>2*Math.abs(project(0,30).z));
 assert.ok(Math.abs(groundScale(project(0,60).z)-0.5)<1e-10);
 assert.throws(()=>project(NaN,0));
});
test('geographic picking identifies Beijing, California and empty oceans',()=>{
 const beijing=project(116.4,39.9),california=project(-119,36),pacific=project(-140,0);
 assert.equal(MAP[provinceAt(beijing.x,beijing.z)].code,'CHN-1155');
 assert.equal(MAP[provinceAt(california.x,california.z)].code,'USA-3521');
 assert.equal(provinceAt(pacific.x,pacific.z),-1);
});
test('holes are not land and date-line islands never span the world',()=>{
 const ring=[[0,0],[10,0],[10,10],[0,10]].map(([x,z])=>({x,z}));
 const hole=[[3,3],[7,3],[7,7],[3,7]].map(([x,z])=>({x,z}));
 assert.equal(containsPart([ring,hole],5,5),false);assert.equal(containsPart([ring,hole],1,1),true);
 for(const p of MAP.filter(p=>p.playable))for(const part of p.parts)for(const ring of part)for(let i=1;i<ring.length;i++)assert.ok(Math.abs(ring[i].x-ring[i-1].x)<=1800.001,p.code);
});
test('global saves retain high IDs and are not confused with legacy fictional maps',()=>{
 const s=createGame(setup,10);assert.equal(s.provinces.length,4596);assert.ok(validateState(s));assert.deepEqual(decodeSave(encodeSave(s,'Earth')).state,s);
 assert.equal(validateState({...s,map:'frontier-32-v1',version:1}),false);
});
test('isolated islands have no fabricated neighbor across the sea',()=>{
 const hawaii=MAP.find(p=>p.name[1]==='Hawaii');assert.ok(hawaii);assert.equal(hawaii.neighbors.length,0);
 const e=new Engine(createGame(setup));assert.equal(e.command(0,{type:'march',from:STARTS[0],to:hawaii.id,fraction:1}).ok,false);
});
test('local flow is shared, land-bounded, and orders preserve map positions',()=>{
 const e=new Engine(createGame(setup));const from=STARTS[0],target=MAP[from].neighbors.find(n=>e.state.provinces[n].owner<0);
 const flow=e.navigation.get(e.state,0,target,from);assert.equal(flow,e.navigation.get(e.state,0,target,from));assert.ok(flow.width*flow.height<50000);
 assert.equal(e.command(0,{type:'march',from,to:target,fraction:1}).ok,true);
 e.step(300);for(const u of e.state.units)assert.ok(pointInProvince(u.province,u.x,u.z),`unit ${u.id}`);
});
