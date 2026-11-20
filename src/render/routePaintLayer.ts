import * as THREE from 'three';

import {MAP_LAYERS} from './mapLayers.ts';
import {GroundRouteMesh,type GroundRoute} from './groundRouteMesh.ts';

export const ROUTE_RENDER_ORDER=MAP_LAYERS.route;
const RIBBON='#a04432',OUTLINE='#ead5a2',TARGET='#f38256',GLOW='#fa784d',CHEVRON='#ffd5a0';
export type PaintedRoute={d:string;outline:string;ground?:{body:Path2D;edge:Path2D}};
type Affine=readonly [number,number,number,number,number,number];
export type PaintedView={matrix:THREE.Matrix4;corners:Float32Array};
type PaintedMarker={d:string;opacity:number};
export type PaintedPreview={d:string;target:string;targetMask:string;cx:number;cy:number;opacity:number;markers:readonly PaintedMarker[]};
const sameRoute=(a:PaintedRoute,b:PaintedRoute)=>a.d===b.d&&a.outline===b.outline&&a.ground===b.ground;
const sameMarker=(a:PaintedMarker,b:PaintedMarker)=>a.d===b.d&&a.opacity===b.opacity;
const sameArray=<T>(a:readonly T[],b:readonly T[],eq:(a:T,b:T)=>boolean)=>a.length===b.length&&a.every((e,i)=>e===b[i]||eq(e,b[i]));
function samePreview(a:PaintedPreview|null,b:PaintedPreview|null){
 return a===b||!!(a&&b&&a.d===b.d&&a.target===b.target&&a.targetMask===b.targetMask&&a.cx===b.cx&&a.cy===b.cy&&a.opacity===b.opacity&&sameArray(a.markers,b.markers,sameMarker));
}

/** A projected painting stays on the map plane after its camera moves.
 * Projective texture coordinates preserve perspective within the ground quad. */
class GroundPainting {
 readonly canvas=document.createElement('canvas');
 readonly texture=new THREE.CanvasTexture(this.canvas);
 readonly ctx=this.canvas.getContext('2d');
 readonly mesh:THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
 constructor(){
  this.canvas.width=this.canvas.height=1;this.texture.generateMipmaps=false;this.texture.minFilter=THREE.LinearFilter;
  this.texture.colorSpace=THREE.SRGBColorSpace;
  this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({
   transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
   uniforms:{routeTexture:{value:this.texture},paintMatrix:{value:new THREE.Matrix4()}},
   vertexShader:`varying vec4 routeClip; uniform mat4 paintMatrix;
   void main(){vec4 world=modelMatrix*vec4(position,1.0);routeClip=paintMatrix*world;
   gl_Position=projectionMatrix*viewMatrix*world;}`,
   fragmentShader:`varying vec4 routeClip; uniform sampler2D routeTexture;
   void main(){vec2 uv=routeClip.xy/routeClip.w*.5+.5;
   gl_FragColor=texture2D(routeTexture,uv);
   #include <colorspace_fragment>
   }`,
  }));
  this.mesh.frustumCulled=false;this.mesh.visible=false;this.mesh.renderOrder=ROUTE_RENDER_ORDER;
 }
 project(view:PaintedView){
  const position=this.mesh.geometry.getAttribute('position');
  (position.array as Float32Array).set(view.corners);position.needsUpdate=true;
  this.mesh.material.uniforms.paintMatrix.value.copy(view.matrix);
 }
 dispose(){this.mesh.removeFromParent();this.mesh.geometry.dispose();this.mesh.material.dispose();this.texture.dispose();}
}

/** Ground paintings between labels and 3D objects. Committed routes and the
 * transient preview retain their own projection, so a released preview can fade
 * in place while the camera and the persistent routes continue moving. */
