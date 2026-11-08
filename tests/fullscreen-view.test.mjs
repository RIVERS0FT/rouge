import test from 'node:test';
import assert from 'node:assert/strict';
import {worldCoverDistance, cameraGroundSpan,clampViewZ,WORLD_BOUNDS,WORLD_CENTER,WORLD_WIDTH} from '../src/game/geo.ts';

test('cover framing fills every supported viewport without stretching the Miller atlas',()=>{
 const height=WORLD_BOUNDS.bottom-WORLD_BOUNDS.top;
 for(const aspect of [800/600,1280/720,1440/960,1920/1080,2560/1080,32/9]){
  const d=worldCoverDistance(aspect),span=2*d*Math.tan(20*Math.PI/180);
  assert.ok(span<=height);assert.ok(span*aspect<=WORLD_WIDTH);
  assert.ok(Math.abs(Math.max(span/height,span*aspect/WORLD_WIDTH)-0.998)<1e-12);
 }
});
test('cover camera rejects invalid viewport inputs',()=>{
 for(const a of [0,-1,NaN,Infinity])assert.throws(()=>worldCoverDistance(a));
 for(const f of [0,180,NaN,Infinity])assert.throws(()=>worldCoverDistance(1.5,f));
 assert.throws(()=>clampViewZ(NaN,100,0));
 assert.throws(()=>cameraGroundSpan(-1,0));
 assert.throws(()=>cameraGroundSpan(100,Math.PI/2));
});
test('camera footprint preserves both crop limits during near/far north-south panning',()=>{
 for(const aspect of [4/3,16/9,32/9])for(const [distance,tilt] of [[worldCoverDistance(aspect),0],[320,0],[100,.6],[5,.6]]){
  const span=cameraGroundSpan(distance,tilt);
  for(const raw of [WORLD_BOUNDS.top-1000,WORLD_BOUNDS.bottom+1000,WORLD_CENTER.z]){
   const z=clampViewZ(raw,distance,tilt);
   assert.ok(z-span.north>=WORLD_BOUNDS.top-1e-10);
   assert.ok(z+span.south<=WORLD_BOUNDS.bottom+1e-10);
  }
 }
 const flat=cameraGroundSpan(500,0);
 assert.ok(Math.abs(flat.north-flat.south)<1e-12);
 const near=cameraGroundSpan(100,.6);
 assert.ok(near.north>near.south);
});


test('rendered sea-plane ray intersections remain inside the crop at extreme close zoom',async()=>{
 const {PerspectiveCamera,Raycaster,Vector2,Vector3,Plane}=await import('three');
 for(const aspect of [4/3,16/9,32/9])for(const [distance,tilt]of [[worldCoverDistance(aspect),0],[16,.6],[5,.6]]){
  for(const target of [WORLD_BOUNDS.top-500,WORLD_BOUNDS.bottom+500]){
   const focusZ=clampViewZ(target,distance,tilt),camera=new PerspectiveCamera(40,aspect,.01,10000);
   camera.up.set(0,0,-1);camera.position.set(0,distance*Math.cos(tilt),focusZ+distance*Math.sin(tilt));
   camera.lookAt(0,0,focusZ);camera.updateMatrixWorld();
   for(const y of [-1,1]){
    const ray=new Raycaster();ray.setFromCamera(new Vector2(0,y),camera);
    const hit=ray.ray.intersectPlane(new Plane(new Vector3(0,1,0),.25),new Vector3());
    assert.ok(hit);assert.ok(hit.z>=WORLD_BOUNDS.top-1e-7);assert.ok(hit.z<=WORLD_BOUNDS.bottom+1e-7);
   }
  }
 }
 assert.throws(()=>cameraGroundSpan(5,0,40,6));
 assert.throws(()=>cameraGroundSpan(5,0,40,NaN));
});
