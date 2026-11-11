import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import * as THREE from 'three';
import {buildBorderEdges} from '../src/render/territoryBorders.ts';
import {innerGlowMesh} from '../src/render/selectionGlow.ts';
import {MAP,containsPart,BOUNDS} from '../src/game/map.ts';
import {clipTriangle} from '../src/game/crop.ts';
const square=(x,z,w,h)=>[{x,z},{x:x+w,z},{x:x+w,z:z+h},{x,z:z+h}];
const segments=rings=>rings.flatMap(r=>r.map((p,i)=>[p,r[(i+1)%r.length]]));
function tessellate(parts){const out=[];for(const part of parts){const rings=part.map(r=>r.map(p=>new THREE.Vector2(p.x,p.z))),points=rings.flat();for(const face of THREE.ShapeUtils.triangulateShape(rings[0],rings.slice(1))){const clipped=clipTriangle(face.map(i=>({x:points[i].x,z:points[i].y})),BOUNDS);for(let j=1;j+1<clipped.length;j++)out.push([clipped[0],clipped[j],clipped[j+1]]);}}return out;}
function insideTriangle(p,t){const c=(a,b)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);const v=[c(t[0],t[1]),c(t[1],t[2]),c(t[2],t[0])];return v.every(n=>n>=-1e-8)||v.every(n=>n<=1e-8);}
test('inner glow is a finite strip, never whole-face vertex interpolation',()=>{
 const ring=square(0,0,20,20),triangles=[[ring[0],ring[1],ring[2]],[ring[0],ring[2],ring[3]]],mesh=innerGlowMesh(triangles,segments([ring]),2);
 assert.ok(mesh.points.length>0);assert.equal(mesh.points.length,mesh.distance.length);
 assert.ok(mesh.distance.some(d=>d<.01));assert.ok(mesh.distance.some(d=>d>1.99));
 for(let i=0;i<mesh.points.length;i+=3){const triangle=mesh.points.slice(i,i+3);assert.equal(insideTriangle({x:10,z:10},triangle),false);for(const p of triangle)assert.ok(p.x>=0&&p.x<=20&&p.z>=0&&p.z<=20);}
});
test('glow clips to concave land triangles, preserving holes and disconnected islands',()=>{
 const parts=[[square(0,0,20,20),square(5,5,10,10)],[square(30,0,6,6)]],triangles=tessellate(parts),mesh=innerGlowMesh(triangles,segments(parts.flat()),2);
 assert.ok(mesh.points.length>0);
 for(let i=0;i<mesh.points.length;i+=3){const t=mesh.points.slice(i,i+3),center={x:t.reduce((n,p)=>n+p.x,0)/3,z:t.reduce((n,p)=>n+p.z,0)/3};assert.ok(parts.some(part=>containsPart(part,center.x,center.z)));assert.ok(triangles.some(tri=>insideTriangle(center,tri)));}
 assert.deepEqual(innerGlowMesh([],[],2),{points:[],distance:[]});
});
test('real cropped polar and date-line selections stay on their land mesh with bounded fade',()=>{
 for(const code of ['GRL-2743','USA-3517','DEU-3487']){
  const p=MAP.find(p=>p.code===code||p.sourceAtoms?.includes(code)),triangles=tessellate(p.parts),mesh=innerGlowMesh(triangles,buildBorderEdges([p],BOUNDS).map(e=>[e.a,e.b]),2);
  assert.ok(mesh.points.length>0,code);assert.ok(mesh.distance.every(d=>d>=0&&d<=2));
  for(let i=0;i<mesh.points.length;i+=3){const t=mesh.points.slice(i,i+3);for(const v of t)assert.ok(v.x>=BOUNDS.left-1e-6&&v.x<=BOUNDS.right+1e-6&&v.z>=BOUNDS.top-1e-6&&v.z<=BOUNDS.bottom+1e-6);}
 }
});
test('largest source boundary has bounded selection rebuild work',()=>{
 const count=p=>p.parts.flat().reduce((n,r)=>n+r.length,0),p=[...MAP].sort((a,b)=>count(b)-count(a))[0];
 const triangles=tessellate(p.parts),started=performance.now(),mesh=innerGlowMesh(triangles,buildBorderEdges([p],BOUNDS).map(e=>[e.a,e.b]),2),elapsed=performance.now()-started;
 console.log(`Largest selection ${p.code}: ${count(p)} boundary vertices, ${triangles.length} land triangles, ${mesh.points.length} glow vertices, ${elapsed.toFixed(1)} ms`);
 assert.ok(mesh.points.length<750000,'Bounded overlay geometry');assert.ok(elapsed<5000,'Regression guard, not a mobile frame-time guarantee');
});

