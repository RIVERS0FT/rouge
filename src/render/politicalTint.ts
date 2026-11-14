import * as THREE from 'three';
import type {Rect} from '../game/crop.ts';
import type {BorderEdge} from './territoryBorders.ts';

/** Painted political edges: each owned country deepens toward its borders and
 * coasts, like ink pooling at the edge of a watercolour wash.
 *
 * The wash is baked once per ownership change into a world-aligned R8 texture
 * covering the map crop (an orthographic pass over mitred ribbons), and the land
 * shader samples it with the same UV as the relief. Nothing is redrawn while the
 * camera moves, the date-line copies share it, and CPU vertex colours (which
 * tests read) remain the exact owner colours. */
export const POLITICAL_TINT_REACH=9;
export const POLITICAL_TINT_STRENGTH=.3;
const key=(p:{x:number;z:number})=>`${p.x.toFixed(6)},${p.z.toFixed(6)}`;

/** Instanced ribbon quads with mitred joins, so consecutive segments never
 * overlap into darker beads at their shared vertices. */
export function politicalRibbonGeometry(edges:readonly BorderEdge[]):THREE.InstancedBufferGeometry{
 const adjacent=new Map<string,{x:number;z:number}[]>();
 for(const {a,b} of edges)for(const [p,q] of [[a,b],[b,a]]){const k=key(p),list=adjacent.get(k)??[];list.push(q);adjacent.set(k,list);}
 const starts:number[]=[],ends:number[]=[],previous:number[]=[],next:number[]=[];
 for(const {a,b} of edges){
  const before=adjacent.get(key(a))!,after=adjacent.get(key(b))!;
  const p=before.length===2?before.find(n=>key(n)!==key(b)):undefined,q=after.length===2?after.find(n=>key(n)!==key(a)):undefined;
  starts.push(a.x,a.z);ends.push(b.x,b.z);previous.push(p?.x??2*a.x-b.x,p?.z??2*a.z-b.z);next.push(q?.x??2*b.x-a.x,q?.z??2*b.z-a.z);
 }
 const geometry=new THREE.InstancedBufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,0,0,1,0,0,-1,1,0,1,1,0],3));geometry.setIndex([0,1,2,2,1,3]);
 for(const [name,values] of [['aStart',starts],['aEnd',ends],['aPrevious',previous],['aNext',next]] as const)geometry.setAttribute(name,new THREE.InstancedBufferAttribute(new Float32Array(values),2));
 geometry.instanceCount=edges.length;
 return geometry;
}

function ribbonMaterial(){
 return new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
  blending:THREE.CustomBlending,blendEquation:THREE.MaxEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,
  uniforms:{uReach:{value:POLITICAL_TINT_REACH}},
  vertexShader:`
   uniform float uReach;
   attribute vec2 aStart,aEnd,aPrevious,aNext;
   varying float vAcross;
   vec2 direction(vec2 a,vec2 b){vec2 d=b-a;return d/max(length(d),0.000001);}
   void main(){
    vec2 dir=direction(aStart,aEnd),normal=vec2(-dir.y,dir.x);
    vec2 tangent=mix(direction(aPrevious,aStart)+dir,dir+direction(aEnd,aNext),position.y);
    tangent=length(tangent)>0.000001?normalize(tangent):dir;
    vec2 miter=vec2(-tangent.y,tangent.x);
    float extension=min(1.5,1.0/max(abs(dot(miter,normal)),0.5));
    vec2 point=mix(aStart,aEnd,position.y)+miter*position.x*uReach*extension;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(point.x,0.0,point.y,1.0);vAcross=position.x;
   }`,
  fragmentShader:`
   varying float vAcross;
   void main(){
    float wash=1.0-smoothstep(0.0,1.0,abs(vAcross));
    gl_FragColor=vec4(wash*wash,0.0,0.0,1.0);
   }`,
 });
}

