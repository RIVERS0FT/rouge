import {BUILDING_ART_KINDS,type BuildingArtKind} from './buildingPresentation.ts';

export type BuildingAssetErrorCode='network'|'http'|'bundle'|'atlas-decode';
export class BuildingAssetError extends Error {
 readonly code:BuildingAssetErrorCode;
 constructor(code:BuildingAssetErrorCode,message:string){super(message);this.code=code;}
}
export type BuildingGeometry={position:Float32Array;normal:Float32Array;uv:Float32Array;index:Uint16Array|Uint32Array};
type View={buffer:number;byteOffset?:number;byteLength:number;byteStride?:number};
type Accessor={bufferView:number;byteOffset?:number;count:number;componentType:number;type:string;sparse?:unknown;normalized?:boolean};
type Gltf={
 asset?:{version?:string};buffers?:{byteLength:number;uri?:string}[];
 bufferViews?:View[];accessors?:Accessor[];
 nodes?:({name:string;mesh:number;children?:number[];translation?:number[];rotation?:number[];scale?:number[];matrix?:number[]})[];
 meshes?:{primitives:{attributes:Record<string,number>;indices:number;mode?:number;material:number}[]}[];
 images?:{bufferView:number;mimeType:string;uri?:string}[];
 textures?:{source:number}[];
 materials?:{doubleSided?:boolean;pbrMetallicRoughness?:{
  baseColorTexture?:{index:number};roughnessFactor?:number;metallicFactor?:number;
 }}[];
};
export type BuildingBundle={
 geometries:Map<BuildingArtKind,BuildingGeometry>;atlas:Blob|null;
 doubleSided:boolean;roughness:number;metalness:number;
};
const GLB_MAX=2*1024*1024;
function must(value:unknown,message:string):asserts value{
 if(!value)throw new BuildingAssetError('bundle',message);
}
const finiteUnit=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;

// This is deliberately a reader of our one baked glTF subset, not a generic
// loader: only embedded, tightly packed v3 mesh arrays and one optional atlas.
export function readBuildingBundle(data:ArrayBuffer):BuildingBundle {
 try{
  must(data.byteLength>=28&&data.byteLength<=GLB_MAX,'Invalid building package length');
  const view=new DataView(data),length=view.getUint32(12,true),offset=28+length;
  must(view.getUint32(0,false)===0x676c5446&&view.getUint32(4,true)===2&&view.getUint32(8,true)===data.byteLength,'Invalid building package header');
  must(length%4===0&&offset<=data.byteLength&&view.getUint32(16,false)===0x4a534f4e,'Invalid building JSON chunk');
  must(view.getUint32(offset-4,false)===0x42494e00&&view.getUint32(offset-8,true)===data.byteLength-offset,'Invalid building BIN chunk');
  const model=JSON.parse(new TextDecoder().decode(new Uint8Array(data,20,length))) as Gltf;
  must(model.asset?.version==='2.0'&&model.buffers?.length===1&&!model.buffers[0].uri&&model.buffers[0].byteLength===data.byteLength-offset,'Only a single embedded glTF buffer is supported');
  must(model.nodes?.length===BUILDING_ART_KINDS.length&&model.meshes?.length===BUILDING_ART_KINDS.length,'Unexpected building mesh layout');
  const views=model.bufferViews,accessors=model.accessors;
  must(views?.length&&accessors?.length,'Missing building arrays');
  const getView=(id:number)=>{
   const v=views[id],start=v?.byteOffset??0;
   must(v&&v.buffer===0&&Number.isInteger(start)&&start>=0&&Number.isInteger(v.byteLength)&&v.byteLength>0&&offset+start+v.byteLength<=data.byteLength,'Invalid building array range');
   return {v,start:offset+start};
  };
  const array=(id:number,type:string,width:number,components:readonly number[])=>{
   const a=accessors[id];must(a&&a.type===type&&!a.sparse&&!a.normalized&&components.includes(a.componentType)&&Number.isInteger(a.count)&&a.count>0&&a.count<=100_000,'Invalid building accessor');
   const {v,start}=getView(a.bufferView),i=a.byteOffset??0,size=a.componentType===5123?2:4,n=a.count*width;
   must((v.byteStride===undefined||v.byteStride===width*size)&&Number.isInteger(i)&&i>=0&&(start+i)%size===0&&i+n*size<=v.byteLength,'Invalid packed building array');
   return a.componentType===5126?new Float32Array(data,start+i,n):a.componentType===5123?new Uint16Array(data,start+i,n):new Uint32Array(data,start+i,n);
  };
  const geometries=new Map<BuildingArtKind,BuildingGeometry>();
  const usedMeshes=new Set<number>();
  for(const kind of BUILDING_ART_KINDS){
   const n=model.nodes.find(n=>n.name===kind);
   must(n&&!n.children&&!n.translation&&!n.rotation&&!n.scale&&!n.matrix&&!usedMeshes.has(n.mesh),'Invalid building mesh '+kind);
   usedMeshes.add(n.mesh);
   const primitives=model.meshes[n.mesh]?.primitives,p=primitives?.[0];
   must(primitives?.length===1&&p.material===0&&(p.mode??4)===4,'Invalid building mesh primitive '+kind);
   const position=array(p.attributes.POSITION,'VEC3',3,[5126]) as Float32Array;
   const normal=array(p.attributes.NORMAL,'VEC3',3,[5126]) as Float32Array;
   const uv=array(p.attributes.TEXCOORD_0,'VEC2',2,[5126]) as Float32Array;
   const index=array(p.indices,'SCALAR',1,[5123,5125]) as Uint16Array|Uint32Array;
   must(position.length===normal.length&&position.length/3===uv.length/2&&index.length%3===0&&index.every(i=>i<position.length/3),'Invalid building mesh vertex layout');
   must([position,normal,uv].every(a=>a.every(Number.isFinite)),'Invalid building material coordinates');
   geometries.set(kind,{position,normal,uv,index});
  }
  const mat=model.materials?.[0],pbr=mat?.pbrMetallicRoughness;
  must(model.materials?.length===1&&pbr&&finiteUnit(pbr.roughnessFactor)&&finiteUnit(pbr.metallicFactor),'Invalid building material');
  // The actual geometry never depends on atlas data. Even if the optional
  // payload is missing or corrupt, all four modern shapes still render.
  let atlas:Blob|null=null;
  const img=model.images?.[0];
  if(pbr.baseColorTexture?.index===0&&model.textures?.length===1&&model.textures[0].source===0&&
   model.images?.length===1&&img&&!img.uri&&img.mimeType==='image/jpeg'){
   try{
    const {v,start}=getView(img.bufferView);const bytes=new Uint8Array(data,start,v.byteLength);
    if(bytes.length>=4&&bytes[0]===0xff&&bytes[1]===0xd8)atlas=new Blob([bytes],{type:'image/jpeg'});
   }catch{/* Geometry remains valid. */}
  }
  return {geometries,atlas,doubleSided:mat?.doubleSided===true,roughness:pbr.roughnessFactor,metalness:pbr.metallicFactor};
 }catch(error){
  if(error instanceof BuildingAssetError)throw error;
  throw new BuildingAssetError('bundle','Could not read the modern building package');
 }
}

