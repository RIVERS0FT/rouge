import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {mapGeometryTiles,wideBorderTiles} from '../src/render/mapGeometryTiles.ts';
import {LineSegments2} from 'three/examples/jsm/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';

test('spatial land tiles preserve complete triangles, mutable attributes and conservative bounds',()=>{
 const geometry=new THREE.BufferGeometry(),positions=[-500,.16,-20,500,.16,-20,0,.16,20, 900,.16,500,910,.16,500,900,.16,510];
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 const colors=new THREE.Float32BufferAttribute(new Float32Array(positions.length).fill(.5),3);geometry.setAttribute('color',colors);
 const source=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());
 const tiles=mapGeometryTiles(source,3),ids=tiles.children.flatMap(tile=>[...tile.geometry.index.array]);
 assert.equal(tiles.children.length,2);assert.deepEqual(ids,[...Array(positions.length/3).keys()]);
 for(const tile of tiles.children){
  assert.equal(tile.geometry.getAttribute('position'),geometry.getAttribute('position'));assert.equal(tile.geometry.getAttribute('color'),colors);
  assert.equal(tile.material,source.material);assert.equal(tile.frustumCulled,true);
  for(const id of tile.geometry.index.array){const point=new THREE.Vector3().fromArray(positions,id*3);assert.ok(tile.geometry.boundingSphere.containsPoint(point));assert.ok(tile.geometry.boundingBox.containsPoint(point));}
 }
 colors.setXYZ(0,1,.2,.3);assert.equal(tiles.children[0].geometry.getAttribute('color').getX(0),1);
 for(const tile of tiles.children)tile.geometry.dispose();geometry.dispose();source.material.dispose();
});

test('native line tiles retain every endpoint and bound without global vertex indices',()=>{
 // Include endpoint ids above 65535 and segments that cross a tile boundary.
 const positions=[];for(let i=0;i<40000;i++){const x=i%2?900:-500,z=(i%100)*.01;positions.push(x,.27,z,x+1,.27,z+1);}
 positions.push(-500,.27,-20,500,.27,20);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 const source=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial()),tiles=mapGeometryTiles(source,2),actual=[];
 for(const tile of tiles.children){
  assert.equal(tile.geometry.index,null);const p=tile.geometry.getAttribute('position');assert.equal(p.count%2,0);
  assert.equal(tile.material,source.material);
  for(let i=0;i<p.count;i+=2){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1);actual.push([...a.toArray(),...b.toArray()].join(','));for(const point of [a,b])assert.ok(tile.geometry.boundingSphere.containsPoint(point)&&tile.geometry.boundingBox.containsPoint(point));}
 }
 const original=geometry.getAttribute('position').array,expected=[];for(let i=0;i<original.length;i+=6)expected.push([...original.slice(i,i+6)].join(','));
 assert.deepEqual(actual.sort(),expected.sort());
 for(const tile of tiles.children)tile.geometry.dispose();geometry.dispose();source.material.dispose();
});

test('wide country border tiles retain all endpoints, widths and cross-tile bounds',()=>{
 const points=[-500,.5,-20,500,.5,20,900,.5,500,910,.5,510],source=new LineSegments2(new LineSegmentsGeometry().setPositions(points),new LineMaterial({linewidth:2.2}));
 const tiles=wideBorderTiles(source),segments=[];
 for(const line of tiles.children){
  assert.equal(line.material,source.material);assert.equal(line.material.linewidth,2.2);
  const start=line.geometry.getAttribute('instanceStart'),end=line.geometry.getAttribute('instanceEnd');
  for(let i=0;i<start.count;i++){const a=new THREE.Vector3().fromBufferAttribute(start,i),b=new THREE.Vector3().fromBufferAttribute(end,i);assert.ok(line.geometry.boundingSphere.containsPoint(a));assert.ok(line.geometry.boundingSphere.containsPoint(b));segments.push(...a.toArray(),...b.toArray());}
 }
 assert.deepEqual(segments,points);source.material.linewidth=3;assert.ok(tiles.children.every(line=>line.material.linewidth===3));
 for(const line of tiles.children)line.geometry.dispose();source.geometry.dispose();source.material.dispose();
});
