import * as THREE from 'three';
import {WORLD_BOUNDS} from '../game/geo.ts';
import {compactSurface,OCEAN_DEEP,OCEAN_SHELF,RELIEF_MIDPOINT,RELIEF_STRENGTH} from './mapSurfaceConfig.ts';

const reliefUrls={
  compact:new URL('../assets/map/natural-earth-relief-2048.webp',import.meta.url).href,
  full:new URL('../assets/map/natural-earth-relief-4096.webp',import.meta.url).href,
};
const oceanUrls={
  compact:new URL('../assets/map/natural-earth-ocean-1024.webp',import.meta.url).href,
  full:new URL('../assets/map/natural-earth-ocean-2048.webp',import.meta.url).href,
};

/** Two cached images, no additional geometry, render pass, per-frame work or
 * simulation import. Borders/labels remain separate and the relief never touches
 * the sea. Repeated atlases share these materials and textures. */
export class MapSurface {
  private disposed=false;
  private images:HTMLImageElement[]=[];
  private textures:THREE.Texture[]=[];
  private startFrame:number;
  constructor(land:THREE.Material,sea:THREE.Material,private renderer:THREE.WebGLRenderer,private invalidate:()=>void){
    const canvas=renderer.domElement;
    const compact=compactSurface(Math.min(innerWidth,innerHeight),matchMedia('(pointer:coarse)').matches,renderer.capabilities.maxTextureSize,(navigator as Navigator&{deviceMemory?:number}).deviceMemory);
    canvas.dataset.surfaceResolution=compact?'compact':'full';
    canvas.dataset.surfaceProjection='miller-crop';
    canvas.dataset.reliefSource='natural-earth-shaded-relief';canvas.dataset.oceanSource='natural-earth-ocean-bottom';
    const landLoad=this.attach(land,'relief',reliefUrls[compact?'compact':'full']);
    const oceanLoad=this.attach(sea,'ocean',oceanUrls[compact?'compact':'full']);
    // Do not make the map, opening menu or simulation wait on cosmetic images.
    // Let its first flat-color frame paint before starting low-priority downloads.
    this.startFrame=requestAnimationFrame(()=>{this.startFrame=requestAnimationFrame(()=>{landLoad();oceanLoad();});});
  }
  private attach(material:THREE.Material,kind:'relief'|'ocean',url:string){
    const textureUniform={value:null as THREE.Texture|null},ready={value:0};
    const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey();
    material.onBeforeCompile=(shader,renderer)=>{
      previous.call(material,shader,renderer);
      shader.uniforms.uSurface=textureUniform;shader.uniforms.uSurfaceReady=ready;
      shader.uniforms.uOceanDeep={value:new THREE.Color(OCEAN_DEEP)};shader.uniforms.uOceanShelf={value:new THREE.Color(OCEAN_SHELF)};
      shader.vertexShader='varying vec2 vSurfaceUv;\n'+shader.vertexShader;
      // Land vertices already use world X/Z. The sea plane is rotated from XY;
      // use its built-in UVs, which put the geographic north at V=1 as well.
      const uv=kind==='relief'?`vec2((position.x - ${WORLD_BOUNDS.left.toFixed(8)}) / ${(WORLD_BOUNDS.right-WORLD_BOUNDS.left).toFixed(8)}, (${WORLD_BOUNDS.bottom.toFixed(8)} - position.z) / ${(WORLD_BOUNDS.bottom-WORLD_BOUNDS.top).toFixed(8)})`:'uv';
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\nvSurfaceUv = ${uv};`);
      shader.fragmentShader='uniform sampler2D uSurface; uniform float uSurfaceReady; uniform vec3 uOceanDeep; uniform vec3 uOceanShelf; varying vec2 vSurfaceUv;\n'+shader.fragmentShader;
      const shading=kind==='relief'?`diffuseColor.rgb *= clamp(1.0 + (surfaceTone - ${RELIEF_MIDPOINT.toFixed(8)}) * ${RELIEF_STRENGTH.toFixed(8)}, 0.65, 1.15);`:'diffuseColor.rgb = mix(uOceanDeep, uOceanShelf, smoothstep(0.0, 1.0, surfaceTone));';
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\nif (uSurfaceReady > 0.5) { float surfaceTone = texture2D(uSurface, vSurfaceUv).r; ${shading} }`);
    };
    material.customProgramCacheKey=()=>`${previousKey}:natural-earth-${kind}-v1`;
    this.renderer.domElement.dataset[`${kind}State`]='pending';
    return ()=>{
      if(this.disposed)return;
      const image=new Image();image.decoding='async';image.fetchPriority='low';this.images.push(image);
      const dataset=this.renderer.domElement.dataset;dataset[`${kind}State`]='loading';
      image.src=url;
      image.decode().then(()=>{
        if(this.disposed)return;
        const texture=new THREE.Texture(image);texture.colorSpace=THREE.NoColorSpace;texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;
        texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());texture.needsUpdate=true;
        this.textures.push(texture);textureUniform.value=texture;ready.value=1;
        dataset[`${kind}State`]='ready';dataset[`${kind}Width`]=String(image.naturalWidth);this.invalidate();
      }).catch(()=>{if(!this.disposed){dataset[`${kind}State`]='fallback';this.invalidate();}});
    };
  }
  dispose(){this.disposed=true;cancelAnimationFrame(this.startFrame);for(const image of this.images)image.src='';for(const texture of this.textures)texture.dispose();this.images=[];this.textures=[];}
}
