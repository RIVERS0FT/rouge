import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {BUILDING_ART_KINDS,BUILDING_ART_SCALE,BUILDING_RENDER_LIMIT,constructionVisualChanged,townModelForSlot} from '../src/render/buildingPresentation.ts';
import {TownBuildings} from '../src/render/townBuildings.ts';
import {BUILDINGS,TOWNS,HOUSE_WIDTH,HOUSE_DEPTH,HOUSE_HEIGHT} from '../src/game/buildings.ts';
import {LAND_Y} from '../src/game/map.ts';

test('one bundled atlas is shared by the four exact v3 building shapes inside the old obstacle footprint',()=>{
 const bytes=readFileSync(new URL('../src/render/assets/modern-buildings.glb',import.meta.url));
 const length=bytes.readUInt32LE(12),g=JSON.parse(bytes.toString('utf8',20,20+length));
 assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(4),2);
 assert.equal(bytes.readUInt32LE(8),bytes.length);
 assert.deepEqual(g.nodes.map(n=>n.name),BUILDING_ART_KINDS);
 assert.equal(g.meshes.length,4);assert.equal(g.materials.length,1);assert.equal(g.textures.length,1);assert.equal(g.images.length,1);
 assert.equal(g.materials[0].pbrMetallicRoughness.baseColorTexture.index,0);
 assert.equal(g.images[0].mimeType,'image/jpeg');assert.equal(g.images[0].uri,undefined);assert.equal(g.buffers[0].uri,undefined);
 const counts=[];
 for(const node of g.nodes){
  assert.deepEqual(Object.keys(node).sort(),['mesh','name']);
  const [primitive,...extra]=g.meshes[node.mesh].primitives;
  assert.equal(extra.length,0);assert.equal(primitive.material,0);
  assert.ok(Number.isInteger(primitive.attributes.TEXCOORD_0));assert.ok(Number.isInteger(primitive.attributes.NORMAL));
  const pos=g.accessors[primitive.attributes.POSITION];
  assert.equal(pos.min[1],0);
  assert.ok(Math.max(Math.abs(pos.min[0]),Math.abs(pos.max[0]))*BUILDING_ART_SCALE<=HOUSE_WIDTH/2);
  assert.ok(Math.max(Math.abs(pos.min[2]),Math.abs(pos.max[2]))*BUILDING_ART_SCALE<=HOUSE_DEPTH/2);
  counts.push(g.accessors[primitive.indices].count/3);
 }
 assert.deepEqual(counts,[146,260,248,180]);
});

test('facilities replace the first existing base-province slot without moving other homes or adding footprints',()=>{
 const slots=TOWNS.find(t=>t.length>1);
 assert.ok(slots&&slots.every(t=>BUILDINGS.includes(t)));
 for(const kind of BUILDING_ART_KINDS.slice(1)){
  const level1={kind,level:1},level2={kind,level:2};
  const layout=slots.map((_,slot)=>townModelForSlot(slot,level1));
  assert.deepEqual(layout,[kind,...slots.slice(1).map(()=> 'house')]);
  assert.equal(townModelForSlot(0,level2),kind);
  assert.equal(constructionVisualChanged(kind,level2),false);
  assert.equal(constructionVisualChanged(undefined,level1),true);
 }
 assert.equal(constructionVisualChanged('barracks',undefined),true);
 assert.equal(constructionVisualChanged(undefined,undefined),false);
 for(const slots of TOWNS){
  assert.strictEqual(slots.map((_,slot)=>townModelForSlot(slot,{kind:'market',level:1})).filter(k=>k==='market').length,Number(slots.length>0));
  assert.ok(slots.every((_,slot)=>townModelForSlot(slot,undefined)==='house'));
 }
});

test('lazy/error boxes retain the exact ground anchor, yaw, footprint and bounded count; hidden view clears them',()=>{
 const scene=new THREE.Scene(),batch=new TownBuildings(scene,()=>{});
 try{
  assert.equal(batch.fallbackCount,0);assert.equal(batch.group.visible,false);
  const slot=BUILDINGS[0];
  batch.begin(true);
  for(let i=0;i<BUILDING_RENDER_LIMIT+3;i++)batch.add('market',slot.x,LAND_Y,slot.z,slot.rotation);
  batch.end();
  assert.equal(batch.fallbackCount,BUILDING_RENDER_LIMIT);
  const fallback=batch.group.children[0],m=new THREE.Matrix4();
  fallback.getMatrixAt(0,m);
  // Instance matrices are Float32; allow error for world-space coordinates.
  const pos=new THREE.Vector3().setFromMatrixPosition(m);
  assert.ok(Math.abs(pos.x-slot.x)<.001&&Math.abs(pos.z-slot.z)<.001&&Math.abs(pos.y-LAND_Y)<1e-6);
  const yaw=new THREE.Vector3(1,0,0).transformDirection(m);
  assert.ok(Math.abs(yaw.x-Math.cos(slot.rotation))<1e-6&&Math.abs(yaw.z+Math.sin(slot.rotation))<1e-6);
  fallback.geometry.computeBoundingBox();
  const size=fallback.geometry.boundingBox.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x-HOUSE_WIDTH)<1e-6&&Math.abs(size.y-HOUSE_HEIGHT)<1e-6&&Math.abs(size.z-HOUSE_DEPTH)<1e-6);
  assert.ok(Math.abs(fallback.geometry.boundingBox.min.y)<1e-6);
  batch.begin(false);batch.end();
  assert.equal(batch.group.visible,false);assert.equal(batch.fallbackCount,0);
 }finally{batch.dispose();}
 assert.equal(scene.children.length,0);
});
