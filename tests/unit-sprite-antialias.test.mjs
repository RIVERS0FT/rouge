import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createUnitSpriteMesh,createUnitSpriteTexture} from '../src/render/unitSprites.ts';

test('sprite texture uses a bounded padded POT atlas and trilinear minification',()=>{
 const oldDocument=globalThis.document;
 const origins=[],gradient={addColorStop(){}};
 const context=new Proxy({translate(x,y){origins.push([x,y]);},createLinearGradient(){return gradient;}},{get:(target,key)=>target[key]??(()=>{})});
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>context})};
 try{
  const texture=createUnitSpriteTexture();
  assert.equal(texture.image.width,512);assert.equal(texture.image.height,512);
  assert.equal(texture.minFilter,THREE.LinearMipmapLinearFilter);
  assert.equal(texture.magFilter,THREE.LinearFilter);assert.equal(texture.generateMipmaps,false);
  assert.deepEqual(texture.mipmaps.map(mip=>mip.width),[512,256,128,64,32,16,8,4,2,1]);
  assert.equal(texture.wrapS,THREE.ClampToEdgeWrapping);assert.equal(texture.wrapT,THREE.ClampToEdgeWrapping);
  assert.equal(origins.length,9);assert.equal(new Set(origins.map(String)).size,9);
  assert.deepEqual(origins[8],[0,256]);texture.dispose();
 }finally{globalThis.document=oldDocument;}
});

test('batched sprite shader maps canvas rows upright and preserves fractional alpha',()=>{
 const texture=new THREE.Texture(),mesh=createUnitSpriteMesh(texture,1024);
 assert.equal(mesh.material.alphaTest,0);assert.equal(mesh.material.transparent,true);
 const shader={vertexShader:'#include <uv_vertex>'};mesh.material.onBeforeCompile(shader);
 assert.match(shader.vertexShader,/mod\(unitGlyph, 4\.0\)/);
 assert.match(shader.vertexShader,/3\.0 - floor\(unitGlyph \/ 4\.0\)/);
 assert.match(shader.vertexShader,/vec2\(4\.0, 4\.0\)/);
 assert.equal(mesh.material.customProgramCacheKey(),'unit-counter-atlas-v2');
 mesh.dispose();mesh.geometry.dispose();mesh.material.dispose();texture.dispose();
});
