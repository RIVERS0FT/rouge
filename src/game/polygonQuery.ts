import type {Vec2} from './types.ts';

/** Exact ray crossings, indexed by height. Keep the original arithmetic and
 * edge order; the index only omits edges that cannot cross this scanline. */
export interface RingQuery {left:number;right:number;top:number;bottom:number;step:number;coordinates:Float64Array;offsets:Uint32Array;edges:Uint32Array}
export function prepareRing(points:readonly Vec2[]):RingQuery {
 let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
 for(const p of points){left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.min(top,p.z);bottom=Math.max(bottom,p.z);}
 const bands=Math.max(1,Math.min(256,Math.ceil((bottom-top)/2))),step=(bottom-top)/bands||1;
 const coordinates=new Float64Array(points.length*5),counts=new Uint32Array(bands+1);
 const range=(a:number,b:number)=>[Math.max(0,Math.min(bands-1,Math.floor((Math.min(a,b)-top)/step))),Math.max(0,Math.min(bands-1,Math.floor((Math.max(a,b)-top)/step)))];
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j],offset=i*5;coordinates.set([a.x,a.z,b.x-a.x,b.z-a.z,b.z],offset);
  if(a.z===b.z)continue;const [lo,hi]=range(a.z,b.z);for(let k=lo;k<=hi;k++)counts[k+1]++;
 }
 for(let k=1;k<counts.length;k++)counts[k]+=counts[k-1];
 const edges=new Uint32Array(counts.at(-1)!),cursor=counts.slice();
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a=points[i],b=points[j];if(a.z===b.z)continue;const [lo,hi]=range(a.z,b.z);for(let k=lo;k<=hi;k++)edges[cursor[k]++]=i*5;
 }
 return{left,right,top,bottom,step,coordinates,offsets:counts,edges};
}
export function ringContains(r:RingQuery,x:number,z:number):boolean {
 if(z<r.top||z>r.bottom||!Number.isFinite(x)||!Number.isFinite(z))return false;
 const band=Math.min(r.offsets.length-2,Math.floor((z-r.top)/r.step)),a=r.coordinates;let inside=false;
 for(let i=r.offsets[band];i<r.offsets[band+1];i++){
  const k=r.edges[i],az=a[k+1],dz=a[k+3];
  if((az>z)!==(a[k+4]>z)&&x<a[k+2]*(z-az)/dz+a[k])inside=!inside;
 }
 return inside;
}
