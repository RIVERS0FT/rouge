import * as THREE from 'three';
import type {BodyType} from '../game/portrait.ts';

type Track=[number,'position'|'quaternion',number,number];
type Rig={bones:string[];parents:number[];shapes:Record<string,string>;data:string;
 clips:{name:string;duration:number;count:number;tracks:Track[]}[]};
type Manifest={rigs:Record<BodyType,Rig>;skins:Record<string,string>};
type ReadPart=(name:string)=>Promise<ArrayBuffer>;
async function loadRig(body:BodyType,read:ReadPart){
 const manifest:Manifest=JSON.parse(new TextDecoder().decode(await read('idle.json')));
 const rig=manifest.rigs[body],data=new Float32Array(await read(rig.data));
 const clips=rig.clips.map(clip=>{
  const times=Float32Array.from({length:clip.count},(_,i)=>i*clip.duration/(clip.count-1));
  const tracks=clip.tracks.map(([index,prop,offset,count])=>{
   const bone=rig.bones[index]+'.'+prop,keys=count===1?times.subarray(0,1):times;
   return prop==='position'?new THREE.VectorKeyframeTrack(bone,keys,data.subarray(offset,offset+count*3)):
    new THREE.QuaternionKeyframeTrack(bone,keys,data.subarray(offset,offset+count*4));
  });
  return new THREE.AnimationClip(clip.name,clip.duration,tracks);
 });
 return {rig,clips,skins:manifest.skins};
}
const rigs=new Map<BodyType,ReturnType<typeof loadRig>>();
export async function createCommanderIdle(body:BodyType,read:ReadPart){
 let assets=rigs.get(body);
 if(!assets){assets=loadRig(body,read).catch(error=>{rigs.delete(body);throw error;});rigs.set(body,assets);}
 return new CommanderIdle(body,await assets);
}

/** Each officer owns a clock and bones. Immutable clips are shared by all officers of the same body type. */
export class CommanderIdle{
 private root=new THREE.Group();
 private bones:THREE.Bone[];
 private mixer=new THREE.AnimationMixer(this.root);
 private actions:THREE.AnimationAction[];
 private bag:THREE.AnimationAction[]=[];
 private current:THREE.AnimationAction;
 private remaining:number;
 readonly skins:Record<string,string>;
 readonly shapes:Record<string,string>;
 readonly body:BodyType;
 constructor(body:BodyType,{rig,clips,skins}:Awaited<ReturnType<typeof loadRig>>){
  this.body=body;this.skins=skins;this.shapes=rig.shapes;
  this.bones=rig.bones.map(name=>{const bone=new THREE.Bone();bone.name=name;return bone;});
  this.bones.forEach((bone,i)=>(this.bones[rig.parents[i]]??this.root).add(bone));
  this.actions=clips.map(clip=>this.mixer.clipAction(clip));
  this.current=this.next().play();
  const duration=this.current.getClip().duration;
  this.current.time=Math.random()*duration*.4;
  this.remaining=duration-this.current.time;
  this.update(0);
 }
 get name(){return this.current.getClip().name;}
 private next(){
  if(!this.bag.length)this.bag=[...this.actions];
  const choices=this.bag.filter(action=>action!==this.current);
  const next=choices[Math.floor(Math.random()*choices.length)];
  this.bag.splice(this.bag.indexOf(next),1);
  return next;
 }
 update(seconds:number){
  this.remaining-=seconds;
  if(this.remaining<=0){
   const next=this.next().reset().play();
   this.current.crossFadeTo(next,.55,false);
   this.current=next;this.remaining=next.getClip().duration;
  }
  this.mixer.update(seconds);this.root.updateMatrixWorld(true);
 }
 mesh(geometry:THREE.BufferGeometry,material:THREE.Material,skin:ArrayBuffer){
  const [vertices,count]=new Uint32Array(skin,0,2);
  const indices=8+24*vertices,weights=indices+4*vertices,binds=weights+4*vertices;
  geometry.setAttribute('skinIndex',new THREE.BufferAttribute(new Uint8Array(skin,indices,vertices*4),4));
  geometry.setAttribute('skinWeight',new THREE.BufferAttribute(new Uint8Array(skin,weights,vertices*4),4,true));
  const matrices=new Float32Array(skin,binds,count*16),ids=new Uint8Array(skin,binds+count*64,count);
  const skeleton=new THREE.Skeleton(Array.from(ids,i=>this.bones[i]),Array.from(ids,(_,i)=>new THREE.Matrix4().fromArray(matrices,i*16)));
  const mesh=new THREE.SkinnedMesh(geometry,material);
  // The shared armature is evaluated in character space, independent of the lobby seat and drag rotation.
  mesh.bindMode=THREE.DetachedBindMode;mesh.bind(skeleton,new THREE.Matrix4());mesh.frustumCulled=false;
  return mesh;
 }
}
