import * as THREE from 'three';
import {UNIT_GLYPHS} from './unitPresentation.ts';

/** One small procedural atlas, shared by every unit. No per-unit canvas, DOM
 * node, texture load or draw call; the white counter is tinted by instanceColor. */
export function createUnitSpriteTexture():THREE.CanvasTexture {
  const size=64,canvas=document.createElement('canvas');canvas.width=size*UNIT_GLYPHS.length;canvas.height=size;
  const ctx=canvas.getContext('2d')!;
  for(const [i,kind] of UNIT_GLYPHS.entries()){
    ctx.save();ctx.translate(i*size,0);ctx.lineJoin='round';ctx.lineCap='round';
    // Light outer keyline and dark inset remain legible over faction-colored land.
    ctx.fillStyle='#fff';ctx.strokeStyle='#141b1c';ctx.lineWidth=4;
    ctx.beginPath();ctx.roundRect(6,10,52,44,9);ctx.fill();ctx.stroke();
    ctx.strokeStyle='#141b1c';ctx.fillStyle='#141b1c';ctx.lineWidth=4;
    const line=(points:number[])=>{ctx.beginPath();ctx.moveTo(points[0],points[1]);for(let n=2;n<points.length;n+=2)ctx.lineTo(points[n],points[n+1]);ctx.stroke();};
    const dot=(x:number,y:number,r=4)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();};
    if(kind==='infantry'){line([19,22,45,42]);line([45,22,19,42]);}
    else if(kind==='cavalry'||kind==='heavyCavalry'){
      line([20,43,44,21]);if(kind==='heavyCavalry'){line([18,34,35,17]);line([29,47,46,30]);}
    }else if(kind==='artillery'||kind==='horseArtillery'){
      dot(32,32,8);if(kind==='horseArtillery')line([18,44,45,19]);
    }else if(kind==='engineer'){
      line([18,41,18,24,46,24,46,41]);line([32,24,32,38]);
    }else if(kind==='skirmisher'){
      line([18,37,25,28,32,37,39,28,46,37]);
    }else if(kind==='grenadier'){
      dot(31,36,9);line([32,27,36,20,43,20]);
    }else{
      // All embarked classes share the transport-ship symbol until disembarking.
      ctx.beginPath();ctx.moveTo(17,34);ctx.lineTo(47,34);ctx.lineTo(41,43);ctx.lineTo(23,43);ctx.closePath();ctx.fill();
      line([31,18,31,32]);line([35,20,43,29,35,29]);line([18,48,46,48]);
    }
    ctx.restore();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;return texture;
}
export function createUnitSpriteMesh(texture:THREE.Texture,capacity:number):THREE.InstancedMesh {
  const geometry=new THREE.PlaneGeometry(1,1);
  geometry.setAttribute('unitGlyph',new THREE.InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(THREE.DynamicDrawUsage));
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.1,depthTest:false,depthWrite:false,toneMapped:false});
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float unitGlyph;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>\nvMapUv.x = (vMapUv.x + unitGlyph) / ${UNIT_GLYPHS.length.toFixed(1)};`);
  };
  material.customProgramCacheKey=()=> 'unit-counter-atlas-v1';
  const mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.name='2d-unit-sprites';mesh.renderOrder=3;
  mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;return mesh;
}
