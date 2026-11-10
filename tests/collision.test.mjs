import test from 'node:test';
import assert from 'node:assert/strict';
import {separateCircles,UNIT_RADIUS,COLLISION_PASSES,COLLISION_CANDIDATES,COLLISION_MAX_PUSH} from '../src/game/collision.ts';
const body=(id,x=0,z=0)=>({id,x,z,radius:.46});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
test('identical centers separate by stable IDs without NaN, input order, or random state',()=>{
 const normal=[body(1),body(2)],reversed=structuredClone(normal).reverse();
 separateCircles(normal,()=>true,9);separateCircles(reversed,()=>true,9);
 assert.deepEqual(normal,reversed.reverse());assert.ok(distance(...normal)>=.92-1e-6);
 assert.ok(normal.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));
});
test('friendly or hostile circles share the same ground footprint and resolve to contact',()=>{
 for(const kinds of [['infantry','infantry'],['heavyCavalry','artillery']]){
  const bodies=kinds.map((kind,i)=>({...body(i+1,i*.25),radius:UNIT_RADIUS[kind]}));
  for(let i=0;i<4;i++)separateCircles(bodies,()=>true,i);
  assert.ok(distance(...bodies)>=bodies[0].radius+bodies[1].radius-1e-5);
 }
});
test('a pinned body transfers the correction to the free neighbor without entering a wall',()=>{
 const bodies=[body(1,.46),body(2,.9)];separateCircles(bodies,(b,to)=>to.x>=b.radius);
 assert.ok(bodies.every(b=>b.x>=b.radius));assert.ok(distance(...bodies)>=.92-1e-5);
});
test('twelve coincident troops spread over repeated fixed ticks with bounded displacement',()=>{
 const bodies=Array.from({length:12},(_,i)=>body(i+1));
 for(let tick=0;tick<80;tick++){
  const before=structuredClone(bodies);separateCircles(bodies,()=>true,tick);
  bodies.forEach((b,i)=>assert.ok(distance(b,before[i])<=COLLISION_MAX_PUSH+1e-8));
 }
 for(const a of bodies)for(const b of bodies)if(a.id<b.id)assert.ok(distance(a,b)>=.92-1e-4,`${a.id}/${b.id}`);
});
test('spread army broad-phase work is linear, and pathological stacks have a fixed scan budget',()=>{
 const separated=Array.from({length:5000},(_,i)=>body(i+1,(i%100)*3,Math.floor(i/100)*3));
 const report=separateCircles(separated,()=>true);assert.equal(report.contacts,0);assert.ok(report.candidates<5000*12);
 const stack=Array.from({length:1000},(_,i)=>body(i+1));const crowded=separateCircles(stack,()=>false,2);
 assert.ok(crowded.limited>0);assert.ok(crowded.candidates<=stack.length*COLLISION_PASSES*COLLISION_CANDIDATES);
});
