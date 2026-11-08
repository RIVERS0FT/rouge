import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {project,unproject,MAX_LATITUDE,WORLD_SCALE,groundMetric,WORLD_BOUNDS,PROJECTION_BOUNDS,PROJECTION_ID,worldViewDistance} from '../src/game/geo.ts';
import {MAP,containsPart,provinceAt,pointInProvince,provinceByCode,STARTS} from '../src/game/map.ts';
import {createGame,Engine} from '../src/game/engine.ts';
import {cellAt,cellCenter} from '../src/game/navigation.ts';
import {validateState,encodeSave,decodeSave} from '../src/game/save.ts';
const setup=[{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'steward',loadout:['infantry']}];
test('Miller independent control points, polar roundtrip and non-linear spacing',()=>{
 assert.equal(PROJECTION_ID,'miller-cylindrical');assert.equal(MAX_LATITUDE,90);
 // Numeric reference values use PROJ's published log-tan formula, not our inverse.
 for(const [lat,northing]of [[0,0],[30,309.17857350765],[45,482.9142387148044],[60,685.7351295095572],[80,1049.879507568664],[90,1319.7581721296185]]){
  assert.ok(Math.abs(project(0,lat).z+northing)<1e-9);
  assert.ok(Math.abs(project(0,-lat).z-northing)<1e-9);
 }
 for(const lon of [-180,-179.9,-74,0,116.4,179.9,180])for(const lat of [-90,-89,-80,-45,0,39.9,80,89,90]){
  const p=project(lon,lat),q=unproject(p.x,p.z);assert.ok(Math.abs(q.lon-lon)<1e-9);assert.ok(Math.abs(q.lat-lat)<1e-9);
 }
 assert.equal(project(0,100).z,project(0,90).z);assert.equal(project(0,-100).z,project(0,-90).z);
 assert.ok(Math.abs(project(0,90).z)>Math.abs(project(0,85.0511287798066).z));
 assert.ok(Math.abs(project(0,60).z)>2*Math.abs(project(0,30).z));
 const mercator60=-Math.log(Math.tan(Math.PI/4+Math.PI/6))*180/Math.PI*WORLD_SCALE;
 assert.ok(Math.abs(project(0,60).z)<Math.abs(mercator60));
 assert.throws(()=>project(NaN,0));assert.throws(()=>project(0,Infinity));assert.throws(()=>unproject(0,NaN));
});
test('Miller has directional, not isotropic, local ground factors',()=>{
 const m=groundMetric(project(0,60).z);
 assert.ok(Math.abs(m.eastWest-0.5)<1e-12);assert.ok(Math.abs(m.northSouth-Math.cos(48*Math.PI/180))<1e-12);
 const lat=60,phi=lat*Math.PI/180,step=1e-5,z=project(0,lat).z;
 const dx=project(step,lat).x-project(0,lat).x,dz=Math.abs(project(0,lat+step).z-z);
 assert.ok(Math.abs(m.eastWest*dx-step*WORLD_SCALE*Math.cos(phi))<1e-10);
 assert.ok(Math.abs(m.northSouth*dz-step*WORLD_SCALE)<1e-10);
 assert.deepEqual(groundMetric(0),{eastWest:1,northSouth:1});
});
test('Full Miller projection retains all source vertices; cropped camera fits multiple aspect ratios',()=>{
 const {left,right,top,bottom}=PROJECTION_BOUNDS;
 for(const p of MAP)for(const part of p.parts)for(const ring of part)for(const point of ring){assert.ok(point.x>=left-1e-7&&point.x<=right+1e-7);assert.ok(point.z>=top-1e-7&&point.z<=bottom+1e-7);}
 for(const aspect of [9/16,1,1.5,16/9,21/9]){
  const distance=worldViewDistance(aspect),height=2*distance*Math.tan(20*Math.PI/180)*0.8;
  assert.ok(height>=WORLD_BOUNDS.bottom-WORLD_BOUNDS.top-1e-8);assert.ok(height*aspect>=WORLD_BOUNDS.right-WORLD_BOUNDS.left-1e-8);
 }
 assert.throws(()=>worldViewDistance(0));assert.throws(()=>worldViewDistance(Infinity));assert.throws(()=>worldViewDistance(1,180));
});
test('picking identifies state-region anchors and empty oceans',()=>{
 const beijing=MAP.find(p=>p.code==='STATE_JIANGSU').center,california=MAP.find(p=>p.code==='STATE_CALIFORNIA').center,pacific=project(-140,0);
 assert.equal(MAP[provinceAt(beijing.x,beijing.z)].code,'STATE_JIANGSU');
 assert.equal(MAP[provinceAt(california.x,california.z)].code,'STATE_CALIFORNIA');
 assert.equal(provinceAt(pacific.x,pacific.z),-1);
});
test('holes are not land and date-line islands never span the world',()=>{
 const ring=[[0,0],[10,0],[10,10],[0,10]].map(([x,z])=>({x,z}));
 const hole=[[3,3],[7,3],[7,7],[3,7]].map(([x,z])=>({x,z}));
 assert.equal(containsPart([ring,hole],5,5),false);assert.equal(containsPart([ring,hole],1,1),true);
 for(const p of MAP.filter(p=>p.playable))for(const part of p.parts)for(const ring of part)for(let i=1;i<ring.length;i++)assert.ok(Math.abs(ring[i].x-ring[i-1].x)<=1800.001,p.code);
});
test('Miller saves keep high IDs and reject both legacy coordinate systems',()=>{
 const s=createGame(setup,10);assert.equal(s.provinces.length,675);assert.ok(validateState(s));assert.deepEqual(decodeSave(encodeSave(s,'Earth')).state,s);
 assert.equal(validateState({...s,map:'frontier-32-v1',version:1}),false);
 assert.equal(validateState({...s,map:'earth-admin1-mercator-v1',version:2}),false);
 assert.equal(validateState({...s,map:'earth-admin1-mercator-v1'}),false);
 assert.equal(validateState({...s,version:2}),false);
});
test('isolated islands have no fabricated neighbor across the sea',()=>{
 const hawaii=MAP.find(p=>p.code==='STATE_HAWAIIAN_ISLANDS');assert.ok(hawaii);assert.equal(hawaii.neighbors.length,0);
 const e=new Engine(createGame(setup));assert.equal(e.command(0,{type:'march',from:STARTS[0],to:hawaii.id,fraction:1}).ok,false);
});
test('local flow is shared, land-bounded, and orders preserve map positions',()=>{
 const e=new Engine(createGame(setup));const from=STARTS[0],target=MAP[from].neighbors.find(n=>e.state.provinces[n].owner<0);
 const flow=e.navigation.get(e.state,0,target,from);assert.equal(flow,e.navigation.get(e.state,0,target,from));assert.ok(flow.width*flow.height<50000);
 assert.equal(e.command(0,{type:'march',from,to:target,fraction:1}).ok,true);
 e.step(300);for(const u of e.state.units)assert.ok(pointInProvince(u.province,u.x,u.z),`unit ${u.id}`);
});

test('atlas is pinned to land state regions, not modern national administration',()=>{
 const atlas=JSON.parse(readFileSync(new URL('../src/generated/world.json',import.meta.url),'utf8'));
 assert.equal(atlas.format,3);assert.equal(atlas.coordinateSystem,'OGC:CRS84');assert.equal('projection' in atlas,false);
 const audit=JSON.parse(readFileSync(new URL('../data/state-regions-audit.json',import.meta.url),'utf8'));
 assert.equal(createHash('sha256').update(readFileSync(new URL('../src/generated/world.json',import.meta.url))).digest('hex'),audit.outputSha256);
 assert.equal(atlas.sourceVersion,'1.13.7');assert.equal(audit.coverageValid,true);assert.equal(audit.excludedSeaRegions,106);
 assert.equal(atlas.provinces.length,675);assert.ok(atlas.provinces.every(p=>p.sourceId<3000&&!('country' in p)&&!('countryName' in p)));
});
