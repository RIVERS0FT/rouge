import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {KINDS} from '../src/game/content.ts';
import {UNIT_GLYPHS,unitGlyph,unitRenderMode,unitSpritePixels,unitSpriteWorldSize,unitPresentationChanged} from '../src/render/unitPresentation.ts';
import {createUnitSpriteMesh} from '../src/render/unitSprites.ts';

test('2D and 3D units switch exclusively at the existing map mode boundary',()=>{
 for(const relief of [0,.1,.499,.5])assert.equal(unitRenderMode(relief),'2d');
 for(const relief of [.501,.9,1])assert.equal(unitRenderMode(relief),'3d');
});
test('every army kind has a unique 2D glyph and shares a transport glyph when embarked',()=>{
 assert.equal(new Set(KINDS.map(kind=>unitGlyph(kind))).size,KINDS.length);
 assert.deepEqual(UNIT_GLYPHS.slice(0,-1),KINDS);
 for(const kind of KINDS){assert.ok(unitGlyph(kind)>=0);assert.equal(unitGlyph(kind,true),8);}
});
test('strategic sprites keep bounded CSS-pixel sizes at desktop and phone heights',()=>{
 for(const distance of [5,90,205,320,2000,4400])for(const height of [390,844,960]){
  const pixels=unitSpritePixels(distance);assert.ok(pixels>=7&&pixels<=16);
  const scale=unitSpriteWorldSize(distance,height,pixels);
  assert.ok(Math.abs(scale*height/(2*distance*Math.tan(20*Math.PI/180))-pixels)<1e-10);
 }
});
test('sprite batches support large armies with one shared material and one glyph per instance',()=>{
 const texture=new THREE.Texture();
 for(const capacity of [512,1024,16384]){
  const mesh=createUnitSpriteMesh(texture,capacity);
  assert.equal(mesh.count,0);assert.equal(mesh.instanceMatrix.count,capacity);
  assert.equal(mesh.geometry.getAttribute('unitGlyph').count,capacity);
  assert.equal(mesh.material.map,texture);assert.equal(mesh.material.depthTest,false);
  assert.equal(mesh.material.depthWrite,false);assert.equal(mesh.frustumCulled,false);
  mesh.dispose();mesh.geometry.dispose();mesh.material.dispose();
 }
 texture.dispose();
});

const visualUnit={id:1,owner:0,kind:'infantry',x:10,z:20};
test('tick, cooldown and health-only snapshots do not redraw a strategic map',()=>{
 assert.equal(unitPresentationChanged([visualUnit],[{...visualUnit,hp:40,cooldown:2}],2400,960),false);
});
test('strategic movement accumulates against the last draw until it spans half a pixel',()=>{
 const threshold=unitSpriteWorldSize(2400,960,.5);
 assert.equal(unitPresentationChanged([visualUnit],[{...visualUnit,x:10+threshold*.75}],2400,960),false);
 assert.equal(unitPresentationChanged([visualUnit],[{...visualUnit,x:10+threshold*1.25}],2400,960),true);
 assert.equal(unitPresentationChanged([visualUnit],[{...visualUnit,z:20+threshold*1.25}],2400,960),true);
});
test('count, identity, ownership, class and embarkation changes invalidate immediately',()=>{
 assert.equal(unitPresentationChanged([], [visualUnit],2400,960),true);
 assert.equal(unitPresentationChanged([visualUnit],[],2400,960),true);
 for(const change of [{id:2},{owner:1},{kind:'cavalry'},{transport:{embarked:true}}]){
  assert.equal(unitPresentationChanged([visualUnit],[{...visualUnit,...change}],2400,960),true);
 }
});
