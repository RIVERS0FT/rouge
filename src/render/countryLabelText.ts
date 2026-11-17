import * as THREE from 'three';
import {MAP_LAYERS} from './mapLayers.ts';
import {countryFont} from './countryFont.ts';
import {COUNTRY_FONT_WEIGHT,COUNTRY_INK_OPACITY,COUNTRY_OUTLINE,COUNTRY_OUTLINE_OPACITY,countryOutlineWidth} from './countryTypography.ts';

type TextMesh=THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
interface GlyphRun {glyphs:{text:string;x:number;y:number;angle:number}[];font:string;scale:number;width:number;height:number}
interface Entry {texture:THREE.DataTexture|null;preview?:THREE.CanvasTexture;run?:GlyphRun;users:Set<TextMesh>;pending:boolean}
/** Stable SVG glyph metrics feed a distance texture once. The GPU reconstructs
 * ink and a screen-space outline at every scale; zoom never swaps blurry and
 * sharp versions of a country name. Layout generation runs off the UI thread. */
export class CountryLabelText {
 readonly group=new THREE.Group();
 private entries=new Map<string,Entry>();
 private preloadKeys=new WeakMap<object,string>();
 private meshes=new Map<HTMLSpanElement,THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>>();
 private worker:Worker|null=null;private disposed=false;
 private active=new Set<string>();
 private geometry=new THREE.PlaneGeometry(1,1);
 ready=false;
 constructor(private invalidate:()=>void){void countryFont.then(()=>{if(this.disposed)return;this.ready=true;this.invalidate();});}
 private material(){return new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
  uniforms:{uText:{value:null},uPreview:{value:false},uInk:{value:new THREE.Color()},uOutline:{value:new THREE.Color(COUNTRY_OUTLINE)},uStrokeRadius:{value:1}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:`uniform sampler2D uText;uniform bool uPreview;uniform vec3 uInk,uOutline;uniform float uStrokeRadius;varying vec2 vUv;
   void main(){vec4 sampleTex=texture2D(uText,vUv);float d=sampleTex.r-0.5;float edge=max(length(vec2(dFdx(d),dFdy(d))),0.00001);
    float fill=(uPreview?sampleTex.a*(1.0-sampleTex.r):smoothstep(-edge*0.5,edge*0.5,d))*${COUNTRY_INK_OPACITY};
    float outline=(uPreview?sampleTex.a*sampleTex.r:smoothstep(-edge*(uStrokeRadius+0.5),-edge*(uStrokeRadius-0.5),d))*${COUNTRY_OUTLINE_OPACITY}*(1.0-fill);
    float alpha=fill+outline;
    gl_FragColor=vec4((uInk*fill+uOutline*outline)/max(alpha,0.00001),alpha);
    #include <colorspace_fragment>
   }`,
 });}
 begin(){this.active.clear();for(const mesh of this.meshes.values())mesh.visible=false;}
 preload(path:string,width:number,height:number,name:string,font:string,spacing:string,identity:object){
  let key=this.preloadKeys.get(identity);if(!key){key=JSON.stringify([width,height,path,name,font,spacing]);this.preloadKeys.set(identity,key);}this.active.add(key);if(this.entries.has(key))return key;
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),defs=document.createElementNS(ns,'defs'),curve=document.createElementNS(ns,'path'),text=document.createElementNS(ns,'text'),textPath=document.createElementNS(ns,'textPath');
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);curve.id='preload-curve';curve.setAttribute('d',path);defs.append(curve);textPath.setAttribute('href','#preload-curve');textPath.setAttribute('startOffset','50%');textPath.textContent=name;
  text.setAttribute('font-size','100');text.setAttribute('font-family',font);text.setAttribute('letter-spacing',spacing);text.setAttribute('text-anchor','middle');text.append(textPath);svg.append(defs,text);
  this.entries.set(key,{texture:null,users:new Set(),pending:true});this.generate(key,svg,width,height);
  return key;
 }
 update(label:HTMLSpanElement,svg:SVGSVGElement,width:number,height:number,units:number,x:number,z:number,elevation:number,fontPixels:number,pixelRatio:number,ink:string,key:string){
  let mesh=this.meshes.get(label);
  if(!mesh){mesh=new THREE.Mesh(this.geometry,this.material());mesh.rotation.x=-Math.PI/2;mesh.renderOrder=MAP_LAYERS.countryName;mesh.frustumCulled=true;this.meshes.set(label,mesh);this.group.add(mesh);}
  mesh.position.set(x+width/units/2,elevation,z+height/units/2);mesh.scale.set(width/units,height/units,1);
  mesh.material.uniforms.uInk.value.set(ink);mesh.material.uniforms.uStrokeRadius.value=countryOutlineWidth(fontPixels)*pixelRatio/2;
  this.active.add(key);
  if(mesh.userData.textKey!==key){
   const previous=this.entries.get(mesh.userData.textKey);previous?.users.delete(mesh);
   if(previous&&!previous.users.size){this.disposeEntry(previous);this.entries.delete(mesh.userData.textKey);}
   mesh.userData.textKey=key;mesh.material.uniforms.uText.value=null;
  }
  let entry=this.entries.get(key);
  if(!entry){entry={texture:null,users:new Set(),pending:true};this.entries.set(key,entry);this.generate(key,svg,width,height);}
  entry.users.add(mesh);
  const texture=entry.texture??this.rasterPreview(entry);mesh.visible=!!texture;
  mesh.material.uniforms.uText.value=texture;mesh.material.uniforms.uPreview.value=!entry.texture;
  // SVG remains available for glyph metrics. All visible text, including the
  // temporary canvas glyphs, stays in the same camera-composed GPU layer.
  label.dataset.textRenderer=entry.texture?'distance-field':'canvas-preview';
 }
 private rasterPreview(entry:Entry){
  if(entry.preview||!entry.run)return entry.preview??null;
  const run=entry.run,ratio=Math.min(.65,768/Math.max(run.width,run.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.ceil(run.width*ratio));canvas.height=Math.max(1,Math.ceil(run.height*ratio));
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  ctx.scale(run.scale*ratio,run.scale*ratio);ctx.font=run.font;ctx.strokeStyle='white';ctx.fillStyle='black';
  ctx.lineJoin='round';ctx.lineWidth=3.5;
  for(const stroke of [true,false])for(const glyph of run.glyphs){
   ctx.save();ctx.translate(glyph.x,glyph.y);ctx.rotate(glyph.angle);
   if(stroke)ctx.strokeText(glyph.text,0,0);else ctx.fillText(glyph.text,0,0);ctx.restore();
  }
  const preview=new THREE.CanvasTexture(canvas);preview.generateMipmaps=false;
  preview.minFilter=THREE.LinearFilter;preview.magFilter=THREE.LinearFilter;
  entry.preview=preview;return preview;
 }
 private disposeEntry(entry:Entry){entry.texture?.dispose();entry.preview?.dispose();}
 private generate(key:string,svg:SVGSVGElement,width:number,height:number){
  try{
   const clone=svg.cloneNode(true) as SVGSVGElement;clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.removeAttribute('style');
   clone.querySelector('path')!.id='country-distance-curve';clone.querySelector('textPath')!.setAttribute('href','#country-distance-curve');
   const text=clone.querySelector('text')!;text.removeAttribute('vector-effect');text.style.cssText=`fill:white;stroke:none;font-weight:${COUNTRY_FONT_WEIGHT};dominant-baseline:central`;
   clone.setAttribute('width',String(width));clone.setAttribute('height',String(height));clone.style.cssText='position:fixed;left:-100000px;top:-100000px;visibility:hidden;pointer-events:none';
   // Read the exact SVG glyph positions, but paint with the document's loaded
   // font. SVG-to-image decoding silently substitutes external web fonts.
   document.body.append(clone);
   try{
    const scale=Math.min(1.5,4096/Math.max(width,height)),w=Math.ceil(width*scale),h=Math.ceil(height*scale);
    const glyphs:{text:string;x:number;y:number;angle:number}[]=[];
    let index=0;for(const character of text.textContent??''){
     const p=text.getStartPositionOfChar(index),angle=text.getRotationOfChar(index)*Math.PI/180;index+=character.length;
     glyphs.push({text:character,x:p.x,y:p.y,angle});
    }
    this.entries.get(key)!.run={glyphs,font:`${COUNTRY_FONT_WEIGHT} 100px ${text.getAttribute('font-family')}`,scale,width:w,height:h};
   }finally{clone.remove();}
   if(!this.worker){
    const worker=new Worker(new URL('./textDistanceField.worker.ts',import.meta.url),{type:'module'});this.worker=worker;
    worker.onmessage=({data}:{data:{key:string;pixels:Uint8Array;width:number;height:number;error?:boolean}})=>{
     const entry=this.entries.get(data.key);if(this.disposed||!entry)return;
     if(data.error){entry.pending=false;this.invalidate();return;}
     const texture=new THREE.DataTexture(data.pixels,data.width,data.height,THREE.RedFormat,THREE.UnsignedByteType);
     texture.flipY=true;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;entry.texture=texture;entry.pending=false;entry.preview?.dispose();entry.preview=undefined;entry.run=undefined;
     for(const mesh of entry.users){mesh.material.uniforms.uText.value=texture;mesh.material.uniforms.uPreview.value=false;}
     this.invalidate();
    };
    worker.onerror=()=>{for(const entry of this.entries.values())entry.pending=false;worker.terminate();this.worker=null;this.invalidate();};
   }
   this.worker?.postMessage({key,...this.entries.get(key)!.run!});
  }catch{const entry=this.entries.get(key);if(entry)entry.pending=false;/* The canvas glyph preview remains usable when worker startup fails. */}
 }
 remove(label:HTMLSpanElement){const mesh=this.meshes.get(label);if(!mesh)return;this.group.remove(mesh);mesh.material.dispose();this.meshes.delete(label);const entry=this.entries.get(mesh.userData.textKey);entry?.users.delete(mesh);if(entry&&!entry.users.size){this.disposeEntry(entry);this.entries.delete(mesh.userData.textKey);}}
 end(){for(const [key,entry] of this.entries)if(!this.active.has(key)){this.disposeEntry(entry);this.entries.delete(key);}}
 get pending(){return [...this.entries.values()].filter(entry=>entry.pending).length;}
 dispose(){this.disposed=true;this.worker?.terminate();for(const entry of this.entries.values())this.disposeEntry(entry);for(const mesh of this.meshes.values())mesh.material.dispose();this.geometry.dispose();this.entries.clear();this.meshes.clear();}
}
