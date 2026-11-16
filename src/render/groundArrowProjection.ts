import * as THREE from 'three';
import type {ScreenPoint} from './dispatchRibbon.ts';

export interface ArrowProjection {
 point(point:ScreenPoint):ScreenPoint|null;
 polygon(points:readonly ScreenPoint[]):ScreenPoint[];
}

/** Take arrow coordinates as world X/Z on the map plane, exactly like terrain.
 * Clip against camera depth before division so paths never flip over the horizon. */
export function groundArrowProjection(camera:THREE.Camera,width:number,height:number,landY:number):ArrowProjection {
 const matrix=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
 const clip=(p:ScreenPoint)=>new THREE.Vector4(p.x,landY,p.y,1).applyMatrix4(matrix);
 const screen=(p:THREE.Vector4)=>({x:(1+p.x/p.w)*width/2,y:(1-p.y/p.w)*height/2});
 return {
  point(point){const p=clip(point);return p.w>0&&p.z>=-p.w&&p.z<=p.w?screen(p):null;},
  polygon(points){
   let vertices=points.map(clip);
   for(const depth of [(p:THREE.Vector4)=>p.z+p.w,(p:THREE.Vector4)=>p.w-p.z]){
    const next:THREE.Vector4[]=[];
    for(let i=0;i<vertices.length;i++){
     const a=vertices[i],b=vertices[(i+1)%vertices.length],da=depth(a),db=depth(b);
     if(da>=0)next.push(a);
     if((da>=0)!==(db>=0))next.push(a.clone().lerp(b,da/(da-db)));
    }
    vertices=next;
   }
   return vertices.filter(p=>p.w>0).map(screen);
  },
 };
}