test('concave notch stays empty instead of bridging an inward corner',()=>{
 const ring=[{x:0,z:0},{x:20,z:0},{x:20,z:5},{x:5,z:5},{x:5,z:20},{x:0,z:20}],parts=[[ring]],mesh=innerGlowMesh(tessellate(parts),segments([ring]),2);
 for(let i=0;i<mesh.points.length;i+=3){const triangle=mesh.points.slice(i,i+3);assert.equal(insideTriangle({x:8,z:8},triangle),false);}
 assert.ok(mesh.points.length>0);
});

test('selection outline and glow omit seams between preprocessed source parts',()=>{
 const region={id:0,code:'merged',visible:true,parts:[[square(0,0,20,20)],[square(20,0,20,20)]]};
 const edges=buildBorderEdges([region],BOUNDS),mesh=innerGlowMesh(tessellate(region.parts),edges.map(e=>[e.a,e.b]),2);
 assert.equal(edges.some(e=>e.a.x===20&&e.b.x===20),false);
 assert.ok(mesh.points.length>0);
 for(let i=0;i<mesh.points.length;i+=3)assert.equal(insideTriangle({x:20,z:10},mesh.points.slice(i,i+3)),false,'No glow along the former internal boundary');
});


test('renderer selection retains island coast edges for outline and glow input',()=>{
 const source=readFileSync(new URL('../src/render/WorldRenderer.ts',import.meta.url),'utf8');
 assert.match(source,/this\.boundaryEdges=edges;/,'Renderer must retain coast edges, not just political borders');
 const selected=MAP.find(p=>p.visible&&p.neighbors.length===0),allEdges=buildBorderEdges(MAP,BOUNDS);
 const expected=allEdges.filter(e=>e.atoms.includes(selected.id));
 assert.ok(expected.length>0);assert.ok(expected.every(e=>e.atoms.length===1));
 // The renderer constructor uses parameter properties, requiring transform mode
 // rather than the strip-only mode used by pure game modules in this suite.
 execFileSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',`
  import assert from 'node:assert/strict';
  import * as THREE from 'three';
  import {WorldRenderer} from './src/render/WorldRenderer.ts';
  import {MAP,BOUNDS} from './src/game/map.ts';
  import {buildBorderEdges} from './src/render/territoryBorders.ts';
  const selected=MAP.find(p=>p.visible&&p.neighbors.length===0),allEdges=buildBorderEdges(MAP,BOUNDS);
  const expected=allEdges.filter(e=>e.atoms.includes(selected.id));
  const renderer=Object.create(WorldRenderer.prototype);let outline,glowEdges;
  globalThis.Worker=class {postMessage(message){glowEdges=message.edges;}terminate(){}};
  const ranges=[];ranges[selected.id]={start:0,count:3};
  Object.assign(renderer,{selected:selected.id,boundaryEdges:allEdges,selection:{},selectionGlowWorker:null,selectionGlow:{geometry:new THREE.BufferGeometry()},repeats:[],renderer:{domElement:{dataset:{}}},ranges,land:{geometry:{getAttribute:()=>({array:new Float32Array(9)})}},replaceWideGeometry:(_line,points)=>{outline=points;}});
  renderer.drawSelection();
  assert.equal(outline.length,expected.length*6,'Actual renderer includes the whole island coastline');
  assert.ok(outline.every(Number.isFinite));
  assert.equal(glowEdges.length,expected.length*4,'Glow worker receives island coast edges');
  renderer.selectionGlow.geometry.dispose();
 `],{cwd:new URL('..',import.meta.url),stdio:'pipe'});
 const mesh=innerGlowMesh(tessellate(selected.parts),expected.map(e=>[e.a,e.b]),2);
 assert.ok(mesh.points.length>0,'Island coastline produces glow');
});

test('inner corners have one coverage layer instead of stacked per-edge wedges',()=>{
 const ring=square(0,0,20,20),mesh=innerGlowMesh(tessellate([[ring]]),segments([ring]),2);
 const sample=p=>{
  const distances=[];
  for(let i=0;i<mesh.points.length;i+=3){
   const [a,b,c]=mesh.points.slice(i,i+3),area=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
   const u=((b.x-p.x)*(c.z-p.z)-(b.z-p.z)*(c.x-p.x))/area,v=((c.x-p.x)*(a.z-p.z)-(c.z-p.z)*(a.x-p.x))/area,w=1-u-v;
   if(Math.min(u,v,w)>1e-9)distances.push(u*mesh.distance[i]+v*mesh.distance[i+1]+w*mesh.distance[i+2]);
  }
  return distances;
 };
 for(const p of [{x:.43,z:.79},{x:1.21,z:.37},{x:19.31,z:.41},{x:19.23,z:18.81},{x:10.13,z:1.17}]){
  const values=sample(p);assert.equal(values.length,1,`Single coverage at ${JSON.stringify(p)}`);
  const expected=Math.min(p.x,20-p.x,p.z,20-p.z);assert.ok(Math.abs(values[0]-expected)<.06,'Nearest-edge fade has no triangular brightness spikes');
 }
 assert.equal(sample({x:10.13,z:10.27}).length,0,'Center keeps its original fill');
});

test('duplicate segments and boundary direction cannot increase glow intensity',()=>{
 const ring=square(0,0,20,20),triangles=tessellate([[ring]]),edges=segments([ring]);
 const normal=innerGlowMesh(triangles,edges),duplicates=innerGlowMesh(triangles,[...edges,...edges.map(([a,b])=>[b,a])]);
 assert.deepEqual(duplicates,normal,'The nearest-boundary field is independent of edge multiplicity');
});

test('acute and shallow zigzag corners stay single-sided and smoothly faded',()=>{
 const ring=[{x:0,z:0},{x:3,z:.5},{x:6,z:0},{x:6.2,z:2},{x:9,z:.1},{x:12,z:0},{x:12,z:12},{x:0,z:12}],parts=[[ring]],mesh=innerGlowMesh(tessellate(parts),segments([ring]));
 assert.ok(mesh.points.length>0);assert.ok(mesh.points.length<100000);
 for(let i=0;i<mesh.points.length;i+=3){
  const t=mesh.points.slice(i,i+3),center={x:t.reduce((sum,p)=>sum+p.x,0)/3,z:t.reduce((sum,p)=>sum+p.z,0)/3};
  assert.ok(containsPart(parts[0],center.x,center.z),'Glow never leaks across the zigzag border');
  assert.ok(mesh.distance.slice(i,i+3).every(d=>d>=0&&d<=2));
 }
});

test('subdivided glow stays on the original terrain plane instead of dipping under it',()=>{
 const triangle=[{x:0,z:0,relief:.2},{x:20,z:0,relief:.6},{x:0,z:20,relief:.4}],mesh=innerGlowMesh([triangle],segments([triangle]));
 assert.ok(mesh.points.length>0);
 for(const p of mesh.points)assert.ok(Math.abs((p.relief??0)-(.2+.02*p.x+.01*p.z))<1e-9,'Barycentric relief remains continuous through subdivision and fade clipping');
 const source=readFileSync(new URL('../src/render/WorldRenderer.ts',import.meta.url),'utf8');
 assert.match(source,/transformed\.y \+= uRelief \* landRelief/);
});
