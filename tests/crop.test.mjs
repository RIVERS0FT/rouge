import {test} from 'node:test';
import data from '../src/generated/world.json' with {type:'json'};
import assert from 'node:assert/strict';
import {project,unproject,WORLD_BOUNDS as B,WORLD_CENTER,MAP_ASPECT,NORTH_LATITUDE,SOUTH_LATITUDE,wrapX,nearestWorldX} from '../src/game/geo.ts';
import {clipSegment,clipTriangle,visiblePart,landSpans,inRect,signedArea} from '../src/game/crop.ts';
import {MAP,PLAYABLE_COUNT,provinceAt,pointInProvince,navigableInProvince,STARTS,searchProvinces} from '../src/game/map.ts';
import {Engine,createGame} from '../src/game/engine.ts';
import {Navigator,cellCenter} from '../src/game/navigation.ts';
import {validateState,writeSave,listSaves,deleteSave,SAVE_PREFIX} from '../src/game/save.ts';
import {applyFrame} from '../src/platform/replication.ts';
const setups=[{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'steward',loadout:['infantry']}];
const ring=points=>points.map(([x,z])=>({x,z}));
const box={left:0,right:10,top:0,bottom:10};
test('asymmetric crop uses unchanged Miller scale, exact reference aspect and nonzero camera center',()=>{
 assert.equal(NORTH_LATITUDE,74);assert.ok(Math.abs(SOUTH_LATITUDE+58.64021112066765)<1e-10);
 assert.ok(Math.abs((B.right-B.left)/(B.bottom-B.top)-MAP_ASPECT)<1e-12);
 assert.equal(Math.abs(project(0,0).z),0);assert.ok(WORLD_CENTER.z<0);
 assert.ok(Math.abs((0-B.top)/(B.bottom-B.top)-0.5811219)<1e-6);
 assert.ok(Math.abs(unproject(0,project(0,89).z).lat-89)<1e-9); // inverse is NOT cropped/clamped at 74
});
test('segment clipping intersects, never clamps an entirely external edge into the map',()=>{
 assert.equal(clipSegment({x:1,z:-5},{x:9,z:-1},box),null);
 assert.deepEqual(clipSegment({x:2,z:-2},{x:8,z:4},box),[{x:4,z:0},{x:8,z:4}]);
 assert.equal(clipSegment({x:-1,z:0},{x:0,z:-1},box),null);
 assert.equal(clipSegment({x:-1,z:-1},{x:0,z:0},box),null); // corner-only contact
});
test('triangle crop preserves area and input coordinates; no offscreen vertices',()=>{
 const input=ring([[2,-2],[8,4],[2,4]]),before=structuredClone(input),clipped=clipTriangle(input,box);
 assert.deepEqual(input,before);assert.ok(Math.abs(signedArea(clipped))===16);
 assert.ok(clipped.every(p=>inRect(p,box)));assert.equal(clipTriangle(ring([[0,-4],[9,-4],[0,-1]]),box).length,0);
});
test('scanline intersection preserves holes, handles concave disconnected lobes, rejects zero area',()=>{
 const outer=ring([[0,0],[10,0],[10,10],[0,10]]),hole=ring([[3,3],[7,3],[7,7],[3,7]]);
 const partial={...box,top:5},info=visiblePart([outer,hole],partial);
 assert.ok(Math.abs(info.area-42)<1e-9);assert.deepEqual(landSpans([outer,hole],6,partial),[[0,3],[7,10]]);
 const u=ring([[0,0],[10,0],[10,10],[7,10],[7,3],[3,3],[3,10],[0,10]]);
 assert.equal(visiblePart([u],{...box,top:4}).area,36);
 assert.deepEqual(landSpans([u],5,box),[[0,3],[7,10]]);
 assert.equal(visiblePart([outer],{...box,top:10,bottom:12}),null);
});
test('triangle-first clipping never bridges disconnected lobes or paints a hole',()=>{
 // A U already tessellated into 6 triangles. Clip away the bottom connecting bar.
 const triangles=[[[0,0],[10,0],[10,3]],[[0,0],[10,3],[0,3]],[[0,3],[3,3],[3,10]],[[0,3],[3,10],[0,10]],[[7,3],[10,3],[10,10]],[[7,3],[10,10],[7,10]]];
 const r={...box,top:4},clipped=triangles.map(t=>clipTriangle(ring(t),r));
 assert.equal(clipped.reduce((s,p)=>s+Math.abs(signedArea(p)),0),36);
 for(const poly of clipped)assert.ok(poly.every(p=>p.x<=3)||poly.every(p=>p.x>=7));
});
test('four excluded source IDs remain stable but cannot be picked, searched or navigated',()=>{
 assert.equal(MAP.length,4596);assert.equal(PLAYABLE_COUNT,4592);
 assert.deepEqual(MAP.filter(p=>!p.visible).map(p=>p.code),['ATA+00?','ATA+99?','GRL-2738','NOR-901']);
 for(const p of MAP.filter(p=>!p.visible)){
  assert.equal(p.playable,false);assert.deepEqual(p.neighbors,[]);
  assert.equal(pointInProvince(p.id,p.center.x,p.center.z),false);
  assert.equal(searchProvinces(p.code).length,0);
  assert.throws(()=>new Navigator().get(createGame(setups),0,p.id,STARTS[0]),/unreachable/);
 }
 for(const lat of [74.1,80,89,-59,-80]){const p=project(10,lat);assert.equal(provinceAt(p.x,p.z),-1);}
});
test('partial Greenland regions keep valid visible centers and all active anchors lie on land',()=>{
 for(const p of MAP.filter(p=>p.visible)){
  assert.ok(inRect(p.center,B),p.code);assert.ok(pointInProvince(p.id,p.center.x,p.center.z),p.code);
  assert.ok(navigableInProvince(p.id,p.center.x,p.center.z),p.code);
  for(const id of p.neighbors){assert.ok(MAP[id].playable);assert.ok(MAP[id].neighbors.includes(p.id));}
 }
 const park=MAP.find(p=>p.code==='GRL-2742');assert.ok(park.cropped);assert.ok(park.visible);assert.ok(park.playable);
});
test('partial-region flow has no path or movement beyond the crop edge',()=>{
 const s=createGame(setups),a=MAP.find(p=>p.code==='GRL-2742'),b=MAP[a.neighbors[0]],nav=new Navigator();
 assert.ok(b);const flow=nav.get(s,0,b.id,a.id);
 for(let i=0;i<flow.distance.length;i++)if(Number.isFinite(flow.distance[i]))assert.ok(inRect(cellCenter(i,flow),B));
 assert.equal(nav.canMove(flow,a.center.x,a.center.z,a.center.x,B.top-0.01),false);
});
test('excluded provinces cannot produce or be ordered; victory ignores hidden ownership',()=>{
 const e=new Engine(createGame(setups)),hidden=MAP.find(p=>!p.visible);
 const ownBefore=e.state.players[0].gold;e.state.provinces[hidden.id].owner=0;e.state.provinces[hidden.id].production=14;
 assert.equal(e.command(0,{type:'production',province:hidden.id,kind:'infantry'}).ok,false);
 e.step();assert.equal(e.state.provinces[hidden.id].production,14);assert.ok(!e.state.units.some(u=>u.province===hidden.id));
 assert.ok(e.state.players[0].gold>ownBefore);assert.equal(validateState(e.state),false);
 const v=new Engine(createGame(setups));for(const p of v.state.provinces)p.owner=MAP[p.id].playable?0:1;
 v.state.units=v.state.units.filter(u=>u.owner===0);v.step();assert.equal(v.state.winner,0);
});
test('cropped saves and LAN reject full-world Miller state without touching legacy storage',()=>{
 const s=createGame(setups);assert.equal(s.version,4);assert.ok(validateState(s));
 const legacy={...s,version:3,map:'earth-admin1-miller-v1'};
 assert.equal(validateState(legacy),false);assert.throws(()=>applyFrame(null,{type:'state',state:legacy}),/incompatibleMap/);
 const m=new Map([['rouge.save.earth.miller.v1.slot','legacy']]);
 const storage={get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};
 writeSave(storage,'slot',s,'Cropped');assert.ok(SAVE_PREFIX.includes('crop'));assert.equal(listSaves(storage).length,1);
 deleteSave(storage,'slot');assert.equal(m.get('rouge.save.earth.miller.v1.slot'),'legacy');
 const bad=structuredClone(s);bad.units[0].z=B.top-0.1;assert.equal(validateState(bad),false);
});
test('longitude wrapping is periodic and chooses the adjacent visual copy, without relocating simulation',()=>{
 for(const x of [-5400,-1801,-1800,-1799,0,1799,1800,1801,5400]){
  const w=wrapX(x);assert.ok(w>=B.left&&w<B.right);assert.equal(wrapX(x+3600),w);
 }
 assert.equal(nearestWorldX(-1790,1790),1810);assert.equal(nearestWorldX(1790,-1790),-1810);
 assert.throws(()=>wrapX(NaN));const s=createGame(setups),before=structuredClone(s);wrapX(5000);assert.deepEqual(s,before);
});

test('crop leaves source adjacency unchanged when a whole neighboring province is retained',()=>{
 for(const p of MAP)if(p.playable)for(const id of data.provinces[p.id].neighbors) {
  if(MAP[id].playable&&(!p.cropped||!MAP[id].cropped))assert.ok(p.neighbors.includes(id),`${p.code}/${MAP[id].code}`);
 }
});
