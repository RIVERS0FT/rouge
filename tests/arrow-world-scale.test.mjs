import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {LAND_Y} from '../src/game/mapHeight.ts';
import {ARROW_ART_UNIT,dispatchRibbon} from '../src/render/dispatchRibbon.ts';
import {groundArrowProjection} from '../src/render/groundArrowProjection.ts';

const width=1440,height=960;
const source={x:-45,y:5},target={x:45,y:10};
const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const points=d=>d.slice(1,-1).split('L').map(p=>{const [x,y]=p.split(',').map(Number);return {x,y};});
function view(distance,tilt=0){
 const camera=new THREE.PerspectiveCamera(40,width/height,.05,20000);
 camera.up.set(0,0,-1);camera.position.set(0,distance*Math.cos(tilt),distance*Math.sin(tilt));
 camera.lookAt(0,0,0);camera.updateMatrixWorld();
 return {camera,projection:groundArrowProjection(camera,width,height,LAND_Y)};
}
test('arrow width, tip and individual chevrons scale in the exact same ratio as the map',()=>{
 const far=view(640).projection,near=view(320).projection;
 const ratio=length(near.point(source),near.point(target))/length(far.point(source),far.point(target));
 const a=dispatchRibbon(source,target,0,ARROW_ART_UNIT,far),b=dispatchRibbon(source,target,0,ARROW_ART_UNIT,near);
 const body=r=>length(r.projected[0],r.projected.at(-1)),mark=r=>length(...points(r.markerPath(.4)).slice(0,2));
 assert.ok(Math.abs(body(b)/body(a)-ratio)<1e-8);
 assert.ok(Math.abs(b.outlineWidth/a.outlineWidth-ratio)<1e-8);
 assert.ok(Math.abs(mark(b)/mark(a)-ratio)<.02);
 assert.deepEqual(a.projected[22],far.point(target));
 assert.deepEqual(b.projected[22],near.point(target));
});
test('under tilt every contour and chevron vertex remains on the same plane as the map',()=>{
 const {camera,projection}=view(110,.6),ray=new THREE.Raycaster();
 const plane=new THREE.Plane(new THREE.Vector3(0,1,0),-LAND_Y);
 const world=dispatchRibbon(source,target,0,ARROW_ART_UNIT),screen=dispatchRibbon(source,target,0,ARROW_ART_UNIT,projection);
 for(const [ground,pixels] of [[world.projected,screen.projected],[points(world.markerPath(.4)),points(screen.markerPath(.4))]]){
  assert.equal(ground.length,pixels.length);
  for(let i=0;i<ground.length;i++){
   const p=pixels[i],hit=new THREE.Vector3();
   ray.setFromCamera(new THREE.Vector2(p.x*2/width-1,1-p.y*2/height),camera);
   assert.ok(ray.ray.intersectPlane(plane,hit));assert.ok(Math.hypot(hit.x-ground[i].x,hit.z-ground[i].y)<.03);
  }
 }
});
test('near-plane crossings clip without a mirrored ribbon or non-finite vertices',()=>{
 const {projection}=view(6,.6);
 const a={x:0,y:0},b={x:20,y:150};
 assert.ok(projection.point(a));assert.equal(projection.point(b),null);
 const ribbon=dispatchRibbon(a,b,0,ARROW_ART_UNIT,projection);
 assert.ok(ribbon);assert.ok(ribbon.projected.length<45);
 assert.ok(ribbon.projected.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
});
