import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {parseInfantryAsset} from '../src/render/infantryAsset.ts';
import {InfantryMotion,modelHeading} from '../src/render/infantryMotion.ts';

const url=new URL('../src/render/assets/infantry.bin',import.meta.url);
const read=()=>Uint8Array.from(readFileSync(url)).buffer;
test('v11 packs a single indexed infantry model and finite selective colors and transforms for both clips',()=>{
 const a=parseInfantryAsset(read());
 const source=readFileSync(new URL('../data/art/rouge-infantry-v11.glb',import.meta.url));
 const model=JSON.parse(source.toString('utf8',20,20+source.readUInt32LE(12)));
 const triangleCount=model.nodes.filter(node=>node.mesh!==undefined).reduce((sum,node)=>
  sum+model.meshes[node.mesh].primitives.reduce((count,p)=>count+model.accessors[p.indices].count/3,0),0);
 assert.equal(a.indices.length/3,triangleCount);
 assert.ok(triangleCount<=6230);assert.ok(a.positions.length/3<5800);
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
test('fabric changes do not alter any world-space idle, walk, shoot or flash pose samples',()=>{
 const b=read(),a=parseInfantryAsset(b);
 assert.equal(a.idleFrame,40);assert.equal(a.poseCount,41);
 const row=a.joints*12,bytesPerRow=row*4,start=b.byteLength-a.poseCount*bytesPerRow;
 const last=a.palette.subarray(a.idleFrame*row,(a.idleFrame+1)*row);
 assert.notDeepEqual(last,a.palette.subarray(0,row));
 // Removing the former arm overlay changes discovery order only. Recover
 // the previous order and verify every pose sample, including idle/flash.
 const flashId=14,priorOrder=[0,1,2,3,4,5,18,6,7,8,9,10,11,12,13,14,15,16,17,19,20];
 const poseDigest=createHash('sha256');
 for(let f=0;f<a.poseCount;f++) for(const j of priorOrder)
  poseDigest.update(new Uint8Array(b,start+f*bytesPerRow+j*48,48));
 assert.equal(poseDigest.digest('hex'),'dd58b1ea40881624e108144463c098f75b12c24c01735df55022404620d1c32a');
 const pose=(i,frame=a.idleFrame)=>a.palette.subarray(frame*row+i*12,frame*row+(i+1)*12);
 const [leftFoot,rightFoot]=[6,7].map(i=>pose(i));
 assert.ok(Math.abs(leftFoot[3]+rightFoot[3])<1e-5);
 assert.ok(Math.abs(leftFoot[7]-rightFoot[7])<1e-5);
 assert.ok(Math.abs(leftFoot[11]-rightFoot[11])<1e-5);
 assert.ok(leftFoot[3]>.095&&leftFoot[3]<.11,'attention with heels together');
 assert.ok([leftFoot,rightFoot].every(m=>Math.abs(m[5]-1)<1e-6),'both soles flat');
 const rifle=pose(11),leftHand=pose(2);
 assert.ok(Math.abs(rifle[1])+Math.abs(rifle[9])<1e-6&&Math.abs(rifle[5]-1)<1e-6,'shaft stands vertically in idle');
 const point=(m,[x,y,z])=>[0,4,8].map(i=>m[i]*x+m[i+1]*y+m[i+2]*z+m[i+3]);
 const shaft=point(rifle,[0,-.16815383997449906,-.036]),palm=point(leftHand,[.014,-.060,.029]);
 assert.ok(shaft.every((v,i)=>Math.abs(v-palm[i])<1e-6),'shaft stays in the anatomical left hand');
 const bounds=(id)=>Array.from(a.weights.keys()).filter(i=>a.jointPair[2*i]===id).map(i=>point(pose(id),a.positions.subarray(i*3,i*3+3))[1]);
 const gun=bounds(11),head=bounds(0),boot=bounds(6);
 assert.ok(Math.abs(Math.min(...gun)-Math.min(...boot))<.003,'stock and boot sole stand on the same plane');
 assert.ok(Math.abs(Math.max(...gun)-Math.max(...head))<.055,'bayonet tip is approximately level with the character silhouette');
 for(let f=0;f<a.poseCount;f++){
  const muzzle=point(pose(11,f),[0,.57855,0]),flash=point(pose(flashId,f),[0,0,0]);
  assert.ok(muzzle.every((v,i)=>Math.abs(v-flash[i])<1e-6),'flash follows the shortened muzzle, not the bayonet');
 }
});
test('authored Idle clip has a fixed pose even when played in a GLB editor',()=>{
 const source=readFileSync(new URL('../data/art/rouge-infantry-v11.glb',import.meta.url));
 const jsonBytes=source.readUInt32LE(12),binOffset=28+jsonBytes;
 const model=JSON.parse(source.toString('utf8',20,20+jsonBytes));
 const clip=model.animations.find(a=>a.name==='Idle');
 assert.ok(clip);
 assert.ok(clip.channels.some(c=>model.nodes[c.target.node].name==='musket'));
 for(const sampler of clip.samplers){
  assert.equal(sampler.interpolation,'STEP');
  const acc=model.accessors[sampler.output],view=model.bufferViews[acc.bufferView];
  const start=binOffset+(view.byteOffset??0)+(acc.byteOffset??0),n=view.byteLength/2;
  assert.equal(acc.count,2);
  assert.deepEqual(source.subarray(start,start+n),source.subarray(start+n,start+n*2));
 }
});
test('source GLB retains separately authored bayonet and muzzle flash',()=>{
 const source=readFileSync(new URL('../data/art/rouge-infantry-v11.glb',import.meta.url));
 const jsonBytes=source.readUInt32LE(12);
 const model=JSON.parse(source.toString('utf8',20,20+jsonBytes));
 const rifle=model.nodes.find(n=>n.name==='musket');
 assert.ok(rifle,'rifle node remains');
 const parts=rifle.children.map(i=>model.nodes[i].name);
 for(const name of ['Carved walnut silhouette','Upper metal silhouette','Prop tip','Silvery tapered point','flash'])assert.ok(parts.includes(name),name);
 assert.ok(['Walk','Shoot'].every(clip=>model.animations.some(a=>a.name===clip)));
});
test('straps and right armband are marked on the original cloth, never overlay geometry',()=>{
 const src=readFileSync(new URL('../data/art/rouge-infantry-v11.glb',import.meta.url));
 const model=JSON.parse(src.toString('utf8',20,20+src.readUInt32LE(12)));
 for(const name of ['Cross belt top','Cross belt under','Blue-cream armband field R','Cream armband stripe R'])
  assert.ok(!model.nodes.some(n=>n.name===name),name);
 const a=parseInfantryAsset(read()),counts=[0,0,0,0];
 for(let i=0;i<a.fabric.length;i++){
  const id=a.fabric[i];counts[id]++;
  if(id===0)continue;
  if(id===3){
   assert.equal(a.jointPair[2*i],1,'rigid chest placket aligns to the painted coat');
   assert.equal(a.tint[i],176);
   continue;
  }
  assert.equal(a.tint[i],208,'original faction tint stays on the cloth');
  if(id===2)assert.equal(a.jointPair[2*i],18,'right upper sleeve only');
  else assert.ok([12,13].includes(a.jointPair[2*i]),'skinned coat only');
 }
 assert.deepEqual(counts.slice(1),[320,60,24]);
 for(let i=0;i<a.indices.length;i+=3) {
  const ids=[0,1,2].map(k=>a.fabric[a.indices[i+k]]);
  assert.ok(ids.every(id=>id===ids[0]),'paint class is constant across each face');
 }
 const bad=read();new DataView(bad).setUint8(32+9,255);
 assert.throws(()=>parseInfantryAsset(bad),/fabric pattern/);
});
test('malformed or truncated asset takes the error path',()=>{
 const b=read(),view=new DataView(b);assert.throws(()=>parseInfantryAsset(b.slice(0,b.byteLength-4)),/length/);
 assert.throws(()=>parseInfantryAsset(b.slice(0,b.byteLength-view.getUint32(16,true)*12*4)),/length/);
 view.setUint32(4,2,true);assert.throws(()=>parseInfantryAsset(b),/header/);
 view.setUint32(0,0);assert.throws(()=>parseInfantryAsset(b),/header/);
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

test('attack turns take the short arc and finish before firing, even with lateral collision movement',()=>{
 const motion=new InfantryMotion(),army=new Map([[4,Math.PI-.1]]);
 const soldier=(x,cooldown,lastShotHeading)=>unit({x,cooldown,lastShotHeading,army:4,kind:'infantry',armyStatus:'field'});
 motion.update(state(0,[soldier(0,0,undefined)]),0,undefined,army);
 motion.update(state(2,[soldier(.1,1,-Math.PI+.1)]),100,undefined,army);
 const t=motion.track(7),aim=-Math.PI+.1;
 assert.equal(modelHeading(t,100),Math.PI-.1);
 assert.ok(Math.abs(Math.abs(modelHeading(t,155))-Math.PI)<1e-8);
 assert.equal(modelHeading(t,t.shotAt),aim);
 assert.ok(t.shotAt>155);
 motion.update(state(4,[soldier(.2,.9,aim)]),220,undefined,army);
 assert.equal(modelHeading(t,400),aim);
 motion.update(state(10,[soldier(.2,.6,aim)]),600,undefined,army);
 motion.update(state(16,[soldier(.3,.3,aim)]),900,undefined,army);
 assert.equal(modelHeading(t,1050),Math.PI/2);
});

test('an embarked unit has no attack track and an unlimbered bearing accounts for the rear-facing towed gun',()=>{
 const motion=new InfantryMotion({horseArtillery:Math.PI});
 motion.update(state(0,[unit({kind:'horseArtillery',cooldown:1,lastShotHeading:0})]),0);
 assert.equal(modelHeading(motion.track(7),0),Math.PI);
 motion.update(state(2,[unit({kind:'horseArtillery',transport:{embarked:true}})]),100);
 assert.equal(motion.track(7),undefined);
});

test('bake preserves the GLB painted navy colors while retaining the nation tint mask',()=>{
 const source=readFileSync(new URL('../data/art/rouge-infantry-v11.glb',import.meta.url));
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
