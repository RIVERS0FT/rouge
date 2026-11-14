import * as THREE from 'three';
import type {BorderEdge} from './territoryBorders.ts';
import type {Rect} from '../game/crop.ts';

export const COAST_SHADOW_WIDTH=5;
export const COAST_SHADOW_OPACITY=.26;
const key=(p:{x:number;z:number})=>`${p.x.toFixed(6)},${p.z.toFixed(6)}`;

/** One soft ribbon along real coasts, below the opaque land and above the sea.
 * Connected miters avoid thousands of overlapping round caps at strategic zoom.
 * This mask takes the strongest contribution, preventing dark overlap patches. */
export function createCoastShadow(edges:readonly BorderEdge[]){
 const coast=edges.filter(edge=>edge.atoms.length===1),adjacent=new Map<string,{x:number;z:number}[]>();
 for(const {a,b} of coast)for(const [p,q] of [[a,b],[b,a]]){const k=key(p),ns=adjacent.get(k)??[];ns.push(q);adjacent.set(k,ns);}
 // Tiny offshore rocks should not acquire continent-sized shadows when zoomed
 // out. Cache each connected coastline's extent, independent of tessellation.
 const extents=new Map<string,number>();
 for(const [start] of adjacent){
  if(extents.has(start))continue;
  const seen=new Set([start]),queue=[start];let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  for(let i=0;i<queue.length;i++){const k=queue[i],[x,z]=k.split(',').map(Number);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,z);bottom=Math.max(bottom,z);
   for(const neighbor of adjacent.get(k)!){const n=key(neighbor);if(!seen.has(n)){seen.add(n);queue.push(n);}}
  }
  const extent=Math.max(right-left,bottom-top);for(const k of queue)extents.set(k,extent);
 }
 const starts:number[]=[],ends:number[]=[],previous:number[]=[],next:number[]=[],sizes:number[]=[];
 for(const {a,b} of coast){
  const before=adjacent.get(key(a))!,after=adjacent.get(key(b))!;
  const p=before.length===2?before.find(n=>key(n)!==key(b)):undefined,q=after.length===2?after.find(n=>key(n)!==key(a)):undefined;
  starts.push(a.x,a.z);ends.push(b.x,b.z);previous.push(p?.x??2*a.x-b.x,p?.z??2*a.z-b.z);next.push(q?.x??2*b.x-a.x,q?.z??2*b.z-a.z);
  sizes.push(extents.get(key(a))??0);
 }
 const geometry=new THREE.InstancedBufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,0,0,1,0,0,-1,1,0,1,1,0],3));geometry.setIndex([0,1,2,2,1,3]);
 for(const [name,values] of [['aStart',starts],['aEnd',ends],['aPrevious',previous],['aNext',next]] as const)geometry.setAttribute(name,new THREE.InstancedBufferAttribute(new Float32Array(values),2));
 geometry.setAttribute('aExtent',new THREE.InstancedBufferAttribute(new Float32Array(sizes),1));
 geometry.instanceCount=coast.length;
 const material=new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
  blending:THREE.CustomBlending,blendEquation:THREE.MaxEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,
  uniforms:{uResolution:{value:new THREE.Vector2(1,1)},uWidth:{value:COAST_SHADOW_WIDTH}},
  vertexShader:`
   uniform vec2 uResolution; uniform float uWidth;
   attribute vec2 aStart,aEnd,aPrevious,aNext;attribute float aExtent;
   varying float vAcross,vStrength;
   vec4 projectCoast(vec2 p){return projectionMatrix*modelViewMatrix*vec4(p.x,-0.20,p.y,1.0);}
   vec2 screen(vec4 p){return p.xy/p.w*uResolution*0.5;}
   vec2 direction(vec2 a,vec2 b){vec2 d=b-a;return d/max(length(d),0.0001);}
   void main(){
    vec4 a=projectCoast(aStart),b=projectCoast(aEnd);
    vec2 pa=screen(a),pb=screen(b),dir=direction(pa,pb),normal=vec2(-dir.y,dir.x);
    float extent=length(screen(projectCoast(aStart+vec2(aExtent,0.0)))-pa);
    vStrength=smoothstep(uWidth*0.3,uWidth*2.0,extent);
    vec2 incoming=direction(screen(projectCoast(aPrevious)),pa),outgoing=direction(pb,screen(projectCoast(aNext)));
    vec2 tangent=mix(incoming+dir,dir+outgoing,position.y);
    tangent=length(tangent)>0.0001?normalize(tangent):dir;
    vec2 miter=vec2(-tangent.y,tangent.x);
    float extension=min(1.5,1.0/max(abs(dot(miter,normal)),0.5));
    vec4 clip=mix(a,b,position.y);
    clip.xy+=miter*position.x*uWidth*extension*2.0/uResolution*clip.w;
    gl_Position=clip;vAcross=position.x;
   }`,
  fragmentShader:`
   varying float vAcross,vStrength;
   void main(){
    float fade=1.0-smoothstep(0.0,1.0,abs(vAcross));
    gl_FragColor=vec4(fade*fade*vStrength,0.0,0.0,1.0);
   }`,
 });
 const mesh=new THREE.Mesh(geometry,material);mesh.name='offshore-coast-shadow';mesh.renderOrder=-1;mesh.frustumCulled=false;
 // Shared materials/geometry also serve the repeated atlas copies.
 mesh.onBeforeRender=renderer=>{renderer.getSize(material.uniforms.uResolution.value);};
 return mesh;
}

