import * as THREE from 'three';
import {WORLD_BOUNDS,WORLD_WIDTH} from '../game/geo.ts';
import {compactSurface,RELIEF_MIDPOINT,RELIEF_STRENGTH} from './mapSurfaceConfig.ts';
import {installOceanSurface} from './oceanSurface.ts';
import {surfaceLevel,surfaceTiles,SURFACE_TILE_PIXELS,type SurfaceView} from './surfaceLod.ts';
import {surfaceAsset} from './surfaceAsset.ts';
import manifest from '../assets/map/ne2/manifest.json';

const assets=import.meta.glob('../assets/map/ne2/*.webp',{query:'?url',import:'default'}) as Record<string,()=>Promise<string>>;
const asset=async(name:string)=>{const url=await assets[`../assets/map/ne2/${name}`]();return import.meta.env.DEV?url+`?v=${manifest.revision}`:url;};
interface Resident {key:string;slot:number;level:number;x:number;y:number}
/** Fixed GPU slots hold only visible NE II tiles. A permanent coarse atlas and
 * resident parent levels remain readable while finer tiles decode in a worker. */
export class MapSurface {
 private disposed=false;private worker:Worker|null=null;private controller=new AbortController();
 private startFrame=0;private refresh:ReturnType<typeof setTimeout>|null=null;
 private base:THREE.Texture|null=null;private baseImage:ImageBitmap|null=null;
 private tiles:THREE.DataArrayTexture;private pages:THREE.DataTexture;
 private residents=new Map<string,Resident>();private failed=new Set<string>();
 private wanted=new Map<string,Omit<Resident,'slot'>>();private requested='';
 private tileBounds=new Int32Array(manifest.levels.length*4);private boundsLevel=-1;private requestGeneration=0;
 private pending:string[]=[];private queue:{key:string;pixels:Uint8Array}[]=[];
 private offsets:number[]=[];private slots:number;private width:number;private level:number;
 private ready={value:0};private lod={value:0};private baseUniform={value:null as THREE.Texture|null};
 private ray=new THREE.Raycaster();private point=new THREE.Vector3();private plane=new THREE.Plane(new THREE.Vector3(0,1,0),-.16);
 constructor(land:THREE.Material,sea:THREE.Material,private renderer:THREE.WebGLRenderer,private invalidate:()=>void,nearView:{value:number}){
  const canvas=renderer.domElement,compact=compactSurface(Math.min(innerWidth,innerHeight),matchMedia('(pointer:coarse)').matches,renderer.capabilities.maxTextureSize,(navigator as Navigator&{deviceMemory?:number}).deviceMemory);
  this.width=compact?1024:2048;this.level=this.width;this.slots=compact?24:48;
  let rows=0;for(const level of manifest.levels){this.offsets.push(rows);rows+=level.rows;}
  this.tiles=new THREE.DataArrayTexture(new Uint8Array(SURFACE_TILE_PIXELS**2*this.slots),SURFACE_TILE_PIXELS,SURFACE_TILE_PIXELS,this.slots);
  this.tiles.format=THREE.RedFormat;this.tiles.minFilter=this.tiles.magFilter=THREE.LinearFilter;this.tiles.needsUpdate=true;
  this.pages=new THREE.DataTexture(new Uint8Array(32*rows),32,rows,THREE.RedFormat);this.pages.needsUpdate=true;
  Object.assign(canvas.dataset,{surfaceResolution:compact?'compact':'full',surfaceProjection:'miller-crop',reliefSource:'natural-earth-ii-10m',reliefState:'pending',surfaceLod:String(this.width),surfaceResident:'0',surfaceSlots:String(this.slots),oceanSource:'procedural-water-surface',oceanState:'ready',oceanAnimation:'static',oceanReflection:'near-view'});
  installOceanSurface(sea,nearView);this.attach(land,rows);
  // The first map and simulation never await cosmetic assets.
  this.startFrame=requestAnimationFrame(()=>{this.startFrame=requestAnimationFrame(()=>void this.loadBase());});
 }
 private attach(material:THREE.Material,tableRows:number){
  const before=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
   before.call(material,shader,renderer);Object.assign(shader.uniforms,{uSurface:this.baseUniform,uSurfaceReady:this.ready,uSurfaceLod:this.lod,uSurfaceTiles:{value:this.tiles},uSurfacePages:{value:this.pages}});
   shader.vertexShader='varying vec2 vSurfaceUv;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\nvSurfaceUv=vec2((position.x - (${WORLD_BOUNDS.left.toFixed(8)}))/${WORLD_WIDTH.toFixed(8)},(${WORLD_BOUNDS.bottom.toFixed(8)}-position.z)/${(WORLD_BOUNDS.bottom-WORLD_BOUNDS.top).toFixed(8)});`);
   const samples=[...manifest.levels].reverse().map((level,reverse)=>{const index=manifest.levels.length-1-reverse;return `
    if(uSurfaceLod>=${level.width}.0){
     vec2 pixel=vec2(fract(uv.x),clamp(1.0-uv.y,0.0,0.999999))*vec2(${level.width}.0,${level.height}.0);
     vec2 tile=floor(pixel/512.0);float slot=texture2D(uSurfacePages,(vec2(tile.x,tile.y+${this.offsets[index]}.0)+0.5)/vec2(32.0,${tableRows}.0)).r*255.0;
     if(slot>.5)return texture(uSurfaceTiles,vec3((mod(pixel,512.0)+2.0)/516.0,floor(slot+.5)-1.0)).r;
    }`;}).join('\n');
   shader.fragmentShader=`precision highp sampler2DArray;uniform sampler2D uSurface,uSurfacePages;uniform sampler2DArray uSurfaceTiles;uniform float uSurfaceReady,uSurfaceLod;varying vec2 vSurfaceUv;
    float surfaceTone(vec2 uv){${samples}\nreturn texture2D(uSurface,uv).r;}\n`+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\nif(uSurfaceReady>.5){float tone=surfaceTone(vSurfaceUv);diffuseColor.rgb*=clamp(1.0+(tone-${RELIEF_MIDPOINT.toFixed(8)})*${RELIEF_STRENGTH.toFixed(8)},.65,1.15);}`);
  };
  material.customProgramCacheKey=()=>key+':ne2-10m-virtual-pyramid-v1';
 }
 private async loadBase(){
  const d=this.renderer.domElement.dataset;d.reliefState='loading';
  try{
   const image=await createImageBitmap(await surfaceAsset(await asset(`ne2-relief-${this.width}.webp`),this.controller.signal),{imageOrientation:'flipY'});
   if(this.disposed){image.close();return;}
   const texture=new THREE.Texture(image);texture.flipY=false;texture.colorSpace=THREE.NoColorSpace;texture.wrapS=THREE.RepeatWrapping;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true;
   this.base=texture;this.baseImage=image;this.baseUniform.value=texture;this.ready.value=1;d.reliefState='ready';d.reliefWidth=String(image.width);this.invalidate();
  }catch{if(!this.disposed){d.reliefState='fallback';this.invalidate();}}
 }
 update(camera:THREE.PerspectiveCamera){
  if(this.disposed||!this.ready.value)return;
  const projected=WORLD_WIDTH*this.renderer.domElement.height*camera.projectionMatrix.elements[5]/(2*camera.position.y);
  this.level=surfaceLevel(projected,this.width,16384,this.level);this.lod.value=this.level;
  const view:SurfaceView={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
  for(const x of [-1,1])for(const y of [-1,1]){this.ray.setFromCamera(new THREE.Vector2(x,y),camera);if(!this.ray.ray.intersectPlane(this.plane,this.point))continue;view.left=Math.min(view.left,this.point.x);view.right=Math.max(view.right,this.point.x);view.top=Math.min(view.top,this.point.z);view.bottom=Math.max(view.bottom,this.point.z);}
  if(!Number.isFinite(view.left))return;
  // The visible tile footprint usually remains identical for many gesture
  // frames. Reuse its requests and residents instead of allocating/sorting a
  // pyramid of tile objects until a tile edge or LOD threshold is crossed.
  let changed=this.level!==this.boundsLevel;this.boundsLevel=this.level;
  for(let i=0;i<manifest.levels.length;i++){const level=manifest.levels[i];if(level.width>this.level||level.width<=this.width)continue;
   const scale=level.width/WORLD_WIDTH/512;
   const left=Math.floor((view.left-WORLD_BOUNDS.left)*scale),right=Math.floor((view.right-WORLD_BOUNDS.left)*scale),top=Math.floor((view.top-WORLD_BOUNDS.top)*scale),bottom=Math.floor((view.bottom-WORLD_BOUNDS.top)*scale),at=i*4;
   if(left!==this.tileBounds[at]||right!==this.tileBounds[at+1]||top!==this.tileBounds[at+2]||bottom!==this.tileBounds[at+3])changed=true;
   this.tileBounds[at]=left;this.tileBounds[at+1]=right;this.tileBounds[at+2]=top;this.tileBounds[at+3]=bottom;
  }
  if(!changed)return;
  const wanted=new Map<string,Omit<Resident,'slot'>>();
  for(let index=manifest.levels.length-1;index>=0;index--){const level=manifest.levels[index];if(level.width>this.level||level.width<=this.width)continue;
   for(const tile of surfaceTiles(level,view,1)){if(wanted.size>=this.slots)break;wanted.set(tile.key,{...tile,level:index});}
  }
  this.wanted=wanted;
  const queued=new Set(this.queue.map(job=>job.key));
  const jobs=[...wanted.values()].filter(tile=>!this.residents.has(tile.key)&&!this.failed.has(tile.key)&&!queued.has(tile.key)),signature=jobs.map(tile=>tile.key).join('|');
  this.pending=[...wanted.keys()].filter(key=>!this.residents.has(key)&&!this.failed.has(key));
  if(signature!==this.requested){
   this.requested=signature;const generation=++this.requestGeneration;
   if(jobs.length&&!this.worker){this.worker=new Worker(new URL('./surfaceTiles.worker.ts',import.meta.url),{type:'module'});this.worker.onmessage=({data}:{data:{key:string;pixels:Uint8Array;error?:boolean}})=>{
    if(this.disposed)return;if(data.error){this.failed.add(data.key);this.pending=this.pending.filter(key=>key!==data.key);this.renderer.domElement.dataset.surfacePending=String(this.pending.length);return;}
    if(this.wanted.has(data.key)){this.queue.push(data);this.scheduleRefresh();}
   };this.worker.onerror=()=>{for(const key of this.pending)this.failed.add(key);this.pending=[];this.renderer.domElement.dataset.surfacePending='0';this.worker?.terminate();this.worker=null;};}
   void Promise.all(jobs.map(async tile=>({key:tile.key,url:await asset(`ne2-${tile.key}.webp`)}))).then(jobs=>{if(!this.disposed&&this.requestGeneration===generation)this.worker?.postMessage(jobs);}).catch(()=>{for(const job of jobs)this.failed.add(job.key);});
  }
  const d=this.renderer.domElement.dataset;d.surfaceLod=String(this.level);d.surfaceResident=String(this.residents.size);d.surfacePending=String(this.pending.length);
 }
 private scheduleRefresh(){
  if(this.refresh!==null)return;
  this.refresh=setTimeout(()=>{
   this.refresh=null;if(this.disposed)return;
   const stride=SURFACE_TILE_PIXELS**2;
   for(const job of this.queue.splice(0)){
    const tile=this.wanted.get(job.key);if(!tile||this.residents.has(job.key))continue;
    const occupied=new Set([...this.residents.values()].map(tile=>tile.slot));let slot=-1;
    for(let i=0;i<this.slots;i++)if(!occupied.has(i)){slot=i;break;}
    if(slot<0){const old=[...this.residents.values()].find(tile=>!this.wanted.has(tile.key));if(!old)continue;slot=old.slot;(this.pages.image.data as Uint8Array)[(this.offsets[old.level]+old.y)*32+old.x]=0;this.residents.delete(old.key);}
    (this.tiles.image.data as Uint8Array).set(job.pixels,slot*stride);this.tiles.addLayerUpdate(slot);
    (this.pages.image.data as Uint8Array)[(this.offsets[tile.level]+tile.y)*32+tile.x]=slot+1;this.residents.set(job.key,{...tile,slot});this.pending=this.pending.filter(key=>key!==job.key);
   }
   this.tiles.needsUpdate=true;this.pages.needsUpdate=true;
   const d=this.renderer.domElement.dataset;d.surfaceResident=String(this.residents.size);d.surfacePending=String(this.pending.length);this.invalidate();
  },100);
 }
 dispose(){this.disposed=true;this.controller.abort();cancelAnimationFrame(this.startFrame);if(this.refresh!==null)clearTimeout(this.refresh);this.worker?.terminate();this.base?.dispose();this.baseImage?.close();this.tiles.dispose();this.pages.dispose();this.queue=[];}
}
