import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {OCEAN_LABEL_WORLD_WIDTH} from '../src/render/oceanLabels.ts';
import {LAND_Y} from '../src/game/mapHeight.ts';

test('ocean text has a fixed world size and perspective scales it with the map',()=>{
 const camera=new THREE.PerspectiveCamera(40,1.5,.05,20000);camera.up.set(0,0,-1);
 const width=(distance)=>{
  camera.position.set(0,distance,0);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const left=new THREE.Vector3(-OCEAN_LABEL_WORLD_WIDTH/2,LAND_Y+.9,0).project(camera);
  const right=new THREE.Vector3(OCEAN_LABEL_WORLD_WIDTH/2,LAND_Y+.9,0).project(camera);
  return right.x-left.x;
 };
 assert.ok(OCEAN_LABEL_WORLD_WIDTH>0&&OCEAN_LABEL_WORLD_WIDTH<1000);
 assert.ok(Math.abs(width(1000)/width(2000)-2)<.003,'Zooming twice enlarges text twice instead of cancelling perspective');
 const renderer=readFileSync(new URL('../src/render/WorldRenderer.ts',import.meta.url),'utf8');
 assert.match(renderer,/const w=ocean\?OCEAN_LABEL_WORLD_WIDTH:this\.distance\*0\.15/);
 assert.match(renderer,/sprite\.scale\.set\(w,w\*96\/512,1\)/);
 assert.match(renderer,/x=nearestWorldX\(x,this\.focus\.x\)/,'Wrapping remains map-relative');
});
