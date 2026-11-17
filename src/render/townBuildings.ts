import * as THREE from 'three';
import {HOUSE_DEPTH,HOUSE_HEIGHT,HOUSE_WIDTH} from '../game/buildings.ts';
import {BUILDING_ART_KINDS,BUILDING_ART_SCALE,BUILDING_RENDER_LIMIT,type BuildingArtKind} from './buildingPresentation.ts';

type ModelMesh=THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
async function fetchArchitecture(){
 const response=await fetch(new URL('./assets/modern-buildings.glb',import.meta.url));
 if(!response.ok)throw new Error(`Building art HTTP ${response.status}`);
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 return (await new GLTFLoader().parseAsync(await response.arrayBuffer(),'')).scene;
}
function disposeAsset(asset:THREE.Group) {
 const textures=new Set<THREE.Texture>(),materials=new Set<THREE.Material>(),geometry=new Set<THREE.BufferGeometry>();
 asset.traverse(node=>{
  if(!(node instanceof THREE.Mesh))return;
  geometry.add(node.geometry);
  for(const material of (Array.isArray(node.material)?node.material:[node.material])){
   materials.add(material);
   if(material instanceof THREE.MeshStandardMaterial&&material.map)textures.add(material.map);
  }
 });
 for(const m of materials)m.dispose();
 for(const g of geometry)g.dispose();
 for(const t of textures){t.dispose();t.image?.close?.();}
}

export class TownBuildings {
 readonly group=new THREE.Group();
 private readonly fallback:THREE.InstancedMesh<THREE.BoxGeometry,THREE.MeshStandardMaterial>;
 private readonly models=new Map<BuildingArtKind,THREE.InstancedMesh>();
 private readonly matrixObject=new THREE.Object3D();
 private art:THREE.Group|null=null;
 private failed=false;
 private started=false;
 private disposed=false;
 private drawn=0;
 private readonly invalidate:()=>void;
 constructor(scene:THREE.Scene,invalidate:()=>void) {
  this.invalidate=invalidate;
  const box=new THREE.BoxGeometry(HOUSE_WIDTH,HOUSE_HEIGHT,HOUSE_DEPTH);
  // All slots use the existing ground anchor; center the box above it for
  // the identical fallback appearance before the asynchronous models arrive.
  box.translate(0,HOUSE_HEIGHT/2,0);
  this.fallback=new THREE.InstancedMesh(box,new THREE.MeshStandardMaterial({color:0xc8bba0,roughness:1}),BUILDING_RENDER_LIMIT);
  this.prepare(this.fallback);this.group.visible=false;scene.add(this.group);
 }
 private prepare(mesh:THREE.InstancedMesh){
  mesh.frustumCulled=false;mesh.count=0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(mesh);
 }
 private request(){
  if(this.started||this.disposed)return;this.started=true;
  void fetchArchitecture().then(asset=>{
   if(this.disposed){disposeAsset(asset);return;}
   try{
    const source=BUILDING_ART_KINDS.map(kind=>{
     const mesh=asset.getObjectByName(kind) as ModelMesh|undefined;
     if(!(mesh instanceof THREE.Mesh)||!(mesh.material instanceof THREE.MeshStandardMaterial)||!mesh.material.map)throw new Error(`Invalid building mesh: ${kind}`);
     mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox!;
     const reach=Math.max(Math.abs(b.min.x),Math.abs(b.max.x))*BUILDING_ART_SCALE;
     const depth=Math.max(Math.abs(b.min.z),Math.abs(b.max.z))*BUILDING_ART_SCALE;
     if(Math.abs(b.min.y)>1e-6||reach>HOUSE_WIDTH/2||depth>HOUSE_DEPTH/2)throw new Error(`Building art exceeds old footprint: ${kind}`);
     return mesh;
    });
    const material=source[0].material;
    if(!source.every(mesh=>mesh.material.map===material.map))throw new Error('Building models must share one atlas');
    for(const [i,kind] of BUILDING_ART_KINDS.entries()){
     const mesh=new THREE.InstancedMesh(source[i].geometry,material,BUILDING_RENDER_LIMIT);
     mesh.name=`Modern ${kind} building batch`;this.prepare(mesh);this.models.set(kind,mesh);
    }
    this.art=asset;this.invalidate();
   }catch(error){disposeAsset(asset);throw error;}
  }).catch(()=>{if(!this.disposed){this.failed=true;this.invalidate();}});
 }
 get assetState(){return this.art?'modern-v3':this.failed?'fallback':'loading';}
 begin(visible:boolean){
  this.group.visible=visible;this.drawn=0;this.fallback.count=0;
  for(const mesh of this.models.values())mesh.count=0;
 }
 add(kind:BuildingArtKind,x:number,y:number,z:number,rotation:number){
  if(this.drawn>=BUILDING_RENDER_LIMIT)return;
  this.request();
  const model=this.models.get(kind),mesh=model??this.fallback,d=this.matrixObject;
  d.position.set(x,y,z);d.rotation.set(0,rotation,0);d.scale.setScalar(model?BUILDING_ART_SCALE:1);d.updateMatrix();
  mesh.setMatrixAt(mesh.count++,d.matrix);this.drawn++;
 }
 count(kind:BuildingArtKind){return this.models.get(kind)?.count??0;}
 get fallbackCount(){return this.fallback.count;}
 end(){
  for(const mesh of [this.fallback,...this.models.values()]){
   if(!mesh.count)continue;
   mesh.instanceMatrix.clearUpdateRanges();mesh.instanceMatrix.addUpdateRange(0,mesh.count*16);mesh.instanceMatrix.needsUpdate=true;
  }
 }
 dispose(){
  this.disposed=true;this.group.removeFromParent();
  this.fallback.geometry.dispose();this.fallback.material.dispose();this.fallback.dispose();
  for(const mesh of this.models.values())mesh.dispose();
  if(this.art)disposeAsset(this.art);this.group.clear();
 }
}
