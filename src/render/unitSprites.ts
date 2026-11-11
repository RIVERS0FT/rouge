import * as THREE from 'three';
import {UNIT_GLYPHS} from './unitPresentation.ts';

// Power-of-two cells stay aligned throughout the useful mip levels. Transparent
// borders are preserved per mip level so trilinear sampling cannot leak glyphs.
const ATLAS_COLUMNS=4,ATLAS_ROWS=4,CELL_SIZE=128,DESIGN_SIZE=64;

/** One supersampled, mip-filtered atlas for the entire army. The neutral face
 * retains instance faction tint; the broad dark glyphs survive strategic zoom. */
export function createUnitSpriteTexture():THREE.CanvasTexture {
  const canvas=document.createElement('canvas');
  canvas.width=CELL_SIZE*ATLAS_COLUMNS;canvas.height=CELL_SIZE*ATLAS_ROWS;
  const ctx=canvas.getContext('2d')!;
  for(const [i,kind] of UNIT_GLYPHS.entries()){
    ctx.save();ctx.translate((i%ATLAS_COLUMNS)*CELL_SIZE,Math.floor(i/ATLAS_COLUMNS)*CELL_SIZE);
    ctx.scale(CELL_SIZE/DESIGN_SIZE,CELL_SIZE/DESIGN_SIZE);
    ctx.lineJoin='round';ctx.lineCap='round';
    // Small grounded shadow, pale outer rim, dark keyline and a quiet bevel.
    // All strokes sit inside the tile, leaving room for bilinear/mip filtering.
    ctx.fillStyle='rgba(10,18,22,.24)';
    ctx.beginPath();ctx.roundRect(6,13,52,43,9);ctx.fill();
    ctx.fillStyle='#f7faf5';
    ctx.beginPath();ctx.roundRect(6,8,52,46,9);ctx.fill();
    ctx.fillStyle='#19252b';
    ctx.beginPath();ctx.roundRect(8,10,48,42,7);ctx.fill();
    const face=ctx.createLinearGradient(0,13,0,49);
    face.addColorStop(0,'#ffffff');face.addColorStop(.45,'#edf1e9');face.addColorStop(1,'#bcc9c3');
    ctx.fillStyle=face;
    ctx.beginPath();ctx.roundRect(11,13,42,36,4.5);ctx.fill();
    ctx.strokeStyle='#19252b';ctx.fillStyle='#19252b';ctx.lineWidth=4.5;
    const line=(points:number[])=>{ctx.beginPath();ctx.moveTo(points[0],points[1]);for(let n=2;n<points.length;n+=2)ctx.lineTo(points[n],points[n+1]);ctx.stroke();};
    const dot=(x:number,y:number,r=4)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();};
    if(kind==='infantry'){line([20,21,44,41]);line([44,21,20,41]);}
    else if(kind==='cavalry'||kind==='heavyCavalry'){
      line([21,42,43,20]);if(kind==='heavyCavalry'){line([18,32,32,18]);line([32,44,46,30]);}
    }else if(kind==='artillery'||kind==='horseArtillery'){
      dot(32,31,7.5);if(kind==='horseArtillery')line([19,43,45,18]);
    }else if(kind==='engineer'){
      line([19,41,19,23,45,23,45,41]);line([32,23,32,38]);
    }else if(kind==='skirmisher'){
      line([18,36,25,27,32,36,39,27,46,36]);
    }else if(kind==='grenadier'){
      dot(30,35,8);line([31,27,35,20,42,20]);
    }else{
      // Embarked classes share a transport silhouette until disembarking.
      ctx.beginPath();ctx.moveTo(17,33);ctx.lineTo(47,33);ctx.lineTo(41,42);ctx.lineTo(23,42);ctx.closePath();ctx.fill();
      line([30,18,30,30]);line([36,20,43,28,36,28]);
      ctx.lineWidth=3;line([21,46,43,46]);
    }
    ctx.restore();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;
  // Build each mip from the original, not from an already shrunken border.
  // The final sub-cell levels are transparent (well below our 7px minimum).
  // This costs ~1.33 MiB total and is built only once per renderer.
  texture.mipmaps=[canvas];
  for(let width=canvas.width/2;width>=1;width/=2){
    const mip=document.createElement('canvas');mip.width=width;mip.height=width;
    const mipContext=mip.getContext('2d')!,cell=width/ATLAS_COLUMNS;
    if(cell>=4){
      mipContext.imageSmoothingEnabled=true;mipContext.imageSmoothingQuality='high';
      for(let i=0;i<UNIT_GLYPHS.length;i++){
        const column=i%ATLAS_COLUMNS,row=Math.floor(i/ATLAS_COLUMNS),x=column*cell,y=row*cell;
        mipContext.drawImage(canvas,column*CELL_SIZE,row*CELL_SIZE,CELL_SIZE,CELL_SIZE,x,y,cell,cell);
        // A one-texel transparent moat survives filtering on both sides.
        mipContext.clearRect(x,y,cell,1);mipContext.clearRect(x,y+cell-1,cell,1);
        mipContext.clearRect(x,y,1,cell);mipContext.clearRect(x+cell-1,y,1,cell);
      }
    }
    texture.mipmaps.push(mip);
  }
  texture.generateMipmaps=false;
  texture.wrapS=THREE.ClampToEdgeWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;
  return texture;
}
export function createUnitSpriteMesh(texture:THREE.Texture,capacity:number):THREE.InstancedMesh {
  const geometry=new THREE.PlaneGeometry(1,1);
  geometry.setAttribute('unitGlyph',new THREE.InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(THREE.DynamicDrawUsage));
  // Preserve fractional edge coverage: an alpha-test threshold turns smooth
  // canvas edges back into stair steps as counters move between screen pixels.
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float unitGlyph;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
      vMapUv = (vMapUv + vec2(mod(unitGlyph, ${ATLAS_COLUMNS.toFixed(1)}), ${ATLAS_ROWS-1}.0 - floor(unitGlyph / ${ATLAS_COLUMNS.toFixed(1)}))) / vec2(${ATLAS_COLUMNS.toFixed(1)}, ${ATLAS_ROWS.toFixed(1)});`);
  };
  material.customProgramCacheKey=()=> 'unit-counter-atlas-v2';
  const mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.name='2d-unit-sprites';mesh.renderOrder=3;
  mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;return mesh;
}
