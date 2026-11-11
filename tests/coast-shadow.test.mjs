import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoastShadow} from '../src/render/coastShadow.ts';

test('coast ribbons join real shoreline endpoints and exclude political and internal edges',()=>{
 const edges=[{a:{x:0,z:0},b:{x:10,z:0},atoms:[0]},{a:{x:10,z:0},b:{x:10,z:10},atoms:[0]},{a:{x:0,z:0},b:{x:0,z:10},atoms:[0,1]}];
 const original=JSON.stringify(edges),mesh=createCoastShadow(edges),g=mesh.geometry;
 assert.equal(g.instanceCount,2);assert.equal(g.index.count,6,'only two triangles per segment, without overlapping caps');
 assert.deepEqual([...g.getAttribute('aNext').array].slice(0,2),[10,10]);
 assert.deepEqual([...g.getAttribute('aPrevious').array].slice(2,4),[0,0]);
 assert.equal(JSON.stringify(edges),original);assert.equal(mesh.material.depthTest,false);assert.equal(mesh.material.depthWrite,false);
 g.dispose();mesh.material.dispose();
});

test('seam endpoints, branches and empty coastlines stay finite without synthetic closing edges',()=>{
 const empty=createCoastShadow([]);assert.equal(empty.geometry.instanceCount,0);empty.geometry.dispose();empty.material.dispose();
 const edges=[0,1,2].map(i=>({a:{x:1800,z:0},b:{x:1790,z:i*10-10},atoms:[i]})),mesh=createCoastShadow(edges);
 assert.equal(mesh.geometry.instanceCount,3);
 assert.deepEqual([...mesh.geometry.getAttribute('aExtent').array],[20,20,20]);
 for(const name of ['aStart','aEnd','aPrevious','aNext'])assert.ok([...mesh.geometry.getAttribute(name).array].every(Number.isFinite));
 mesh.geometry.dispose();mesh.material.dispose();
});
