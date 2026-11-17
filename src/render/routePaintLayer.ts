import * as THREE from 'three';

import {MAP_LAYERS} from './mapLayers.ts';

export const ROUTE_RENDER_ORDER=MAP_LAYERS.route;
const RIBBON='#a04432',OUTLINE='#ead5a2',TARGET='#f38256',GLOW='#fa784d',CHEVRON='#ffd5a0';
export type PaintedRoute={d:string;outline:string};
type PaintedMarker={d:string;opacity:number};
export type PaintedPreview={d:string;target:string;targetMask:string;cx:number;cy:number;opacity:number;markers:readonly PaintedMarker[]};
const sameRoute=(a:PaintedRoute,b:PaintedRoute)=>a.d===b.d&&a.outline===b.outline;
const sameMarker=(a:PaintedMarker,b:PaintedMarker)=>a.d===b.d&&a.opacity===b.opacity;
const sameArray=<T>(a:readonly T[],b:readonly T[],eq:(a:T,b:T)=>boolean)=>a.length===b.length&&a.every((e,i)=>e===b[i]||eq(e,b[i]));
function samePreview(a:PaintedPreview|null,b:PaintedPreview|null){
 return a===b||!!(a&&b&&a.d===b.d&&a.target===b.target&&a.targetMask===b.targetMask&&a.cx===b.cx&&a.cy===b.cy&&a.opacity===b.opacity&&sameArray(a.markers,b.markers,sameMarker));
}

/** One transparent canvas texture, batched between labels and 3D objects.
 * Reuses the exact projected outlines in CSS space; the GPU composites the
 * result in the same scene, without making artwork another DOM stacking layer. */
export class RoutePaintLayer {
 readonly mesh:THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
 private readonly canvas=document.createElement('canvas');
 private readonly texture=new THREE.CanvasTexture(this.canvas);
 private readonly ctx=this.canvas.getContext('2d');
 private committed:readonly PaintedRoute[]=[];
 private preview:PaintedPreview|null=null;
 private width=1;
 private height=1;
 private dirty=true;
 private readonly invalidate:()=>void;
 private readonly paths=new Map<string,Path2D>();
 constructor(scene:THREE.Scene,invalidate:()=>void){
  this.invalidate=invalidate;
  this.canvas.width=this.canvas.height=1;this.texture.generateMipmaps=false;this.texture.minFilter=THREE.LinearFilter;
  this.texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.ShaderMaterial({
   transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
   uniforms:{routeTexture:{value:this.texture}},
   vertexShader:'varying vec2 routeUv; void main(){routeUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
   fragmentShader:`varying vec2 routeUv;
   uniform sampler2D routeTexture;
   void main(){gl_FragColor=texture2D(routeTexture,routeUv);
   #include <colorspace_fragment>
   }`,
  });
  this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);
  this.mesh.name='Rouge route overlay';this.mesh.frustumCulled=false;this.mesh.visible=false;
  this.mesh.renderOrder=ROUTE_RENDER_ORDER;scene.add(this.mesh);
 }
 resize(width:number,height:number,pixelRatio:number){
  // The route is antialiased in 2D; limit upload bandwidth on HiDPI
  // displays and only when the actual projected paths or markers change.
  const ratio=Math.min(1.25,Math.max(1,pixelRatio));
  const w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(height*ratio));
  if(this.width===width&&this.height===height&&this.canvas.width===w&&this.canvas.height===h)return;
  this.width=width;this.height=height;this.canvas.width=w;this.canvas.height=h;this.changed();
 }
 setCommitted(routes:readonly PaintedRoute[]){
  if(sameArray(this.committed,routes,sameRoute))return;
  this.committed=routes;this.changed();
 }
 setPreview(preview:PaintedPreview|null){
  if(samePreview(this.preview,preview))return;
  this.preview=preview;this.changed();
 }
 private changed(){this.dirty=true;this.invalidate();}
 private path(d:string){
  let p=this.paths.get(d);
  if(!p){
   p=new Path2D(d);
   if(this.paths.size>=256)this.paths.delete(this.paths.keys().next().value!);
   this.paths.set(d,p);
  }
  return p;
 }
 flush(){
  if(!this.dirty)return;
  this.dirty=false;
  const c=this.ctx,p=this.preview;
  this.mesh.visible=!!(c&&this.width>0&&this.height>0&&(this.committed.length||p));
  if(!c||!this.mesh.visible)return;
  c.setTransform(this.canvas.width/this.width,0,0,this.canvas.height/this.height,0,0);
  c.clearRect(0,0,this.width,this.height);
  for(const route of this.committed){
   c.globalAlpha=.74;c.fillStyle=RIBBON;c.fill(this.path(route.d));
   c.globalAlpha=.8;c.fillStyle=OUTLINE;if(route.outline)c.fill(this.path(route.outline));
  }
  c.globalAlpha=1;
  if(p)this.paintPreview(c,p);
  this.texture.needsUpdate=true;
 }
 private paintPreview(c:CanvasRenderingContext2D,p:PaintedPreview){
  c.save();c.lineJoin='round';
  // Use the original paths and clip rules for the glow and the chevrons;
  // release fades their pigment without changing projection or line widths.
  if(p.target&&p.targetMask){
   c.save();c.clip(this.path(p.targetMask),'evenodd');
   c.filter='blur(2px)';c.globalAlpha=.42*p.opacity;c.lineWidth=7;c.strokeStyle=GLOW;
   c.stroke(this.path(p.target));c.restore();
  }
  if(p.target){
   c.globalAlpha=p.opacity;c.strokeStyle=TARGET;c.lineWidth=1.5;c.stroke(this.path(p.target));
  }
  if(p.d){
   const ribbon=this.path(p.d);
   c.globalAlpha=.74*p.opacity;c.fillStyle=RIBBON;c.fill(ribbon);
   c.save();c.clip(ribbon);c.fillStyle=CHEVRON;
   for(const marker of p.markers){if(!marker.d)continue;c.globalAlpha=p.opacity*marker.opacity;c.fill(this.path(marker.d));}
   c.restore();
  }
  c.globalAlpha=p.opacity;c.beginPath();c.arc(p.cx,p.cy,9,0,2*Math.PI);
  c.fillStyle='#eee4c614';c.fill();c.strokeStyle='#eee4c692';c.lineWidth=.9;c.stroke();
  c.restore();
 }
 dispose(){
  this.mesh.removeFromParent();this.mesh.geometry.dispose();this.mesh.material.dispose();this.texture.dispose();
  this.paths.clear();this.committed=[];this.preview=null;
 }
}
