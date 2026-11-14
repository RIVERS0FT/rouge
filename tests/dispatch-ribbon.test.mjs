import assert from 'node:assert/strict';
import test from 'node:test';
import {dispatchRibbon,dispatchSources,dispatchThreshold} from '../src/render/dispatchRibbon.ts';

test('dispatch arrow is one closed silhouette with a triangular shoulder and gap before the pointer',()=>{
 const ribbon=dispatchRibbon({x:0,y:0},{x:300,y:0});
 const points=ribbon.d.slice(1,-1).split('L').map(point=>point.split(',').map(Number));
 assert.match(ribbon.d,/^M[^M]+Z$/);
 const [bodyEnd,shoulder,head,otherShoulder,otherBody]=points.slice(20,25);
 assert.deepEqual(head,[288,0]);
 assert.ok(shoulder[1]>bodyEnd[1]);
 assert.ok(otherShoulder[1]<otherBody[1]);
 assert.ok(ribbon.marker(.5).y>0,'the silhouette is curved');
 assert.equal(dispatchRibbon({x:0,y:0},{x:4,y:0}),null);
});
test('flow markers shrink uniformly forward and fade before the triangle endpoint',()=>{
 const ribbon=dispatchRibbon({x:50,y:180},{x:350,y:50});
 const a=ribbon.marker(.2),b=ribbon.marker(.5),c=ribbon.marker(ribbon.tip-.02);
 assert.ok(a.scale>b.scale&&b.scale>c.scale);
 assert.equal(a.opacity,b.opacity);
 assert.ok(c.opacity<b.opacity);
 assert.equal(ribbon.marker(ribbon.tip).opacity,0);
 assert.equal(ribbon.marker(0).opacity,0);
});
test('a dropped dispatch includes every owned, nonempty source member but never marches within the same territory',()=>{
 const owners=[0,0,0,1,-1,0],counts=new Uint32Array([3,0,7,9,5,8]);
 assert.deepEqual(dispatchSources([0,1,2,3],4,0,owners,counts),[0,2]);
 assert.deepEqual(dispatchSources([0,1,2],2,0,owners,counts),[]);
 assert.deepEqual(dispatchSources([0,1,2],-1,0,owners,counts),[]);
 assert.deepEqual(dispatchSources([4],5,-1,owners,counts),[]);
 assert.ok(dispatchThreshold('touch')>dispatchThreshold('mouse'));
});
