import * as THREE from 'three';
import {layerMapEntity} from './mapLayers.ts';
import {HOUSE_DEPTH,HOUSE_HEIGHT,HOUSE_WIDTH} from '../game/buildings.ts';
import {BUILDING_ART_KINDS,BUILDING_ART_SCALE,BUILDING_RENDER_LIMIT,type BuildingArtKind} from './buildingPresentation.ts';
import {BuildingAssetError,closeBuildingAtlas,decodeBuildingAtlas,loadBuildingBundle,type AtlasImage,type BuildingAssetErrorCode,type BuildingBundle} from './buildingAsset.ts';

type Stage=BuildingAssetErrorCode|'atlas-loading'|'';
type TownGeometry=THREE.InstancedMesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
type Dependencies={load?:()=>Promise<BuildingBundle>;decode?:(blob:Blob)=>Promise<AtlasImage>};
const COLORED_FALLBACK={house:0xd4c7ad,market:0x50889e,barracks:0x9faaa6,fortress:0x6f8588};

export class TownBuildings {
 readonly group=new THREE.Group();
 private readonly fallback:THREE.InstancedMesh<THREE.BoxGeometry,THREE.MeshStandardMaterial>;
 private readonly models=new Map<BuildingArtKind,TownGeometry>();
 private readonly matrixObject=new THREE.Object3D();
 private readonly invalidate:()=>void;
 private readonly load:()=>Promise<BuildingBundle>;
 private readonly decode:(blob:Blob)=>Promise<AtlasImage>;
 private readonly materials=new Set<THREE.MeshStandardMaterial>();
 private texture:THREE.Texture|null=null;
 private atlasImage:AtlasImage|null=null;
 private stage:Stage='';
 private failed=false;
 private started=false;
 private disposed=false;
 private drawn=0;
 constructor(scene:THREE.Scene,invalidate:()=>void,{load=loadBuildingBundle,decode=decodeBuildingAtlas}:Dependencies={}) {
  this.invalidate=invalidate;this.load=load;this.decode=decode;
  const box=new THREE.BoxGeometry(HOUSE_WIDTH,HOUSE_HEIGHT,HOUSE_DEPTH);
  // Old boxes are available only while the building geometry itself is
  // unavailable. Missing textures must not silently replace valid shapes.
  box.translate(0,HOUSE_HEIGHT/2,0);
  this.fallback=new THREE.InstancedMesh(box,new THREE.MeshStandardMaterial({color:0xc8bba0,roughness:1}),BUILDING_RENDER_LIMIT);
  this.prepare(this.fallback);this.group.visible=false;scene.add(this.group);
 }
 private prepare(mesh:TownGeometry){
  layerMapEntity(mesh,mesh.material);mesh.frustumCulled=false;mesh.count=0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.group.add(mesh);
 }
 private install(bundle:BuildingBundle){
  const geometry=new Map<BuildingArtKind,THREE.BufferGeometry>();
  try{
   for(const kind of BUILDING_ART_KINDS){
    const data=bundle.geometries.get(kind);
    if(!data)throw new BuildingAssetError('bundle',`Missing building mesh: ${kind}`);
    const g=new THREE.BufferGeometry();geometry.set(kind,g);
    g.setAttribute('position',new THREE.BufferAttribute(data.position,3));
    g.setAttribute('normal',new THREE.BufferAttribute(data.normal,3));
    g.setAttribute('uv',new THREE.BufferAttribute(data.uv,2));
    g.setIndex(new THREE.BufferAttribute(data.index,1));
    g.computeBoundingBox();const bounds=g.boundingBox!;
    const width=Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x))*BUILDING_ART_SCALE;
    const depth=Math.max(Math.abs(bounds.min.z),Math.abs(bounds.max.z))*BUILDING_ART_SCALE;
    if(Math.abs(bounds.min.y)>1e-6||width>HOUSE_WIDTH/2||depth>HOUSE_DEPTH/2)throw new BuildingAssetError('bundle',`Building art exceeds old footprint: ${kind}`);
   }
  }catch(error){
   for(const g of geometry.values())g.dispose();
   throw error;
  }
  for(const [kind,g] of geometry){
   const material=new THREE.MeshStandardMaterial({...this.parameters(bundle),color:COLORED_FALLBACK[kind]});
   this.materials.add(material);
   const mesh=new THREE.InstancedMesh(g,material,BUILDING_RENDER_LIMIT);
   mesh.name=`Modern ${kind} building batch`;this.prepare(mesh);this.models.set(kind,mesh);
  }
 }
 private parameters(bundle:BuildingBundle){
  return {roughness:bundle.roughness,metalness:bundle.metalness,side:bundle.doubleSided?THREE.DoubleSide:THREE.FrontSide};
 }
 private async loadAtlas(bundle:BuildingBundle,blob:Blob){
  let image:AtlasImage;
  try{image=await this.decode(blob);}catch{
   if(!this.disposed){this.stage='atlas-decode';this.invalidate();}
   return;
  }
  if(this.disposed){closeBuildingAtlas(image);return;}
  this.atlasImage=image;
  const texture=new THREE.Texture(image);
  // glTF UVs are top-left-origin; preserve the shipped asset's sampling and
  // keep one shared material for all four batches.
  texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.needsUpdate=true;
  this.texture=texture;
  const material=new THREE.MeshStandardMaterial({...this.parameters(bundle),map:texture});
  for(const mesh of this.models.values()){mesh.material=material;layerMapEntity(mesh,material);}
  for(const m of this.materials)m.dispose();
  this.materials.clear();this.materials.add(material);
  this.stage='';this.invalidate();
 }
 private request(){
  if(this.started||this.disposed)return;this.started=true;
  void this.load().then(bundle=>{
   if(this.disposed)return;
   this.install(bundle);
   this.stage=bundle.atlas?'atlas-loading':'atlas-decode';this.invalidate();
   if(bundle.atlas)void this.loadAtlas(bundle,bundle.atlas);
  }).catch(error=>{
   if(this.disposed)return;
   this.stage=error instanceof BuildingAssetError?error.code:'bundle';this.failed=true;this.invalidate();
  });
 }
 get assetState(){return this.texture?'modern-v3':this.models.size?'modern-v3-untextured':this.failed?'fallback':'loading';}
 get assetIssue(){return this.stage;}
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
  for(const mesh of this.models.values()){mesh.dispose();mesh.geometry.dispose();}
  for(const material of this.materials)material.dispose();
  this.texture?.dispose();if(this.atlasImage)closeBuildingAtlas(this.atlasImage);
  this.models.clear();this.materials.clear();this.group.clear();
 }
}