type Fetcher=(url:URL,options?:RequestInit)=>Promise<Response>;
export async function loadBuildingBundle(fetcher:Fetcher=fetch):Promise<BuildingBundle>{
 const url=new URL('./assets/modern-buildings.glb',import.meta.url);
 for(let attempt=0;attempt<2;attempt++){
  let bytes:ArrayBuffer;
  try{
   const response=await fetcher(url,attempt?{cache:'reload'}:undefined);
   if(!response.ok){
    if(!attempt&&(response.status===429||response.status>=500))continue;
    throw new BuildingAssetError('http',`Building package returned HTTP ${response.status}`);
   }
   bytes=await response.arrayBuffer();
  }catch(error){
   if(error instanceof BuildingAssetError)throw error;
   if(!attempt)continue;
   throw new BuildingAssetError('network','Could not download the modern building package');
  }
  return readBuildingBundle(bytes);
 }
 throw new BuildingAssetError('network','Could not download the modern building package');
}

export type AtlasImage=ImageBitmap|HTMLImageElement;
function decodeAtlasElement(blob:Blob):Promise<HTMLImageElement>{
 // A data URI also works when browser policies block blob: resource loads.
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(reader.error);
  reader.onload=()=>{
   const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=String(reader.result);
  };
  reader.readAsDataURL(blob);
 });
}
export async function decodeBuildingAtlas(blob:Blob):Promise<AtlasImage>{
 if(typeof createImageBitmap==='function'){
  try{
   const image=await createImageBitmap(blob,{premultiplyAlpha:'none',colorSpaceConversion:'none'});
   if(image.width===512&&image.height===512)return image;
   image.close();
  }catch{/* Use browser's alternative image path. */}
 }
 const image=await decodeAtlasElement(blob);
 if(image.naturalWidth!==512||image.naturalHeight!==512)throw new BuildingAssetError('atlas-decode','Invalid building atlas size');
 return image;
}
export function closeBuildingAtlas(image:AtlasImage){if('close' in image)image.close();}
