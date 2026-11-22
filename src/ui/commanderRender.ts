import * as THREE from 'three';
import {skinColors, type CommanderAppearance, type BodyType,type PartSlot} from '../game/portrait.ts';
import {createCommanderIdle,type CommanderIdle} from './commanderIdle.ts';

type Piece={geometry:string;image:string;kind:'skin'|'hair'|'cloth'|'eye'};
type Option={entity:string;tags?:string[];variants?:Record<string,string|null>};
type Library={options:Record<BodyType,Record<PartSlot,Record<string,Option>>>;models:Record<string,Piece[]>;shapes:Record<BodyType,Record<string,string>>};
const root=import.meta.env.BASE_URL+'commander-parts/';
const buffers=new Map<string,Promise<ArrayBuffer>>(),textures=new Map<string,Promise<THREE.Texture>>();
let library:Promise<Library>|undefined,renderer:THREE.WebGLRenderer|undefined;
function file(name:string) {
 let entry=buffers.get(name);
 if(!entry){entry=fetch(root+name).then(r=>{if(!r.ok)throw new Error(name);return r.arrayBuffer();}).catch(e=>{buffers.delete(name);throw e;});buffers.set(name,entry);}
 return entry;
}
function texture(name:string) {
 let entry=textures.get(name);
 if(!entry){entry=new THREE.TextureLoader().loadAsync(root+name).then(t=>{
  t.flipY=false;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;return t;
 }).catch(e=>{textures.delete(name);throw e;});textures.set(name,entry);}
 return entry;
}
function getLibrary(){
 return library??=fetch(root+'parts.json').then(r=>{if(!r.ok)throw new Error('parts');return r.json() as Promise<Library>;}).catch(e=>{library=undefined;throw e;});
}
export function loadCommanderIdle(body:BodyType){return createCommanderIdle(body,file);}
export async function assembleCommander(a:CommanderAppearance,idle?:CommanderIdle){
 const lib=await getLibrary(),options=lib.options[a.body],head=a.body+'_head_mesh',hat=options.hat[a.hat],hair=options.hair[a.hair];
 let hairstyle:string|null|undefined=hair?.entity;
 for(const tag of hat?.tags??[]){if(hair?.variants&&Object.hasOwn(hair.variants,tag)){hairstyle=hair.variants[tag];break;}}
 const entities=[a.body+'_body_mesh',head,a.body+'_eyes_mesh',a.body+'_teeth_mesh',options.trousers[a.trousers].entity,options.uniform[a.uniform].entity,
  hairstyle,options.beard[a.beard]?.entity,options.mustache[a.mustache]?.entity,hat?.entity,options.shoulders[a.shoulders]?.entity];
 const morphs=idle?.shapes??lib.shapes[a.body],weights:[string,number][]=[['head_bs_cheek_width_max',a.cheek/100],['head_bs_nose_forward_max',a.nose/100],['head_bs_old_1',a.age/100]];
 const deltas=await Promise.all(weights.filter(([k,w])=>w&&morphs[k]).map(async([k,w])=>({offset:new Float32Array(await file(morphs[k])),w})));
 const pieces=await Promise.all(entities.filter((e):e is string=>Boolean(e)).flatMap(entity=>lib.models[entity].map(async p=>{
  const [buf,map,skin]=await Promise.all([file(p.geometry),texture(p.image),idle&&file(idle.skins[p.geometry])]);
  return {p,entity,buf,map,skin};
 })));
 const group=new THREE.Group();group.scale.z=-1;
 for(const {p,entity,buf,map,skin} of pieces){
  const [nv,ni]=new Uint32Array(buf,0,2),base=new Float32Array(skin??buf,8,nv*3),pos=entity===head?base.slice():base;
  if(entity===head)for(const {offset,w} of deltas)for(let i=0;i<pos.length;i++)pos[i]+=offset[i]*w;
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(skin??buf,8+nv*12,nv*3),3));
  const uv=new Float32Array(buf,8+nv*24,nv*2);
  // Keep the iris legible at the lobby camera's full-body distance.
  g.setAttribute('uv',new THREE.BufferAttribute(p.kind==='eye'?uv.map(v=>(v-.5)*.75+.5):uv,2));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf,8+nv*32,ni),1));
  const material=new THREE.MeshStandardMaterial({map,roughness:p.kind==='eye'?.32:.72,metalness:entity.includes('epaulette')?.25:0,
   side:THREE.DoubleSide,alphaTest:p.kind==='hair'?.38:0});
  if(p.kind==='skin')material.color.set(skinColors[a.skin]);
  if(p.kind==='hair')material.color.set(a.hairColor);
  group.add(idle&&skin?idle.mesh(g,material,skin):new THREE.Mesh(g,material));
 }
 return group;
}
export function disposeCommander(group:THREE.Group){
 for(const child of group.children){
  const mesh=child as THREE.Mesh<THREE.BufferGeometry,THREE.Material>;
  if(mesh instanceof THREE.SkinnedMesh)mesh.skeleton.dispose();
  mesh.geometry.dispose();mesh.material.dispose();
 }
}
const cache=new Map<string,Promise<string>>();
export function renderCommander(a:CommanderAppearance,full:boolean,angle=12):Promise<string>{
 const key=JSON.stringify([a,full,angle]);const hit=cache.get(key);if(hit)return hit;
 const result=assembleCommander(a).then(group=>{
  try{
   renderer??=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
   const scene=new THREE.Scene();scene.add(group);scene.add(new THREE.HemisphereLight(0xfff5e8,0xada7a0,1.55));
   for(const [x,y,z,power,color] of [[-120,220,260,2.1,0xffe5cd],[130,150,120,.85,0xdbe9ff],[80,215,-180,1.4,0xffe1b4]]){
    const light=new THREE.DirectionalLight(color,power);light.position.set(x,y,z);scene.add(light);
   }
   const w=full?400:360,h=full?800:450;
   const bounds=new THREE.Box3().setFromObject(group),top=bounds.max.y+4,bottom=full?Math.min(-1,bounds.min.y)-2:top-66;
   const height=top-bottom,halfWidth=height*w/h/2;
   const camera=new THREE.OrthographicCamera(-halfWidth,halfWidth,height/2,-height/2,.1,1200);
   const center=(top+bottom)/2,rad=angle*Math.PI/180;camera.position.set(400*Math.sin(rad),center+12,400*Math.cos(rad));camera.lookAt(0,center,0);
   renderer.setSize(w,h,false);renderer.setClearColor(0,0);renderer.render(scene,camera);
   return renderer.domElement.toDataURL('image/png');
  }finally{disposeCommander(group);}
 }).catch(e=>{cache.delete(key);throw e;});
 if(cache.size>=32)cache.delete(cache.keys().next().value!);cache.set(key,result);return result;
}
