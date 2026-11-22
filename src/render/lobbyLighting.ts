import * as THREE from 'three';

export type CameraFrame=[number,number,number,number];
/** Written by scripts/export-lobby.py into the camera extras. The lightmap holds everything the
 * Cycles lights, world and windows contribute except direct sunlight, which is rendered live. */
export type RoomLighting={intensity:number;sunDirection:[number,number,number];sunColor:[number,number,number];sunStrength:number};
const lightmapUrl=new URL('../assets/lobby/war-room-lightmap.webp',import.meta.url).href;

export function positionCamera(camera:THREE.PerspectiveCamera,home:THREE.Vector3,orientation:THREE.Quaternion,pivot:THREE.Vector3,yaw:number){
 const turn=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);
 camera.position.copy(home).sub(pivot).applyQuaternion(turn).add(pivot);
 camera.quaternion.copy(turn).multiply(orientation);camera.updateMatrixWorld();
}

export async function loadLightmap(){
 const map=await new THREE.TextureLoader().loadAsync(lightmapUrl);
 // glTF orientation on the second UV set; islands sit a few texels apart, so no mipmaps to bleed.
 map.colorSpace=THREE.SRGBColorSpace;map.flipY=false;map.channel=1;
 map.generateMipmaps=false;map.minFilter=THREE.LinearFilter;
 return map;
}

/** The lightmap already holds every light but the sun on the room, so the room takes only the
 * sun from the live lights (the rest are the officers' studio lighting) and only reflections
 * from the environment; the officers keep everything. */
const sunOnly=['POINT','SPOT','RECT_AREA','HEMI'].reduce((chunk,kind)=>chunk.replace(`( NUM_${kind}_LIGHTS > 0 )`,'( 0 > 0 )'),THREE.ShaderChunk.lights_fragment_begin);
const reflectionsOnly=THREE.ShaderChunk.lights_fragment_maps.replace('iblIrradiance += getIBLIrradiance( geometryNormal );','');
export function lightRoom(room:THREE.Object3D,lightmap:THREE.Texture,lighting:RoomLighting){
 room.traverse(obj=>{
  if(!(obj instanceof THREE.Mesh))return;
  const material=obj.material as THREE.MeshStandardMaterial;
  material.lightMap=lightmap;material.lightMapIntensity=lighting.intensity;
  material.onBeforeCompile=shader=>{
   shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',sunOnly)
    .replace('#include <lights_fragment_maps>',reflectionsOnly);
  };
 });
}

/** Turn and size the sun's shadow camera to cover the room from the authored direction. */
export function placeSun(sun:THREE.DirectionalLight,room:THREE.Object3D,lighting:RoomLighting){
 const bounds=new THREE.Box3().setFromObject(room),centre=bounds.getCenter(new THREE.Vector3());
 const direction=new THREE.Vector3(...lighting.sunDirection).normalize(),reach=bounds.getSize(new THREE.Vector3()).length();
 sun.color.setRGB(...lighting.sunColor,THREE.LinearSRGBColorSpace);sun.intensity=lighting.sunStrength;
 sun.target.position.copy(centre);sun.position.copy(centre).addScaledVector(direction,-reach);
 sun.updateMatrixWorld();sun.target.updateMatrixWorld();
 const camera=sun.shadow.camera;camera.position.copy(sun.position);camera.lookAt(centre);camera.updateMatrixWorld();
 const box=new THREE.Box3();
 for(let i=0;i<8;i++)box.expandByPoint(new THREE.Vector3(i&1?bounds.max.x:bounds.min.x,i&2?bounds.max.y:bounds.min.y,i&4?bounds.max.z:bounds.min.z).applyMatrix4(camera.matrixWorldInverse));
 Object.assign(camera,{left:box.min.x,right:box.max.x,bottom:box.min.y,top:box.max.y,near:Math.max(.1,-box.max.z),far:-box.min.z});
 camera.updateProjectionMatrix();
}
