import {MAP, BOUNDS, provinceAt} from './map.ts';
import type {Vec2} from './types.ts';
type Edge={a:Vec2;b:Vec2};
const SIZE=12,buckets=new Map<string,Edge[]>();
// Include every retained island and hole, not only the navigation mainland.
for(const p of MAP)for(const part of p.parts)for(const ring of part)for(let i=0;i<ring.length;i++){
 const a=ring[i],b=ring[(i+1)%ring.length],edge={a,b};
 for(let x=Math.floor(Math.min(a.x,b.x)/SIZE);x<=Math.floor(Math.max(a.x,b.x)/SIZE);x++)
 for(let z=Math.floor(Math.min(a.z,b.z)/SIZE);z<=Math.floor(Math.max(a.z,b.z)/SIZE);z++){
  const key=`${x}:${z}`,list=buckets.get(key)??[];list.push(edge);buckets.set(key,list);
 }
}
const cross=(a:Vec2,b:Vec2,c:Vec2)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
function intersects(a:Vec2,b:Vec2,c:Vec2,d:Vec2):boolean{
 if(Math.max(a.x,b.x)<Math.min(c.x,d.x)-1e-9||Math.min(a.x,b.x)>Math.max(c.x,d.x)+1e-9||Math.max(a.z,b.z)<Math.min(c.z,d.z)-1e-9||Math.min(a.z,b.z)>Math.max(c.z,d.z)+1e-9)return false;
 return cross(a,b,c)*cross(a,b,d)<=1e-12&&cross(c,d,a)*cross(c,d,b)<=1e-12;
}
export function waterPoint(p:Vec2):boolean{
 return Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.x>BOUNDS.left&&p.x<BOUNDS.right&&p.z>BOUNDS.top&&p.z<BOUNDS.bottom&&provinceAt(p.x,p.z)<0;
}
/** Exact polygon-edge test: sampling alone can miss thin islands and peninsulas. */
export function waterSegment(a:Vec2,b:Vec2):boolean{
 if(!waterPoint(a)||!waterPoint(b))return false;
 const seen=new Set<Edge>();
 for(let x=Math.floor(Math.min(a.x,b.x)/SIZE);x<=Math.floor(Math.max(a.x,b.x)/SIZE);x++)
 for(let z=Math.floor(Math.min(a.z,b.z)/SIZE);z<=Math.floor(Math.max(a.z,b.z)/SIZE);z++)for(const e of buckets.get(`${x}:${z}`)??[]){
  if(seen.has(e))continue;seen.add(e);if(intersects(a,b,e.a,e.b))return false;
 }
 return true;
}
/** The tiny embark/disembark crossing may intersect coast only at its declared
 * shore point. This rejects stepping across another sliver/island before water. */
export function coastSegment(land:Vec2,sea:Vec2,shore:Vec2):boolean{
 if(!waterPoint(sea)||provinceAt(land.x,land.z)<0)return false;
 const seen=new Set<Edge>();let found=false;
 for(let x=Math.floor(Math.min(land.x,sea.x)/SIZE);x<=Math.floor(Math.max(land.x,sea.x)/SIZE);x++)
 for(let z=Math.floor(Math.min(land.z,sea.z)/SIZE);z<=Math.floor(Math.max(land.z,sea.z)/SIZE);z++)for(const e of buckets.get(`${x}:${z}`)??[]){
  if(seen.has(e))continue;seen.add(e);if(!intersects(land,sea,e.a,e.b))continue;found=true;
  if(Math.abs(cross(e.a,e.b,shore))>1e-7||shore.x<Math.min(e.a.x,e.b.x)-1e-8||shore.x>Math.max(e.a.x,e.b.x)+1e-8||shore.z<Math.min(e.a.z,e.b.z)-1e-8||shore.z>Math.max(e.a.z,e.b.z)+1e-8)return false;
 }
 return found;
}
