import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {installOceanSurface,OCEAN_RIPPLE_CONTRAST,OCEAN_REFLECTION_STRENGTH} from '../src/render/oceanSurface.ts';

test('water shading is bounded, static and follows the existing view transition',()=>{
 const material=new THREE.MeshBasicMaterial(),near={value:0};
 installOceanSurface(material,near);
 const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>'};
 material.onBeforeCompile(shader,{});
 assert.equal(shader.uniforms.uOceanNear,near);
 assert.ok(OCEAN_RIPPLE_CONTRAST<=.06);assert.ok(OCEAN_REFLECTION_STRENGTH<=.08);
 assert.match(shader.fragmentShader,/fwidth\(phase\)/);
 assert.match(shader.fragmentShader,/cameraPosition - vOceanWorld/);
 assert.doesNotMatch(shader.vertexShader,/transformed\s*[.\[]|transformed\s*=/);
 assert.doesNotMatch(shader.fragmentShader,/uTime|texture2D|discard/);
 near.value=1;assert.equal(shader.uniforms.uOceanNear.value,1);
 assert.match(material.customProgramCacheKey(),/ocean-surface-v1/);
 material.dispose();
});
test('no ocean-bottom asset or animation is attached to the renderer',()=>{
 const surface=readFileSync(new URL('../src/render/mapSurface.ts',import.meta.url),'utf8');
 const ocean=readFileSync(new URL('../src/render/oceanSurface.ts',import.meta.url),'utf8');
 assert.doesNotMatch(surface,/natural-earth-ocean|oceanUrls/);
 assert.doesNotMatch(ocean,/requestAnimationFrame|setInterval|setTimeout|heightAt|provinceAt|navigation/);
 assert.match(surface,/oceanAnimation='static'/);
});
test('longitude ripple phases meet at the date line',()=>{
 for(const v of [0,.25,.51,1]){
  const phases=u=>[2*Math.PI*(72*u+190*v)+.7*Math.sin(2*Math.PI*u*9),2*Math.PI*(-48*u+127*v)+.55*Math.sin(2*Math.PI*v*17),2*Math.PI*(360*u+720*v)];
  const left=phases(0),right=phases(1);
  for(let i=0;i<3;i++)assert.ok(Math.abs(Math.sin(left[i])-Math.sin(right[i]))<1e-10);
 }
});