/** Preserve every original segment and its join data, but let the camera reject
 * distant tiles before submitting their vertices to the coastal mask pass. */
export function coastShadowTiles(source:THREE.InstancedBufferGeometry):THREE.InstancedBufferGeometry[]{
 const start=source.getAttribute('aStart'),end=source.getAttribute('aEnd'),tiles=new Map<string,number[]>(),point=new THREE.Vector3();
 for(let i=0;i<source.instanceCount;i++){
  const key=`${Math.floor((start.getX(i)+end.getX(i))/256)},${Math.floor((start.getY(i)+end.getY(i))/256)}`,ids=tiles.get(key)??[];
  ids.push(i);tiles.set(key,ids);
 }
 return [...tiles.values()].map(ids=>{
  const geometry=new THREE.InstancedBufferGeometry(),box=new THREE.Box3();geometry.setIndex(source.index);geometry.instanceCount=ids.length;
  for(const [name,attribute] of Object.entries(source.attributes)){
   if(name==='position'){geometry.setAttribute(name,attribute);continue;}
   const values=new Float32Array(ids.length*attribute.itemSize),array=attribute.array;
   for(let i=0;i<ids.length;i++)values.set(array.subarray(ids[i]*attribute.itemSize,(ids[i]+1)*attribute.itemSize),i*attribute.itemSize);
   geometry.setAttribute(name,new THREE.InstancedBufferAttribute(values,attribute.itemSize,attribute.normalized));
  }
  for(const id of ids)for(const attribute of [start,end])box.expandByPoint(point.set(attribute.getX(id),-.20,attribute.getY(id)));
  geometry.boundingBox=box;geometry.boundingSphere=box.getBoundingSphere(new THREE.Sphere());geometry.userData.coastBaseRadius=geometry.boundingSphere.radius;
  return geometry;
 });
}

/** Cache the screen-space union until the camera, viewport or wrap mode changes.
 * Only the sea-plane composite blends over the map; land depth hides its inland
 * half. Moving armies do not regenerate this static geographic mask. */
