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

test('atlas corruption cannot make valid modern geometry fall back to the old boxes',async()=>{
 const {readBuildingBundle}=await import('../src/render/buildingAsset.ts');
 const bytes=Buffer.from(readFileSync(new URL('../src/render/assets/modern-buildings.glb',import.meta.url)));
 const n=bytes.readUInt32LE(12),model=JSON.parse(bytes.toString('utf8',20,20+n));
 const image=model.bufferViews[model.images[0].bufferView];
 bytes[28+n+image.byteOffset]=0; // Corrupt only the atlas marker; all mesh bytes are untouched.
 const bundle=readBuildingBundle(Uint8Array.from(bytes).buffer);
 assert.equal(bundle.atlas,null);
 assert.deepEqual([...bundle.geometries.values()].map(g=>g.index.length/3),[146,260,248,180]);
});

test('models replace placeholder geometry before atlas completion and survive failed image decode',async()=>{
 const {readBuildingBundle}=await import('../src/render/buildingAsset.ts');
 const bytes=readFileSync(new URL('../src/render/assets/modern-buildings.glb',import.meta.url));
 const bundle=readBuildingBundle(Uint8Array.from(bytes).buffer);
 assert.ok(bundle.atlas);
 let rejectDecode;
 const decode=new Promise((_,reject)=>{rejectDecode=reject;});
 const scene=new THREE.Scene(),batch=new TownBuildings(scene,()=>{},{load:async()=>bundle,decode:()=>decode});
 let slots=0;
 const draw=()=>{batch.begin(true);for(const kind of BUILDING_ART_KINDS)batch.add(kind,slots++,LAND_Y,0,0);batch.end();};
 try{
  draw();assert.equal(batch.fallbackCount,4);assert.equal(batch.assetState,'loading');
  await new Promise(setImmediate);
  draw();assert.equal(batch.fallbackCount,0);assert.equal(batch.assetState,'modern-v3-untextured');assert.equal(batch.assetIssue,'atlas-loading');
  rejectDecode(Error('Image decoder refused bytes'));
  await new Promise(setImmediate);
  draw();assert.equal(batch.fallbackCount,0);assert.equal(batch.assetState,'modern-v3-untextured');assert.equal(batch.assetIssue,'atlas-decode');
  assert.deepEqual(BUILDING_ART_KINDS.map(k=>batch.count(k)),[1,1,1,1]);
  const models=batch.group.children.slice(1);
  assert.deepEqual(models.map(m=>m.geometry.index.count/3),[146,260,248,180]);
  assert.ok(models.every(m=>m.material.map===null));
 }finally{batch.dispose();}
});

test('a transient package request retries once; permanent HTTP failures are reported',async()=>{
 const {loadBuildingBundle}=await import('../src/render/buildingAsset.ts');
 const bytes=readFileSync(new URL('../src/render/assets/modern-buildings.glb',import.meta.url));
 let attempts=0;
 const valid=await loadBuildingBundle(async(_url,options)=>{
  if(++attempts===1)throw new TypeError('simulated initial network failure');
  assert.equal(options.cache,'reload');
  return new Response(Uint8Array.from(bytes));
 });
 assert.equal(attempts,2);assert.equal(valid.geometries.size,4);
 attempts=0;
 await assert.rejects(loadBuildingBundle(async()=>{
  attempts++;return new Response(null,{status:503});
 }),{code:'http'});
 assert.equal(attempts,2);
 await assert.rejects(loadBuildingBundle(async()=>new Response(null,{status:404})),{code:'http'});
 await assert.rejects(loadBuildingBundle(async()=>new Response('not a GLB')),{code:'bundle'});
});

test('a decoded atlas upgrades all four already-mounted meshes to one original glTF sampler',async()=>{
 const {readBuildingBundle}=await import('../src/render/buildingAsset.ts');
 const bytes=readFileSync(new URL('../src/render/assets/modern-buildings.glb',import.meta.url));
 const bundle=readBuildingBundle(Uint8Array.from(bytes).buffer);
 const scene=new THREE.Scene();
 let closed=0;
 const batch=new TownBuildings(scene,()=>{},{load:async()=>bundle,decode:async()=>({width:512,height:512,close(){closed++;}})});
 try{
  batch.begin(true);batch.add('house',0,LAND_Y,0,0);batch.end();
  await new Promise(setImmediate);
  assert.equal(batch.assetState,'modern-v3');assert.equal(batch.assetIssue,'');
  const material=batch.group.children[1].material,map=material.map;
  assert.ok(batch.group.children.slice(1).every(mesh=>mesh.material===material));
  assert.equal(map.colorSpace,THREE.SRGBColorSpace);assert.equal(map.flipY,false);
  assert.equal(map.wrapS,THREE.RepeatWrapping);assert.equal(map.wrapT,THREE.RepeatWrapping);
  assert.equal(map.magFilter,THREE.LinearFilter);assert.equal(map.minFilter,THREE.LinearMipmapLinearFilter);
  assert.equal(map.generateMipmaps,true);
 }finally{batch.dispose();}
 assert.equal(closed,1);
});