export class RoutePaintLayer {
 readonly mesh:THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
 private readonly routes=new GroundPainting();
 private readonly feedback=new GroundPainting();
 private readonly worldRoutes:GroundRouteMesh;
 private committed:readonly PaintedRoute[]=[];
 private preview:PaintedPreview|null=null;
 private committedView:PaintedView|null=null;
 private affine?:Affine;
 private flatCoverage?:{left:number;right:number;top:number;bottom:number;scale:number};
 private lastFlatUpdate=0;
 private flatInterval=0;
 private overscanRoutes=true;
 private previewView:PaintedView|null=null;
 private currentView:PaintedView|null=null;
 private viewKey='';
 private width=1;
 private height=1;
 private routesDirty=true;
 private previewDirty=true;
 private readonly paths=new Map<string,Path2D>();
 constructor(scene:THREE.Scene,private readonly camera:THREE.Camera,private readonly landY:number,private readonly invalidate:()=>void){
  this.mesh=this.routes.mesh;this.mesh.name='Rouge ground routes';
  this.feedback.mesh.name='Rouge ground dispatch preview';this.feedback.mesh.renderOrder=ROUTE_RENDER_ORDER+.01;
  this.worldRoutes=new GroundRouteMesh(landY);
  this.mesh.add(this.worldRoutes.mesh,this.feedback.mesh);scene.add(this.mesh);
 }
 captureView():PaintedView {
  const matrix=new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse),key=matrix.elements.join(',');
  if(this.currentView&&key===this.viewKey)return this.currentView;
  const inverse=matrix.clone().invert(),corners=new Float32Array(12);
  for(let i=0;i<4;i++){
   const x=i%2?1:-1,y=i<2?1:-1;
   const near=new THREE.Vector3(x,y,-1).applyMatrix4(inverse),far=new THREE.Vector3(x,y,1).applyMatrix4(inverse);
   near.lerp(far,(this.landY-near.y)/(far.y-near.y));corners.set([near.x,this.landY,near.z],i*3);
  }
  this.viewKey=key;return this.currentView={matrix,corners};
 }
 resize(width:number,height:number,pixelRatio:number){
  // The route is antialiased in 2D; limit upload bandwidth on HiDPI
  // displays and only when the actual projected paths or markers change.
  const ratio=Math.min(1.25,Math.max(1,pixelRatio));
  const w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(height*ratio));
  if(this.width===width&&this.height===height&&this.feedback.canvas.width===w&&this.feedback.canvas.height===h)return;
  this.width=width;this.height=height;
  this.flatCoverage=undefined;
  for(const painting of [this.routes,this.feedback]){painting.canvas.width=w;painting.canvas.height=h;}
  this.routesDirty=this.previewDirty=true;this.invalidate();
 }
 setCommitted(routes:readonly PaintedRoute[],view=this.captureView(),affine?:Affine){
  if(this.worldRoutes.mesh.visible){this.worldRoutes.set([]);this.routesDirty=true;}
  if(affine&&routes.length){
   // A larger upload pays off when several camera frames can reuse it. At
   // low update rates, keep the original viewport resolution and upload area.
   const now=performance.now();
   if(this.lastFlatUpdate){
    const interval=Math.min(250,now-this.lastFlatUpdate);
    this.flatInterval=this.flatInterval*.75+interval*.25;
    if(this.flatInterval>150)this.overscanRoutes=false;
    else if(this.flatInterval<110)this.overscanRoutes=true;
   }
   this.lastFlatUpdate=now;
   const p=view.corners,x0=Math.min(p[0],p[3],p[6],p[9]),x1=Math.max(p[0],p[3],p[6],p[9]),z0=Math.min(p[2],p[5],p[8],p[11]),z1=Math.max(p[2],p[5],p[8],p[11]);
   const prior=this.flatCoverage,scale=Math.hypot(affine[0],affine[1]);
   if(prior&&prior.scale>=scale&&prior.left<=x0&&prior.right>=x1&&prior.top<=z0&&prior.bottom>=z1&&sameArray(this.committed,routes,(a,b)=>a.ground===b.ground))return;
   // Paint a margin at native (or finer) texel density. The ground quad
   // then follows pans/zooms on the GPU until coverage or route order changes.
   const margin=this.overscanRoutes?1.25:1,detail=this.overscanRoutes?1.15:1;
   const cx=(x0+x1)/2,cz=(z0+z1)/2,corners=p.slice();
   for(let i=0;i<corners.length;i+=3){corners[i]=cx+(p[i]-cx)*margin;corners[i+2]=cz+(p[i+2]-cz)*margin;}
   this.flatCoverage={left:Math.min(corners[0],corners[3]),right:Math.max(corners[0],corners[3]),top:Math.min(corners[2],corners[8]),bottom:Math.max(corners[2],corners[8]),scale:scale*detail};
   this.committedView={corners,matrix:view.matrix.clone().premultiply(new THREE.Matrix4().makeScale(1/margin,1/margin,1))};
   this.affine=[affine[0]/margin,affine[1]/margin,affine[2]/margin,affine[3]/margin,(affine[4]-this.width/2)/margin+this.width/2,(affine[5]-this.height/2)/margin+this.height/2];
   this.sizeRoutes(margin*detail);
   this.committed=routes;this.routesDirty=true;this.invalidate();return;
  }
  this.lastFlatUpdate=0;this.flatInterval=0;this.overscanRoutes=true;
  if(this.flatCoverage){this.flatCoverage=undefined;this.sizeRoutes(1);this.routesDirty=true;}
  if(sameArray(this.committed,routes,sameRoute)&&(!routes.length||view===this.committedView)&&!!this.affine===!!affine)return;
  this.affine=affine;
  this.committed=routes;this.committedView=view;this.routesDirty=true;this.invalidate();
 }
 setWorldRoutes(routes:readonly GroundRoute[]){
  if(this.committed.length){this.committed=[];this.flatCoverage=undefined;this.routesDirty=true;}
  const visible=this.worldRoutes.mesh.visible;
  this.worldRoutes.set(routes);
  if(visible!==this.worldRoutes.mesh.visible)this.routesDirty=true;
 }
 private sizeRoutes(scale:number){
  const width=Math.ceil(this.feedback.canvas.width*scale),height=Math.ceil(this.feedback.canvas.height*scale);
  if(this.routes.canvas.width!==width||this.routes.canvas.height!==height){this.routes.canvas.width=width;this.routes.canvas.height=height;}
 }
 setPreview(preview:PaintedPreview|null,view=this.captureView()){
  if(samePreview(this.preview,preview)&&(!preview||view===this.previewView))return;
  this.preview=preview;this.previewView=view;this.previewDirty=true;this.invalidate();
 }
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
  if(!this.routesDirty&&!this.previewDirty)return;
  this.mesh.visible=this.worldRoutes.mesh.visible||!!(this.routes.ctx&&this.width>0&&this.height>0&&(this.committed.length||this.preview));
  this.mesh.geometry.setDrawRange(0,this.committed.length?6:0);this.feedback.mesh.visible=!!this.preview;
  if(this.routesDirty&&this.committed.length&&this.committedView)this.paint(this.routes,this.committedView,c=>{
   c.save();if(this.affine)c.transform(...this.affine);
   for(const route of this.committed){
    c.globalAlpha=.74;c.fillStyle=RIBBON;c.fill(route.ground?.body??this.path(route.d));
    c.globalAlpha=.8;c.fillStyle=OUTLINE;if(route.ground||route.outline)c.fill(route.ground?.edge??this.path(route.outline));
   }
   c.restore();
  });
  if(this.previewDirty&&this.preview&&this.previewView)this.paint(this.feedback,this.previewView,c=>this.paintPreview(c,this.preview!));
  this.routesDirty=this.previewDirty=false;
 }
 private paint(painting:GroundPainting,view:PaintedView,draw:(c:CanvasRenderingContext2D)=>void){
  const c=painting.ctx;if(!c)return;
  painting.project(view);
  c.setTransform(painting.canvas.width/this.width,0,0,painting.canvas.height/this.height,0,0);
  c.clearRect(0,0,this.width,this.height);draw(c);painting.texture.needsUpdate=true;
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
  this.worldRoutes.dispose();this.feedback.dispose();this.routes.dispose();
  this.paths.clear();this.committed=[];this.preview=null;
 }
}
