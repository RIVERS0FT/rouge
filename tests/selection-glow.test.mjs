import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
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
  const p=MAP.find(p=>p.code===code),triangles=tessellate(p.parts),mesh=innerGlowMesh(triangles,segments(p.parts.flat()),2);
  assert.ok(mesh.points.length>0,code);assert.ok(mesh.distance.every(d=>d>=0&&d<=2));
  for(let i=0;i<mesh.points.length;i+=3){const t=mesh.points.slice(i,i+3);for(const v of t)assert.ok(v.x>=BOUNDS.left-1e-6&&v.x<=BOUNDS.right+1e-6&&v.z>=BOUNDS.top-1e-6&&v.z<=BOUNDS.bottom+1e-6);}
 }
});
test('largest source boundary has bounded selection rebuild work',()=>{
 const count=p=>p.parts.flat().reduce((n,r)=>n+r.length,0),p=[...MAP].sort((a,b)=>count(b)-count(a))[0];
 const triangles=tessellate(p.parts),started=performance.now(),mesh=innerGlowMesh(triangles,segments(p.parts.flat()),2),elapsed=performance.now()-started;
 console.log(`Largest selection ${p.code}: ${count(p)} boundary vertices, ${triangles.length} land triangles, ${mesh.points.length} glow vertices, ${elapsed.toFixed(1)} ms`);
 assert.ok(mesh.points.length<1500000,'Bounded overlay geometry');assert.ok(elapsed<5000,'Regression guard, not a mobile frame-time guarantee');
});

test('concave notch stays empty instead of bridging an inward corner',()=>{
 const ring=[{x:0,z:0},{x:20,z:0},{x:20,z:5},{x:5,z:5},{x:5,z:20},{x:0,z:20}],parts=[[ring]],mesh=innerGlowMesh(tessellate(parts),segments([ring]),2);
 for(let i=0;i<mesh.points.length;i+=3){const triangle=mesh.points.slice(i,i+3);assert.equal(insideTriangle({x:8,z:8},triangle),false);}
 assert.ok(mesh.points.length>0);
});
