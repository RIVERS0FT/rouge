import * as THREE from 'three';
import {parseInfantryAsset,type InfantryAsset} from './infantryAsset.ts';

let assetRequest:Promise<InfantryAsset>|undefined;
async function loadAsset(){
  // Vite fingerprints the binary and resolves this URL relative to the Pages deployment.
  const response=await fetch(new URL('./assets/infantry.bin',import.meta.url));
  if(!response.ok)throw new Error(`Infantry asset HTTP ${response.status}`);
  return parseInfantryAsset(await response.arrayBuffer());
}
function getModel(){
  return assetRequest??=loadAsset().catch((e:unknown)=>{assetRequest=undefined;throw e;});
}
const vertexHeader=`
uniform highp sampler2D rougePoses;
attribute vec3 rougeBaseColor;
attribute float rougeTint;
attribute float rougeGlow;
attribute vec2 rougeJoints;
attribute float rougeWeight;
attribute float rougeFrame;
attribute vec3 rougeCountry;
varying vec3 rougePigment;
varying float rougeEmission;
void rougeTransform(int j, int f, vec4 p, vec4 n, out vec3 v, out vec3 w) {
  int x = j * 3;
  vec4 a = texelFetch(rougePoses, ivec2(x, f), 0);
  vec4 b = texelFetch(rougePoses, ivec2(x+1, f), 0);
  vec4 c = texelFetch(rougePoses, ivec2(x+2, f), 0);
  v = vec3(dot(a,p),dot(b,p),dot(c,p));
  w = vec3(dot(a,n),dot(b,n),dot(c,n));
}
`;
const transform=`
  int a = int(rougeJoints.x);
  int b = int(rougeJoints.y);
  int pose = int(rougeFrame);
  vec4 p0 = vec4(position,1.0);
  vec4 n0 = vec4(normal,0.0);
  vec3 posedPosition,posedNormal;
  rougeTransform(a,pose,p0,n0,posedPosition,posedNormal);
  if(a != b) {
    vec3 p1,n1;
    rougeTransform(b,pose,p0,n0,p1,n1);
    posedPosition = mix(p1,posedPosition,rougeWeight);
    posedNormal = mix(n1,posedNormal,rougeWeight);
  }
  rougePigment = mix(rougeBaseColor, rougeCountry*0.68+rougeBaseColor*0.25, rougeTint);
  rougeEmission = rougeGlow;
`;

export class InfantryBatch {
  private asset:InfantryAsset|null=null;
  private mesh:THREE.InstancedMesh|null=null;
  private texture:THREE.DataTexture|null=null;
  private material:THREE.MeshStandardMaterial|null=null;
  private poseFrames:THREE.InstancedBufferAttribute|null=null;
  private country:THREE.InstancedBufferAttribute|null=null;
  private disposed=false;
  private started=false;
  private capacity=128;
  ready=false;
  failed=false;
  count=0;
  walking=0;
  shooting=0;
  constructor(private readonly scene:THREE.Scene,private readonly invalidate:()=>void){}
  request(){
    if(this.started||this.disposed)return;this.started=true;
    void getModel().then(asset=>{
      if(this.disposed)return;
      this.asset=asset;
      this.texture=new THREE.DataTexture(asset.palette,asset.joints*3,asset.walkFrames+asset.shootFrames,THREE.RGBAFormat,THREE.FloatType);
      this.texture.needsUpdate=true;
      this.material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.95});
      this.material.onBeforeCompile=shader=>{
        shader.uniforms.rougePoses={value:this.texture};
        shader.vertexShader=vertexHeader+shader.vertexShader
          .replace('#include <beginnormal_vertex>',transform+'\nvec3 objectNormal = normalize(posedNormal);')
          .replace('#include <begin_vertex>','vec3 transformed = posedPosition;');
        shader.fragmentShader='varying vec3 rougePigment; varying float rougeEmission;\n'+shader.fragmentShader
          .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb *= rougePigment;')
          .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += rougePigment * rougeEmission * 3.0;');
      };
      this.material.customProgramCacheKey=()=> 'rouge-baked-infantry-v10';
      this.rebuild();
      this.ready=true;
      this.invalidate();
    }).catch(()=>{if(!this.disposed){this.failed=true;this.invalidate();}});
  }
  private rebuild(){
    const asset=this.asset!,mesh=this.mesh;
    if(mesh){this.scene.remove(mesh);mesh.dispose();mesh.geometry.dispose();}
    const geometry=new THREE.BufferGeometry();
    geometry.setIndex(new THREE.BufferAttribute(asset.indices,1));
    geometry.setAttribute('position',new THREE.BufferAttribute(asset.positions,3));
    geometry.setAttribute('normal',new THREE.BufferAttribute(asset.normals,3,true));
    geometry.setAttribute('rougeBaseColor',new THREE.BufferAttribute(asset.colors,3,true));
    geometry.setAttribute('rougeTint',new THREE.BufferAttribute(asset.tint,1,true));
    geometry.setAttribute('rougeGlow',new THREE.BufferAttribute(asset.glow,1,true));
    geometry.setAttribute('rougeJoints',new THREE.BufferAttribute(asset.jointPair,2));
    geometry.setAttribute('rougeWeight',new THREE.BufferAttribute(asset.weights,1,true));
    this.poseFrames=new THREE.InstancedBufferAttribute(new Float32Array(this.capacity),1).setUsage(THREE.DynamicDrawUsage);
    this.country=new THREE.InstancedBufferAttribute(new Float32Array(this.capacity*3),3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('rougeFrame',this.poseFrames);geometry.setAttribute('rougeCountry',this.country);
    const next=new THREE.InstancedMesh(geometry,this.material!,this.capacity);
    next.name='Rouge infantry batch';next.count=0;next.frustumCulled=false;next.instanceMatrix.setUsage(THREE.DynamicDrawUsage);next.visible=false;
    this.mesh=next;this.scene.add(next);
  }
  begin(visible:boolean,required:number){
    this.count=this.walking=this.shooting=0;
    if(!this.ready)return;
    if(visible&&required>this.capacity){while(required>this.capacity)this.capacity*=2;this.rebuild();}
    this.mesh!.visible=visible;
  }
  add(matrix:THREE.Matrix4,color:THREE.Color,move:number,shot:number,id:number){
    const asset=this.asset!,i=this.count++,fps=asset.fps/1000;
    let frame=0;
    if(shot>=0&&shot<(asset.shootFrames-1)/fps){
      const sample=Math.floor(shot*fps);frame=asset.walkFrames+sample;this.shooting++;
    }else if(move>0){
      // Offset the gait per unit while synchronizing the displayed direction with motion.
      frame=Math.floor((move*fps+id*.618)%(asset.walkFrames-1));this.walking++;
    }
    this.mesh!.setMatrixAt(i,matrix);this.country!.setXYZ(i,color.r,color.g,color.b);this.poseFrames!.setX(i,frame);
  }
  end(){
    if(!this.ready)return;
    const mesh=this.mesh!;mesh.count=this.count;
    if(!this.count)return;
    for(const a of [mesh.instanceMatrix,this.country!,this.poseFrames!]){
      a.clearUpdateRanges();a.addUpdateRange(0,this.count*a.itemSize);a.needsUpdate=true;
    }
  }
  dispose(){
    this.disposed=true;this.ready=false;
    if(this.mesh){this.scene.remove(this.mesh);this.mesh.geometry.dispose();this.mesh.dispose();}
    this.texture?.dispose();this.material?.dispose();
  }
}
