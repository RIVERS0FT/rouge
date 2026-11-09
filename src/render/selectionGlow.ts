import type {Vec2} from '../game/types.ts';
export const SELECTION_GLOW_WIDTH=2;
const cross=(a:Vec2,b:Vec2,p:Vec2)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
const bounds=(points:readonly Vec2[])=>({left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.z)),bottom:Math.max(...points.map(p=>p.z))});
/** Clip a land triangle to a convex CCW boundary strip. Every output point stays
 * in the original hole-aware, crop-clipped land triangle. */
function intersect(triangle:readonly Vec2[],strip:readonly Vec2[]):Vec2[]{
 let points=[...triangle];
 for(let j=0;j<strip.length&&points.length;j++){
  const a=strip[j],b=strip[(j+1)%strip.length],next:Vec2[]=[];
  for(let i=0;i<points.length;i++){
   const p=points[i],q=points[(i+1)%points.length],dp=cross(a,b,p),dq=cross(a,b,q),inside=dp>=0;
   if(inside)next.push(p);
   if(inside!==(dq>=0)){const t=dp/(dp-dq);next.push({x:p.x+(q.x-p.x)*t,z:p.z+(q.z-p.z)*t});}
  }
  points=next;
 }
 return points;
}
export function innerGlowMesh(triangles:readonly (readonly Vec2[])[],segments:readonly (readonly [Vec2,Vec2])[],width=SELECTION_GLOW_WIDTH):{points:Vec2[];distance:number[]}{
 const result:{points:Vec2[];distance:number[]}={points:[],distance:[]};
 if(!triangles.length||!Number.isFinite(width)||width<=0)return result;
 const boxes=triangles.map(bounds),extent={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
 for(const b of boxes){extent.left=Math.min(extent.left,b.left);extent.right=Math.max(extent.right,b.right);extent.top=Math.min(extent.top,b.top);extent.bottom=Math.max(extent.bottom,b.bottom);}
 const cell=Math.max(width*4,(extent.right-extent.left)/32,(extent.bottom-extent.top)/32),grid=new Map<string,number[]>();
 const cells=(b:ReturnType<typeof bounds>,visit:(key:string)=>void)=>{for(let x=Math.floor(b.left/cell);x<=Math.floor(b.right/cell);x++)for(let z=Math.floor(b.top/cell);z<=Math.floor(b.bottom/cell);z++)visit(`${x}:${z}`);};
 boxes.forEach((box,i)=>cells(box,key=>{const list=grid.get(key)??[];list.push(i);grid.set(key,list);}));
 for(const [a,b]of segments){
  const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(length<1e-8)continue;
  const nx=-dz/length*width,nz=dx/length*width;
  // Separate half-strips keep perpendicular distance affine inside every triangle;
  // interpolating only the original polygon vertices would light the entire face.
  for(const side of [1,-1]){
   const c={x:b.x+nx*side,z:b.z+nz*side},d={x:a.x+nx*side,z:a.z+nz*side};
   const strip=side===1?[a,b,c,d]:[b,a,d,c],box=bounds(strip),candidates=new Set<number>();
   cells(box,key=>{for(const i of grid.get(key)??[])candidates.add(i);});
   for(const i of candidates){
    const t=boxes[i];if(t.right<box.left||t.left>box.right||t.bottom<box.top||t.top>box.bottom)continue;
    const polygon=intersect(triangles[i],strip);
    for(let j=1;j+1<polygon.length;j++){
     const triangle=[polygon[0],polygon[j],polygon[j+1]];if(Math.abs(cross(...triangle as [Vec2,Vec2,Vec2]))<1e-10)continue;
     for(const p of triangle){result.points.push(p);result.distance.push(Math.min(width,Math.abs(cross(a,b,p))/length));}
    }
   }
  }
 }
 return result;
}
