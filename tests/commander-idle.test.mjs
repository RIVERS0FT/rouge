import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {BufferGeometry,MeshBasicMaterial,Vector3} from 'three';
import {createCommanderIdle} from '../src/ui/commanderIdle.ts';

const parts=new URL('../public/commander-parts/',import.meta.url);
async function readPart(name){
 const bytes=await readFile(new URL(name,parts));
 return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
}

for(const body of ['male','female'])test(body+' neck follows the collar through idle loops and crossfades',async()=>{
 const idle=await createCommanderIdle(body,readPart);
 const {models}=JSON.parse(await readFile(new URL('parts.json',parts),'utf8'));
 const skin=idle.skins[models[body+'_head_mesh'][0].geometry];
 const mesh=idle.mesh(new BufferGeometry(),new MeshBasicMaterial(),await readPart(skin));
 let root=mesh.skeleton.bones[0];
 while(root.parent)root=root.parent;
 const neck=root.getObjectByName('bn_h_neck_1'),collar=root.getObjectByName('bn_sp_cervical');
 const a=new Vector3(),b=new Vector3(),seen=new Set();
 // Two complete laps also exercise the first clip beyond its randomized start phase.
 for(let frame=0;frame<160*30;frame++){
  idle.update(1/30);seen.add(idle.name);
  const gap=a.setFromMatrixPosition(neck.matrixWorld).distanceTo(b.setFromMatrixPosition(collar.matrixWorld));
  assert.ok(gap<.2,`${body} ${idle.name}: neck and collar are ${gap.toFixed(2)} cm apart`);
 }
 assert.equal(seen.size,8);
 mesh.skeleton.dispose();mesh.geometry.dispose();mesh.material.dispose();
});
