import * as THREE from 'three';
import type {ScreenPoint} from './dispatchRibbon.ts';

export interface ArrowProjection {
 /** Screen coordinates of the ground plane under an untilted camera. */
 affine?:readonly [number,number,number,number,number,number];
 mayIntersect?(left:number,top:number,right:number,bottom:number):boolean;
 point(point:ScreenPoint):ScreenPoint|null;
 polygon(points:readonly ScreenPoint[]):ScreenPoint[];
}

/** Take arrow coordinates as world X/Z on the map plane, exactly like terrain.
 * Clip against camera depth before division so paths never flip over the horizon. */
export function groundArrowProjection(camera:THREE.Camera,width:number,height:number,landY:number):ArrowProjection {
 const matrix=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
 const clip=(p:ScreenPoint)=>new THREE.Vector4(p.x,landY,p.y,1).applyMatrix4(matrix);
 const screen=(p:THREE.Vector4)=>({x:(1+p.x/p.w)*width/2,y:(1-p.y/p.w)*height/2});
 const e=matrix.elements,origin=clip({x:0,y:0});
 // On the ground plane each clip distance is linear in world X/Z. Its
 // maximum on a rectangle is at a corner, including in perspective.
 const planes=[0,1,2].flatMap(row=>[1,-1].map(sign=>{
  const x=e[3]+sign*e[row],z=e[11]+sign*e[8+row];
  return {x,z,constant:origin.w+sign*origin.getComponent(row)};
 }));
 // lookAt uses a tiny tilt if camera.up is collinear. Only use the affine
 // path when every point of the ground plane has the same camera depth.
 const affine=Math.max(Math.abs(e[3]),Math.abs(e[11]),Math.abs(e[2]),Math.abs(e[10]))<1e-14&&origin.w>0&&Math.abs(origin.z)<origin.w-1e-8
  ? [e[0]*width/(2*origin.w),-e[1]*height/(2*origin.w),e[8]*width/(2*origin.w),-e[9]*height/(2*origin.w),screen(origin).x,screen(origin).y] as const:undefined;
 const flat=affine?(p:ScreenPoint)=>({x:affine[0]*p.x+affine[2]*p.y+affine[4],y:affine[1]*p.x+affine[3]*p.y+affine[5]}):undefined;
 return {
  affine,
  mayIntersect(left,top,right,bottom){
   for(const p of planes)if(p.x*(p.x>=0?right:left)+p.z*(p.z>=0?bottom:top)+p.constant < -1e-7)return false;
   return true;
  },
  point(point){if(flat)return flat(point);const p=clip(point);return p.w>0&&p.z>=-p.w&&p.z<=p.w?screen(p):null;},
  polygon(points){
   if(flat)return points.map(flat);
   let vertices=points.map(clip);
   // Most visible routes fit entirely between the clipping planes. Only
   // allocate the two clipped rings for routes which actually cross them.
   if(vertices.every(p=>p.w>0&&p.z>=-p.w&&p.z<=p.w))return vertices.map(screen);
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