export class PoliticalTint {
 readonly uniforms:{uPoliticalTint:{value:THREE.Texture};uPoliticalTintStrength:{value:number}};
 private target:THREE.WebGLRenderTarget;
 private scene=new THREE.Scene();
 private camera:THREE.OrthographicCamera;
 private ribbon:THREE.Mesh<THREE.InstancedBufferGeometry,THREE.ShaderMaterial>;
 private copies:THREE.Mesh[]=[];
 private clearColor=new THREE.Color();
 private dirty=true;
 /** Device-pixel period of the occupation hatching; set from the drawing-buffer ratio. */
 readonly stripePeriod={value:10};
 readonly stripeOffset={value:0};
 segments=0;
 constructor(bounds:Rect,texels:{width:number;height:number}){
  this.target=new THREE.WebGLRenderTarget(texels.width,texels.height,{depthBuffer:false,format:THREE.RedFormat,type:THREE.UnsignedByteType,
   minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,wrapS:THREE.RepeatWrapping,wrapT:THREE.ClampToEdgeWrapping,generateMipmaps:false});
  this.uniforms={uPoliticalTint:{value:this.target.texture},uPoliticalTintStrength:{value:POLITICAL_TINT_STRENGTH}};
  const width=bounds.right-bounds.left,height=bounds.bottom-bounds.top;
  // Looking straight down with north up: texture u runs west→east and v south→north,
  // matching the land surface UV used by the relief texture.
  this.camera=new THREE.OrthographicCamera(-width/2,width/2,height/2,-height/2,.1,100);
  this.camera.up.set(0,0,-1);this.camera.position.set((bounds.left+bounds.right)/2,10,(bounds.top+bounds.bottom)/2);
  this.camera.lookAt((bounds.left+bounds.right)/2,0,(bounds.top+bounds.bottom)/2);this.camera.updateMatrixWorld();
  this.ribbon=new THREE.Mesh(politicalRibbonGeometry([]),ribbonMaterial());this.ribbon.frustumCulled=false;this.scene.add(this.ribbon);
  // Borders near the date line also wash the opposite edge of the texture.
  for(const offset of [-width,width]){const copy=this.ribbon.clone();copy.position.x=offset;this.copies.push(copy);this.scene.add(copy);}
 }
 /** Replace the painted edges after ownership or coast membership changes. */
 setEdges(edges:readonly BorderEdge[]){
  this.setGeometry(politicalRibbonGeometry(edges),edges.length);
 }
 setRibbon(attributes:Record<string,Float32Array>,segments:number){
  const geometry=politicalRibbonGeometry([]);for(const [name,array] of Object.entries(attributes))geometry.setAttribute(name,new THREE.InstancedBufferAttribute(array,2));geometry.instanceCount=segments;
  this.setGeometry(geometry,segments);
 }
 private setGeometry(geometry:THREE.InstancedBufferGeometry,segments:number){
  this.ribbon.geometry.dispose();this.ribbon.geometry=geometry;
  for(const copy of this.copies)copy.geometry=geometry;
  this.segments=segments;this.dirty=true;
 }
 /** Bake the wash if edges changed. Returns true when a pass was drawn. */
 render(renderer:THREE.WebGLRenderer):boolean{
  if(!this.dirty)return false;
  const previousTarget=renderer.getRenderTarget(),alpha=renderer.getClearAlpha();renderer.getClearColor(this.clearColor);
  try{renderer.setRenderTarget(this.target);renderer.setClearColor(0,0);renderer.clear(true,false,false);if(this.segments)renderer.render(this.scene,this.camera);}
  finally{renderer.setRenderTarget(previousTarget);renderer.setClearColor(this.clearColor,alpha);}
  this.dirty=false;return true;
 }
 /** Deepen and slightly saturate land colour where the wash is strong; the terrain
  * view keeps a lighter touch so relief stays readable. Requires vSurfaceUv. */
 attach(material:THREE.Material){
  const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
   previous.call(material,shader,renderer);
   Object.assign(shader.uniforms,this.uniforms,{uStripePeriod:this.stripePeriod,uStripeOffset:this.stripeOffset});
   // Regions under capture carry the captor's colour and progress in a separate attribute.
   shader.vertexShader='attribute vec4 captureTint; varying vec4 vCaptureTint;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCaptureTint = captureTint;');
   shader.fragmentShader=`uniform sampler2D uPoliticalTint; uniform float uPoliticalTintStrength; uniform float uRelief; uniform float uStripePeriod; uniform float uStripeOffset; varying vec4 vCaptureTint;
    `+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    float politicalEdge = texture2D(uPoliticalTint, vSurfaceUv).r * (1.0 - 0.55 * uRelief);
    float politicalLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    diffuseColor.rgb = mix(vec3(politicalLuma), diffuseColor.rgb, 1.0 + 0.5 * politicalEdge) * (1.0 - uPoliticalTintStrength * politicalEdge);
    // Occupation hatching: diagonal stripes in the captor's colour widen as capture advances.
    if (vCaptureTint.a > 0.0) {
     float band = fract((gl_FragCoord.x + gl_FragCoord.y + uStripeOffset) / uStripePeriod);
     float cover = 0.28 + 0.34 * vCaptureTint.a, edge = 1.2 / uStripePeriod;
     float stripe = smoothstep(1.0 - cover - edge, 1.0 - cover + edge, band);
     diffuseColor.rgb = mix(diffuseColor.rgb, vCaptureTint.rgb * 0.92, stripe * 0.9);
    }`);
  };
  material.customProgramCacheKey=()=>`${previousKey}:political-tint-capture-v1`;
 }
 dispose(){this.target.dispose();this.ribbon.geometry.dispose();this.ribbon.material.dispose();}
}