export class CoastShadow {
 readonly surface:THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
 private target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
 private screenTarget=this.target;private cacheTarget=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});private previousTarget:THREE.WebGLRenderTarget|null=null;
 private maskScene=new THREE.Scene();
 private ribbon:ReturnType<typeof createCoastShadow>;
 private copies:THREE.Group[]=[];
 private tiles:THREE.InstancedBufferGeometry[];
 private tilePoint=new THREE.Vector3();private worldWidth:number;
 private view=new THREE.Matrix4();
 private previousView=new THREE.Matrix4();
 private drawingSize=new THREE.Vector2();
 private clearColor=new THREE.Color();
 private valid=false;private wrapped=false;
 constructor(edges:readonly BorderEdge[],bounds:Rect){
  this.ribbon=createCoastShadow(edges);this.tiles=coastShadowTiles(this.ribbon.geometry);
  const group=new THREE.Group();
  for(const geometry of this.tiles){const mesh=new THREE.Mesh(geometry,this.ribbon.material);mesh.frustumCulled=true;group.add(mesh);}
  this.maskScene.add(group);
  const width=bounds.right-bounds.left;
  this.worldWidth=width;
  for(const offset of [-width,width]){const copy=group.clone(true);copy.position.x=offset;this.copies.push(copy);this.maskScene.add(copy);}
  this.maskScene.traverse(object=>{object.updateMatrix();object.matrixAutoUpdate=false;});this.maskScene.updateMatrixWorld(true);
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,
   uniforms:{uMask:{value:this.target.texture},uResolution:{value:new THREE.Vector2(1,1)},uOffset:{value:new THREE.Vector2()},uOpacity:{value:COAST_SHADOW_OPACITY}},
   vertexShader:'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
   fragmentShader:`uniform sampler2D uMask;uniform vec2 uResolution,uOffset;uniform float uOpacity;
    void main(){float fade=texture2D(uMask,(gl_FragCoord.xy-uOffset)/uResolution).r;
     gl_FragColor=vec4(0.001,0.004,0.006,uOpacity*fade);
     #include <colorspace_fragment>
    }`,
  });
  this.surface=new THREE.Mesh(new THREE.PlaneGeometry(width,bounds.bottom-bounds.top),material);
  this.surface.name='offshore-coast-shadow';this.surface.rotation.x=-Math.PI/2;this.surface.position.set((bounds.left+bounds.right)/2,-.20,(bounds.top+bounds.bottom)/2);this.surface.renderOrder=-1;
 }
 renderMask(renderer:THREE.WebGLRenderer,camera:THREE.Camera,wrapped:boolean,viewport?:{width:number;height:number;pixelRatio:number;offsetX?:number;offsetY?:number}){
  this.target=viewport?this.cacheTarget:this.screenTarget;
  if(viewport)this.drawingSize.set(viewport.width,viewport.height);else renderer.getDrawingBufferSize(this.drawingSize);
  this.surface.material.uniforms.uMask.value=this.target.texture;this.surface.material.uniforms.uResolution.value.copy(this.drawingSize);this.surface.material.uniforms.uOffset.value.set(viewport?.offsetX??0,viewport?.offsetY??0);
  this.view.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  if(this.valid&&this.previousTarget===this.target&&this.target.width===this.drawingSize.x&&this.target.height===this.drawingSize.y&&this.wrapped===wrapped&&this.previousView.equals(this.view))return;
  this.target.setSize(this.drawingSize.x,this.drawingSize.y);this.surface.material.uniforms.uResolution.value.copy(this.drawingSize);
  if(viewport)this.ribbon.material.uniforms.uResolution.value.set(viewport.width/viewport.pixelRatio,viewport.height/viewport.pixelRatio);else renderer.getSize(this.ribbon.material.uniforms.uResolution.value);
  for(const copy of this.copies)copy.visible=wrapped;
  // Screen-space extrusion remains visible even if a shoreline lies just beyond
  // the frustum. Scale the padding with depth, viewport size and camera tilt.
  const pixelScale=2*COAST_SHADOW_WIDTH*1.5/(camera.projectionMatrix.elements[5]*this.ribbon.material.uniforms.uResolution.value.y);
  for(const tile of this.tiles){const sphere=tile.boundingSphere!,base=tile.userData.coastBaseRadius as number;
   this.tilePoint.copy(sphere.center).applyMatrix4(camera.matrixWorldInverse);
   const depth=Math.max(0,-this.tilePoint.z+base+(wrapped?this.worldWidth*Math.abs(camera.matrixWorldInverse.elements[2]):0));sphere.radius=base+depth*pixelScale;
  }
  const previousTarget=renderer.getRenderTarget(),alpha=renderer.getClearAlpha();renderer.getClearColor(this.clearColor);
  try{renderer.setRenderTarget(this.target);renderer.setClearColor(0,0);renderer.render(this.maskScene,camera);}
  finally{renderer.setRenderTarget(previousTarget);renderer.setClearColor(this.clearColor,alpha);}
  this.previousView.copy(this.view);this.previousTarget=this.target;this.wrapped=wrapped;this.valid=true;
 }
 dispose(){this.screenTarget.dispose();this.cacheTarget.dispose();for(const tile of this.tiles)tile.dispose();this.ribbon.geometry.dispose();this.ribbon.material.dispose();}
}
