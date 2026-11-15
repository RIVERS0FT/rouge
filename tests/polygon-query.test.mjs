import test from 'node:test';
import assert from 'node:assert/strict';
import {contains} from '../src/game/sourceMap.ts';
import {MAP,BOUNDS,containsPart,pointInProvince,provinceAt} from '../src/game/map.ts';
import {prepareRing,ringContains} from '../src/game/polygonQuery.ts';

test('indexed scanlines preserve ray-crossing decisions at vertices, thin edges and band boundaries',()=>{
 const rings=[[],[{x:1,z:1}], [{x:-3,z:-9},{x:12,z:-9},{x:12,z:900},{x:-3,z:900}],
  [{x:1e8,z:-2},{x:1e8+1e-6,z:1024},{x:1e8+3,z:8}],
  [{x:0,z:0},{x:2,z:0},{x:2,z:1},{x:1,z:1},{x:1,z:4},{x:0,z:4}]];
 for(const points of rings){const query=prepareRing(points);for(const p of [...points,{x:0,z:0}])for(const dx of [0,-1e-12,1e-12])for(const dz of [0,-1e-12,1e-12])assert.equal(ringContains(query,p.x+dx,p.z+dz),contains(points,p.x+dx,p.z+dz));
  if(points.length)for(let band=0;band<query.offsets.length;band++){const z=query.top+band*query.step;for(const x of [query.left,query.right,(query.left+query.right)/2])assert.equal(ringContains(query,x,z),contains(points,x,z));}
 }
});

test('prepared geographic rings keep original precision at sampled coastline vertices',()=>{
 for(const region of MAP)for(const part of region.parts)for(const ring of part){const query=prepareRing(ring);for(let i=0;i<ring.length;i+=Math.max(1,Math.floor(ring.length/8))){const p=ring[i];for(const offset of [0,-1e-10,1e-10])assert.equal(ringContains(query,p.x+offset,p.z),contains(ring,p.x+offset,p.z));}}
});

test('province lookups preserve holes, crop edges and first-owner ordering',()=>{
 let rng=1729;const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
 for(const region of MAP){
  for(let i=0;i<5;i++){
   const x=i?region.bounds.left+random()*(region.bounds.right-region.bounds.left):region.center.x,z=i?region.bounds.top+random()*(region.bounds.bottom-region.bounds.top):region.center.z;
   const cropped=x>=BOUNDS.left&&x<=BOUNDS.right&&z>=BOUNDS.top&&z<=BOUNDS.bottom;
   const original=p=>p.visible&&p.parts.some(part=>containsPart(part,x,z));
   assert.equal(pointInProvince(region.id,x,z),cropped&&original(region));
   assert.equal(provinceAt(x,z),cropped?(MAP.find(original)?.id??-1):-1);
  }
 }
});
