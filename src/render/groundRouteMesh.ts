import * as THREE from 'three';
import libtess from 'libtess';
import type {ScreenPoint} from './dispatchRibbon.ts';
import {MAP_LAYERS} from './mapLayers.ts';

export interface RouteContours {body:ScreenPoint[];edge:ScreenPoint[][]}
export type GroundRoute=RouteContours|Float32Array;

/** A straight ground ribbon with regularly spaced chevrons remains legible when
 * its endpoint is outside the viewport. These simple triangles need no tessellation. */
export function marchRibbon(a:ScreenPoint,b:ScreenPoint):Float32Array {
 const dx=b.x-a.x,dz=b.y-a.y,length=Math.hypot(dx,dz),x=dx/length,z=dz/length;
 const half=Math.min(.48,length*.09),head=Math.min(2,length*.4);
 const vertices:number[]=[];
 const vertex=(along:number,side:number,ink:number)=>vertices.push(a.x+x*along-z*side,a.y+z*along+x*side,ink);
 const arrow=(width:number,tail:number,tip:number,ink:number)=>{
  const neck=length-head;
  vertex(tail,-width,ink);vertex(neck,-width,ink);vertex(neck,width,ink);
  vertex(tail,-width,ink);vertex(neck,width,ink);vertex(tail,width,ink);
  vertex(neck,-width*2,ink);vertex(tip,0,ink);vertex(neck,width*2,ink);
 };
 arrow(half,0,length,1);arrow(half*.74,half*.15,length-half*.35,0);
 for(let along=6;along<length-head-1;along+=12){
  vertex(along-half,-half*.74,1);vertex(along+half,0,1);vertex(along-half,half*.74,1);
 }
 return new Float32Array(vertices);
}

function triangles(route:RouteContours){
 const vertices:number[]=[],tess=new libtess.GluTesselator(),api=libtess.gluEnum;
 let pigment=0;
 tess.gluTessNormal(0,0,1);
 tess.gluTessProperty(api.GLU_TESS_WINDING_RULE,libtess.windingRule.GLU_TESS_WINDING_NONZERO);
 tess.gluTessCallback(api.GLU_TESS_VERTEX,v=>{vertices.push(v[0],v[1],pigment);});
 tess.gluTessCallback(api.GLU_TESS_COMBINE,coords=>coords);
 const fill=(rings:ScreenPoint[][])=>{
  tess.gluTessBeginPolygon(null);
  for(const ring of rings){
   tess.gluTessBeginContour();
   for(const point of ring){const v:[number,number,number]=[point.x,point.y,0];tess.gluTessVertex(v,v);}
   tess.gluTessEndContour();
  }
  tess.gluTessEndPolygon();
 };
 fill([route.body]);pigment=1;fill(route.edge);
 return new Float32Array(vertices);
}

/** Draw the exact nonzero fills, including the union of the round stroke
 * segments. Body then outline, in ledger order, preserves overlapping arrows. */
export class GroundRouteMesh {
 readonly mesh:THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
 private previous:readonly GroundRoute[]=[];
 private cache=new WeakMap<RouteContours,Float32Array>();
 private storage=new Float32Array(0);
 constructor(height:number){
  const material=new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
   uniforms:{landY:{value:height}},
   vertexShader:`uniform float landY; varying float ink;
    void main(){ink=position.z;gl_Position=projectionMatrix*modelViewMatrix*vec4(position.x,landY,position.y,1.0);}`,
   fragmentShader:`varying float ink;
    void main(){gl_FragColor=mix(vec4(160./255.,68./255.,50./255.,.74),vec4(234./255.,213./255.,162./255.,.8),ink);}`,
  });
  this.mesh=new THREE.Mesh(new THREE.BufferGeometry(),material);this.mesh.frustumCulled=false;
  this.mesh.renderOrder=MAP_LAYERS.route;this.mesh.visible=false;
 }
 set(routes:readonly GroundRoute[]){
  if(routes.length===this.previous.length&&routes.every((r,i)=>r===this.previous[i]))return;
  this.previous=routes;this.mesh.visible=routes.length>0;
  if(!routes.length){this.mesh.geometry.setDrawRange(0,0);return;}
  const batches=routes.map(route=>{
   if(route instanceof Float32Array)return route;
   let data=this.cache.get(route);
   if(!data){data=triangles(route);this.cache.set(route,data);}
   return data;
  });
  const size=batches.reduce((sum,data)=>sum+data.length,0);
  if(this.storage.length<size){
   this.mesh.geometry.dispose();this.storage=new Float32Array(Math.ceil(size/3072)*3072);
   this.mesh.geometry.setAttribute('position',new THREE.BufferAttribute(this.storage,3).setUsage(THREE.DynamicDrawUsage));
  }
  let offset=0;for(const data of batches){this.storage.set(data,offset);offset+=data.length;}
  if(size){
   const attribute=this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
   attribute.clearUpdateRanges();attribute.addUpdateRange(0,size);attribute.needsUpdate=true;
  }
  this.mesh.geometry.setDrawRange(0,size/3);
 }
 dispose(){this.mesh.removeFromParent();this.mesh.geometry.dispose();this.mesh.material.dispose();}
}
