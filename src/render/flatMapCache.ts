import * as THREE from 'three';

interface Rect {left:number;right:number;top:number;bottom:number}
export interface CacheViewport {width:number;height:number;offsetX:number;offsetY:number;maskOffsetX?:number;maskOffsetY?:number}
type Draw=(camera:THREE.PerspectiveCamera,width:number,height:number,pixelRatio:number,viewport:CacheViewport)=>void;
interface Build {target:THREE.WebGLRenderTarget;camera:THREE.PerspectiveCamera;rect:Rect;revision:number;wrapped:boolean;ratio:number;width:number;height:number;column:number;row:number}

/** A world-aligned, overscanned background for the flat camera. Armies and DOM
 * labels remain live. Reuse depends on geographic coverage, never screen pixels,
 * so a camera gesture cannot slide the background relative to the map. */
export class FlatMapCache {
 readonly surface=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({toneMapped:false}));
 private target:THREE.WebGLRenderTarget|null=null;
 private buffers:THREE.WebGLRenderTarget[]=[];
 private build:Build|null=null;private camera=new THREE.PerspectiveCamera();
 private revision=-1;private wrapped=false;private pixelRatio=0;
 private viewportWidth=0;private viewportHeight=0;
 private rect={left:0,right:0,top:0,bottom:0};
 private size=new THREE.Vector2();
 private baking={value:0};private detail={value:1};private clearColor=new THREE.Color();
 private covered=false;private stale=false;
 constructor(private readonly tileSize=512){
  this.surface.name='flat-map-cache';this.surface.rotation.x=-Math.PI/2;this.surface.position.y=.16;this.surface.visible=false;
  // The cache stores the final display colours, including each material's own
  // tone mapping and alpha blending. Decode once before the screen's output step.
  this.surface.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\ndiffuseColor.rgb=sRGBTransferEOTF(vec4(diffuseColor.rgb,1.0)).rgb;');};
 }
 attach(root:THREE.Object3D,renderer:THREE.WebGLRenderer){
  const materials=new Set<THREE.Material>();root.traverse(object=>{const material=(object as THREE.Mesh).material;if(material)for(const m of Array.isArray(material)?material:[material])materials.add(m);});
  for(const material of materials){
   const before=material.onBeforeCompile,key=material.customProgramCacheKey();
   material.onBeforeCompile=(shader,r)=>{
    before.call(material,shader,r);shader.uniforms.uMapCache=this.baking;shader.uniforms.uMapCacheDetail=this.detail;
    shader.uniforms.toneMappingExposure={value:renderer.toneMappingExposure};
    shader.fragmentShader='uniform float uMapCache;uniform float uMapCacheDetail;\n#ifndef TONE_MAPPING\n'+THREE.ShaderChunk.tonemapping_pars_fragment+'\n#endif\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('length(dFdx(p)), length(dFdy(p))','length(dFdx(p))*uMapCacheDetail, length(dFdy(p))*uMapCacheDetail').replace('fwidth(phase)','fwidth(phase)*uMapCacheDetail');
    if(material.toneMapped)shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>',`#include <tonemapping_fragment>\n#ifndef TONE_MAPPING\nif(uMapCache>.5)gl_FragColor.rgb=ACESFilmicToneMapping(gl_FragColor.rgb);\n#endif`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <colorspace_fragment>','if(uMapCache>.5){gl_FragColor=sRGBTransferOETF(gl_FragColor);}else{\n#include <colorspace_fragment>\n}');
   };
   material.customProgramCacheKey=()=>key+':flat-cache-display';
  }
 }
 prepare(renderer:THREE.WebGLRenderer,camera:THREE.PerspectiveCamera,revision:number,wrapped:boolean,draw:Draw){
  const ratio=renderer.getPixelRatio(),distance=camera.position.y-.16,halfHeight=distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),halfWidth=halfHeight*camera.aspect;
  const {x,z}=camera.position,r=this.rect;
  // Re-bake before magnifying cached texels; zooming out can reuse overscan.
  const resolution=this.target?this.target.height/(r.bottom-r.top):0;
  renderer.getSize(this.size);
  const enoughDetail=resolution>=this.size.y*ratio/(2*halfHeight)*1.2;
  const overscan=1.6,detail=1.5,maxSize=renderer.capabilities.maxTextureSize;
  const width=Math.min(maxSize,Math.ceil(this.size.x*ratio*overscan*detail)),height=Math.min(maxSize,Math.ceil(this.size.y*ratio*overscan*detail));
  const resized=this.viewportWidth!==this.size.x||this.viewportHeight!==this.size.y||this.pixelRatio!==ratio;
  if(resized){
   this.build=null;for(const buffer of this.buffers)buffer.dispose();this.buffers=[];this.target=null;
   // Paint directly into a scissored back buffer. Texture copies can force the
   // driver to finish outstanding work and defeat an incremental GPU budget.
   // Only the back buffer writes depth; the front is sampled as colour. Both
   // framebuffers can share one depth attachment without duplicating its memory.
   const depth=new THREE.DepthTexture(width,height,THREE.UnsignedIntType);
   for(let i=0;i<2;i++){const buffer=new THREE.WebGLRenderTarget(width,height,{depthBuffer:true,depthTexture:depth,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});renderer.initRenderTarget(buffer);this.buffers.push(buffer);}
   this.viewportWidth=this.size.x;this.viewportHeight=this.size.y;this.pixelRatio=ratio;
  }
  const marginX=(r.right-r.left)*.06,marginY=(r.bottom-r.top)*.06;
  const reserve=x-halfWidth>=r.left+marginX&&x+halfWidth<=r.right-marginX&&z-halfHeight>=r.top+marginY&&z+halfHeight<=r.bottom-marginY;
  if(!this.build&&(!this.target||this.revision!==revision||this.wrapped!==wrapped||!enoughDetail||!reserve)){
   const c=camera.clone();c.clearViewOffset();c.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*overscan));c.aspect=width/height;c.updateProjectionMatrix();c.updateMatrixWorld();
   const h=distance*Math.tan(THREE.MathUtils.degToRad(c.fov/2)),w=h*c.aspect,rect={left:x-w,right:x+w,top:z-h,bottom:z+h};
   this.build={target:this.buffers.find(buffer=>buffer!==this.target)!,camera:c,rect,revision,wrapped,ratio,width,height,column:0,row:0};
  }
  const job=this.build;if(job){
   const gutter=2,tileSize=this.tileSize,tx=job.column*tileSize,ty=job.row*tileSize,tw=Math.min(tileSize,job.width-tx),th=Math.min(tileSize,job.height-ty);
   const cw=tileSize+gutter*2,ch=tileSize+gutter*2,offsetX=tx-gutter,offsetY=job.height-ty-tileSize-gutter;
   this.camera.copy(job.camera);this.camera.setViewOffset(job.width,job.height,tx-gutter,ty-gutter,cw,ch);this.camera.updateMatrixWorld();
   job.target.viewport.set(offsetX,offsetY,cw,ch);job.target.scissor.set(tx,job.height-ty-th,tw,th);job.target.scissorTest=true;
   this.paint(renderer,this.camera,job.target,detail,job.ratio,draw,cw,ch,{width:job.width,height:job.height,offsetX:0,offsetY:0,maskOffsetX:offsetX,maskOffsetY:offsetY});
   if(++job.column*tileSize>=job.width){job.column=0;job.row++;}
   if(job.row*tileSize>=job.height){
    this.target=job.target;this.rect=job.rect;this.revision=job.revision;this.wrapped=job.wrapped;this.commit(job.target,job.rect);this.build=null;
   }
  }
  const current=this.rect,density=this.target?this.target.height/(current.bottom-current.top):0;this.covered=!!this.target&&density>=this.size.y*ratio/(2*halfHeight)*.98&&x-halfWidth>=current.left&&x+halfWidth<=current.right&&z-halfHeight>=current.top&&z+halfHeight<=current.bottom;
  this.stale=!this.target||this.revision!==revision||this.wrapped!==wrapped||density<this.size.y*ratio/(2*halfHeight)*1.2||!this.covered;
  renderer.domElement.dataset.mapCachePending=String(this.pending);renderer.domElement.dataset.mapCacheTilePixels=String(this.tileSize);renderer.domElement.dataset.mapCacheMode=this.covered?(this.pending?'updating':'ready'):'direct';
 }
 private paint(renderer:THREE.WebGLRenderer,camera:THREE.PerspectiveCamera,target:THREE.WebGLRenderTarget,detail:number,ratio:number,draw:Draw,width:number,height:number,viewport:CacheViewport){
  const previous=renderer.getRenderTarget(),alpha=renderer.getClearAlpha();renderer.getClearColor(this.clearColor);
  try{this.baking.value=1;this.detail.value=detail;renderer.setClearColor(this.clearColor.clone().convertLinearToSRGB(),alpha);renderer.setRenderTarget(target);draw(camera,width,height,ratio*detail,viewport);}
  finally{this.baking.value=0;this.detail.value=1;renderer.setRenderTarget(previous);renderer.setClearColor(this.clearColor,alpha);}
 }
 private commit(target:THREE.WebGLRenderTarget,rect:Rect){this.surface.material.map=target.texture;this.surface.material.needsUpdate=true;this.surface.position.set((rect.left+rect.right)/2,.16,(rect.top+rect.bottom)/2);this.surface.scale.set(rect.right-rect.left,rect.bottom-rect.top,1);}
 get pending(){return !!this.build||this.stale;}
 get usable(){return this.covered;}
 invalidate(){this.revision=-1;this.stale=true;if(this.build)this.build.revision=-1;}
 dispose(){for(const target of this.buffers)target.dispose();this.surface.geometry.dispose();this.surface.material.dispose();}
}
