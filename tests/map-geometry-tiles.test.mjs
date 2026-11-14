import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {mapGeometryTiles,wideBorderTiles} from '../src/render/mapGeometryTiles.ts';
import {LineSegments2} from 'three/examples/jsm/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';

for(const primitive of [2,3])test(`spatial map tiles preserve complete ${primitive===3?'triangles':'segments'}, mutable attributes and conservative bounds`,()=>{
 const geometry=new THREE.BufferGeometry(),positions=primitive===3?
  [-500,.16,-20,500,.16,-20,0,.16,20, 900,.16,500,910,.16,500,900,.16,510]:
  [-500,.27,-20,500,.27,20, 900,.27,500,910,.27,510];
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 const colors=new THREE.Float32BufferAttribute(new Float32Array(positions.length).fill(.5),3);geometry.setAttribute('color',colors);
 const source=primitive===3?new THREE.Mesh(geometry,new THREE.MeshBasicMaterial()):new THREE.LineSegments(geometry,new THREE.LineBasicMaterial());
 const tiles=mapGeometryTiles(source,primitive),ids=tiles.children.flatMap(tile=>[...tile.geometry.index.array]);
 assert.equal(tiles.children.length,2);assert.deepEqual(ids,[...Array(positions.length/3).keys()]);
 for(const tile of tiles.children){
  assert.equal(tile.geometry.getAttribute('position'),geometry.getAttribute('position'));assert.equal(tile.geometry.getAttribute('color'),colors);
  assert.equal(tile.material,source.material);assert.equal(tile.frustumCulled,true);
  for(const id of tile.geometry.index.array){const point=new THREE.Vector3().fromArray(positions,id*3);assert.ok(tile.geometry.boundingSphere.containsPoint(point));assert.ok(tile.geometry.boundingBox.containsPoint(point));}
 }
 colors.setXYZ(0,1,.2,.3);assert.equal(tiles.children[0].geometry.getAttribute('color').getX(0),1);
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
