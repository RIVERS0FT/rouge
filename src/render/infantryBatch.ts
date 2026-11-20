import * as THREE from 'three';
import {parseInfantryAsset,type InfantryAsset} from './infantryAsset.ts';
import {layerMapEntity} from './mapLayers.ts';
import {infantryPose} from './infantryIdle.ts';
import {infantryFabricShader} from './infantryFabric.ts';

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
// All instances sample the same 41 poses. Skin each source vertex once per
// pose instead of fetching and multiplying up to six bone rows per instance.
function vertexPoses(asset:InfantryAsset){
  const count=asset.positions.length/3,width=Math.min(2048,count),rows=Math.ceil(count/width);
  const data=new Float32Array(width*rows*asset.poseCount*8);
  for(let frame=0;frame<asset.poseCount;frame++)for(let i=0;i<count;i++){
    const j=(frame*asset.joints+asset.jointPair[i*2])*12,k=(frame*asset.joints+asset.jointPair[i*2+1])*12;
    const weight=asset.weights[i]/255,at=(frame*2*rows*width+i)*4,normal=at+rows*width*4;
    for(let axis=0;axis<3;axis++){
      const a=j+axis*4,b=k+axis*4;
      let p=asset.palette[a+3]*weight+asset.palette[b+3]*(1-weight),n=0;
      for(let dim=0;dim<3;dim++){
        const m=asset.palette[a+dim]*weight+asset.palette[b+dim]*(1-weight);
        p+=m*asset.positions[i*3+dim];n+=m*Math.max(-1,asset.normals[i*3+dim]/127);
      }
      data[at+axis]=p;data[normal+axis]=n;
    }
  }
  const texture=new THREE.DataTexture(data,width,rows*2*asset.poseCount,THREE.RGBAFormat,THREE.FloatType);
  const idleStart=asset.idleFrame*2*rows*width*4;
  const idleAttribute=(offset:number)=>new THREE.InterleavedBufferAttribute(
    new THREE.InterleavedBuffer(data.subarray(offset,offset+count*4),4),3,0);
  texture.needsUpdate=true;
  return {texture,rows,idlePosition:idleAttribute(idleStart),idleNormal:idleAttribute(idleStart+rows*width*4)};
}
const vertexHeader=`
uniform highp sampler2D rougePoses;
attribute vec3 rougeBaseColor;
attribute float rougeTint;
attribute float rougeFabricId;
attribute float rougeGlow;
uniform int rougePoseRows;
uniform float rougeIdleFrame;
attribute vec3 rougeIdlePosition;
attribute vec3 rougeIdleNormal;
attribute float rougeFrame;
attribute vec3 rougeCountry;
varying vec3 rougePigment;
varying float rougeEmission;
varying vec3 rougeFabricPoint;
varying vec3 rougeArmbandColor;
varying float rougeFabricKind;
`;
const transform=`
  vec3 posedPosition=rougeIdlePosition, posedNormal=rougeIdleNormal;
  if(rougeFrame!=rougeIdleFrame){
    int w=textureSize(rougePoses,0).x;
    ivec2 at=ivec2(gl_VertexID % w,int(rougeFrame)*2*rougePoseRows+gl_VertexID/w);
    posedPosition=texelFetch(rougePoses,at,0).xyz;
    posedNormal=texelFetch(rougePoses,at+ivec2(0,rougePoseRows),0).xyz;
  }
  rougePigment = mix(rougeBaseColor, rougeCountry*0.68+rougeBaseColor*0.25, rougeTint);
  rougeEmission = rougeGlow;
  // The placket is rigid on the chest; offset to match the skinned coat’s
  // underlying rest space so the projected X is continuous across the seam.
  rougeFabricPoint = position;
  if(rougeFabricId > 2.5) rougeFabricPoint.y += 0.29;
  rougeFabricKind = rougeFabricId > 2.5 ? 1.0 : rougeFabricId;
  rougeArmbandColor = mix(vec3(0.094, 0.224, 0.4), rougeCountry*0.68+vec3(0.094, 0.224, 0.4)*0.25, 0.87);
`;

