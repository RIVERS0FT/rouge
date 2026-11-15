import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseInfantryAsset} from '../src/render/infantryAsset.ts';
import {InfantryMotion} from '../src/render/infantryMotion.ts';

const url=new URL('../src/render/assets/infantry.bin',import.meta.url);
const read=()=>Uint8Array.from(readFileSync(url)).buffer;
test('v10 packs a single indexed infantry model and finite selective colors and transforms for both clips',()=>{
 const a=parseInfantryAsset(read());
 assert.equal(a.indices.length/3,6438);assert.ok(a.positions.length/3<6500);
 assert.equal(a.walkFrames,25);assert.equal(a.shootFrames,15);assert.equal(a.fps,24);
 assert.ok(a.palette.length<(a.positions.length*a.walkFrames));
 assert.ok(a.joints<25);
 assert.ok(a.tint.some(n=>n>0)&&a.tint.some(n=>n===0));
 assert.ok(a.glow.some(n=>n===255));
 const frame=a.joints*12;
 for(const base of [0,a.walkFrames*frame]){
   assert.notDeepEqual(a.palette.subarray(base,base+frame),a.palette.subarray(base+frame,base+2*frame));
 }
 assert.ok(a.weights.some(n=>n>0&&n<255));
});
test('malformed or truncated asset takes the error path',()=>{
 const b=read();assert.throws(()=>parseInfantryAsset(b.slice(0,b.byteLength-4)),/length/);
 new DataView(b).setUint32(0,0);assert.throws(()=>parseInfantryAsset(b),/header/);
});
const unit=(extra={})=>Object.freeze({id:7,owner:0,x:0,z:0,cooldown:0,...extra});
const state=(tick,u,campaign='demo')=>Object.freeze({tick,units:Object.freeze(u),campaign});
test('only an authoritative cooldown reset starts a shot, even after skipped snapshot ticks',()=>{
 const motion=new InfantryMotion(),visible=new Set([7]);
 assert.equal(motion.update(state(0,[unit({cooldown:.7})]),0,visible),false);
 assert.equal(motion.update(state(2,[unit({cooldown:.6})]),100,visible),false);
 assert.equal(motion.update(state(5,[unit({cooldown:.51})]),200,visible),true);
 assert.equal(motion.track(7).shotAt,200);
 assert.equal(motion.active(400,visible),true);assert.equal(motion.active(400,new Set()),false);
 assert.equal(motion.update(state(5,[unit({cooldown:.7})]),220,visible),false);
 assert.equal(motion.active(900,visible),false);
});
test('latest movement sets heading, while reused ids/embarked units clear stale animation state',()=>{
 const motion=new InfantryMotion();
 motion.update(state(0,[unit()]),0);
 motion.update(state(2,[unit({x:.2})]),100);
 assert.equal(motion.track(7).heading,Math.PI/2);assert.equal(motion.active(250,new Set([7])),true);
 motion.update(state(4,[unit({x:.2,transport:{embarked:true}})]),200);
 assert.equal(motion.track(7),undefined);
 motion.update(state(1,[unit({x:.2})],'new'),250);
 assert.equal(motion.active(260,new Set([7])),false);
});

test('bake preserves the GLB painted navy colors while retaining the nation tint mask',()=>{
 const source=readFileSync(new URL('../data/art/rouge-infantry-v10.glb',import.meta.url));
 const jsonBytes=source.readUInt32LE(12),binOffset=28+jsonBytes;
 const model=JSON.parse(source.toString('utf8',20,20+jsonBytes));
 const paint=model.materials.findIndex(m=>m.name==='Navy wool | painted');
 assert.ok(paint>=0);
 const points=[];
 for(const mesh of model.meshes)for(const primitive of mesh.primitives){
  if(primitive.material!==paint)continue;
  const a=model.accessors[primitive.attributes.COLOR_0],b=model.bufferViews[a.bufferView];
  assert.equal(a.type,'VEC3');assert.equal(a.componentType,5126);
  const offset=binOffset+(a.byteOffset??0)+(b.byteOffset??0),stride=b.byteStride??12;
  const factor=model.materials[paint].pbrMetallicRoughness?.baseColorFactor??[1,1,1];
  for(let i=0;i<a.count;i++){
   points.push([0,1,2].map(c=>Math.round(255*factor[c]*source.readFloatLE(offset+stride*i+c*4))));
  }
 }
 assert.ok(points.length>500);
 const baked=parseInfantryAsset(read()),tinted=new Set();
 for(let i=0;i<baked.tint.length;i++)if(baked.tint[i]===208)tinted.add(baked.colors.subarray(i*3,i*3+3).join(','));
 assert.ok(tinted.size>=8,'paint color varies across the tinted navy fabric');
 for(const triple of tinted){
  const rgb=triple.split(',').map(Number);
  // Blender's BYTE_COLOR color attribute quantizes after import; allow
  // one byte of linear round-trip rounding, not palette replacement.
  assert.ok(points.some(p=>p.every((n,c)=>Math.abs(n-rgb[c])<=1)),`unexpected baked navy color: ${triple}`);
 }
});
