import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';
// Exercise the actual Three renderer queue; a declarative z-index list alone
// cannot catch grouped children or opaque entities that render too early.
import {WebGLRenderList} from 'three/src/renderers/webgl/WebGLRenderLists.js';
import {MAP_LAYERS,layerMapEntity} from '../src/render/mapLayers.ts';
import {nativeBorderTiles,wideBorderTiles} from '../src/render/mapGeometryTiles.ts';

test('real Three render queues compose tiled borders and route overlays below depth-occluding entities',()=>{
 const scene=new THREE.Scene(),atlas=new THREE.Group(),positions=new Float32Array([0,0,0,1,0,0]);
 scene.add(atlas);
 const region=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({transparent:true,depthWrite:false}));
 region.renderOrder=MAP_LAYERS.regionBorder;region.name='region';
 const country=new LineSegments2(new LineSegmentsGeometry().setPositions(positions),new LineMaterial({transparent:true,depthWrite:false}));
 country.renderOrder=MAP_LAYERS.countryBorder;country.name='country';
 atlas.add(nativeBorderTiles(region,[{positions}]),wideBorderTiles(country,128,[{positions}]));
 const mesh=(name,reference,transparent=true)=>{
  const obj=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial({transparent,depthWrite:!transparent}));
  obj.name=name;obj.renderOrder=reference;return obj;
 };
 const routes=mesh('route',MAP_LAYERS.route);routes.material.depthTest=false;
 const entity=mesh('entity',0,false);layerMapEntity(entity,entity.material);
 const duplicateAtlas=atlas.clone(),map=new THREE.Group();map.add(...duplicateAtlas.children.slice());
 scene.add(map,entity,routes,mesh('name',MAP_LAYERS.countryName),mesh('outline',MAP_LAYERS.selectedBorder),mesh('glow',MAP_LAYERS.hoverGlow),mesh('base',0,false));
 const queues=new WebGLRenderList();
 function visit(object,groupOrder=0){
  if(object.isGroup)groupOrder=object.renderOrder;
  if(object.material)queues.push(object,object.geometry,object.material,groupOrder,object.id%2?50:100,null);
  for(const child of object.children)visit(child,groupOrder);
 }
 visit(scene);queues.sort();
 assert.deepEqual(queues.opaque.map(item=>item.object.name),['base']);
 assert.deepEqual(queues.transparent.map(item=>item.object.name),['coastline-tile','coastline-tile','country-border-tile','country-border-tile','glow','outline','name','route','entity']);
 assert.equal(routes.material.depthTest,false);assert.equal(routes.material.depthWrite,false);
 assert.equal(entity.material.depthTest,true);assert.equal(entity.material.depthWrite,true);
 assert.equal(entity.material.blending,THREE.NoBlending);assert.equal(entity.material.forceSinglePass,true);
});