export class InfantryBatch {
  private asset:InfantryAsset|null=null;
  private mesh:THREE.InstancedMesh|null=null;
  private texture:THREE.DataTexture|null=null;
  private poses?:ReturnType<typeof vertexPoses>;
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
  idling=0;
  constructor(private readonly scene:THREE.Scene,private readonly invalidate:()=>void){}
  request(){
    if(this.started||this.disposed)return;this.started=true;
    void getModel().then(asset=>{
      if(this.disposed)return;
      this.asset=asset;
      const poses=vertexPoses(asset);
      this.poses=poses;this.texture=poses.texture;
      this.material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.95});
      this.material.onBeforeCompile=shader=>{
        shader.uniforms.rougePoses={value:this.texture};
        shader.uniforms.rougePoseRows={value:poses.rows};
        shader.uniforms.rougeIdleFrame={value:asset.idleFrame};
        shader.vertexShader=vertexHeader+shader.vertexShader
          .replace('#include <beginnormal_vertex>',transform+'\nvec3 objectNormal = normalize(posedNormal);')
          .replace('#include <begin_vertex>','vec3 transformed = posedPosition;')
          // Infantry instances have a uniform positive scale and a yaw rotation.
          // The fragment shader normalizes again after interpolation.
          .replace('#include <defaultnormal_vertex>','vec3 transformedNormal=normalMatrix*(mat3(instanceMatrix)*objectNormal);');
        shader.fragmentShader=infantryFabricShader+shader.fragmentShader
          .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb *= rougeFabricPigment();')
          .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += rougePigment * rougeEmission * 3.0;');
      };
      this.material.customProgramCacheKey=()=> 'rouge-baked-infantry-fabric';
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
    geometry.setAttribute('rougeFabricId',new THREE.BufferAttribute(asset.fabric,1));
    geometry.setAttribute('rougeTint',new THREE.BufferAttribute(asset.tint,1,true));
    geometry.setAttribute('rougeGlow',new THREE.BufferAttribute(asset.glow,1,true));
    geometry.setAttribute('rougeIdlePosition',this.poses!.idlePosition);
    geometry.setAttribute('rougeIdleNormal',this.poses!.idleNormal);
    this.poseFrames=new THREE.InstancedBufferAttribute(new Float32Array(this.capacity),1).setUsage(THREE.DynamicDrawUsage);
    this.country=new THREE.InstancedBufferAttribute(new Float32Array(this.capacity*3),3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('rougeFrame',this.poseFrames);geometry.setAttribute('rougeCountry',this.country);
    const next=new THREE.InstancedMesh(geometry,this.material!,this.capacity);layerMapEntity(next,this.material!);
    next.name='Rouge infantry batch';next.count=0;next.frustumCulled=false;next.instanceMatrix.setUsage(THREE.DynamicDrawUsage);next.visible=false;
    this.mesh=next;this.scene.add(next);
  }
  begin(visible:boolean,required:number){
    this.count=this.walking=this.shooting=this.idling=0;
    if(!this.ready)return;
    if(visible&&required>this.capacity){while(required>this.capacity)this.capacity*=2;this.rebuild();}
    this.mesh!.visible=visible;
  }
  add(matrix:THREE.Matrix4,color:THREE.Color,move:number,shot:number,id:number){
    const asset=this.asset!,i=this.count++,pose=infantryPose(move,shot,id,asset.fps,asset.walkFrames,asset.shootFrames,asset.idleFrame);
    if(pose.mode==='shoot')this.shooting++;
    else if(pose.mode==='walk')this.walking++;
    else this.idling++;
    this.mesh!.setMatrixAt(i,matrix);this.country!.setXYZ(i,color.r,color.g,color.b);
    this.poseFrames!.setX(i,pose.frame);
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
