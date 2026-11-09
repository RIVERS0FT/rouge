import type { Vec2 } from './types.ts';

export interface Rect { left:number; right:number; top:number; bottom:number }
const EPS = 1e-9;
export function inRect(p:Vec2, r:Rect):boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.z)
    && p.x >= r.left && p.x <= r.right && p.z >= r.top && p.z <= r.bottom;
}
export function intersectBounds(a:Rect, b:Rect):Rect|null {
  const r={left:Math.max(a.left,b.left),right:Math.min(a.right,b.right),top:Math.max(a.top,b.top),bottom:Math.min(a.bottom,b.bottom)};
  return r.right-r.left>EPS && r.bottom-r.top>EPS ? r : null;
}
/** Liang–Barsky clipping. A point contact is not a traversable shared border. */
export function clipSegment(a:Vec2, b:Vec2, r:Rect):[Vec2,Vec2]|null {
  const dx=b.x-a.x,dz=b.z-a.z;let lo=0,hi=1;
  for(const [p,q] of [[-dx,a.x-r.left],[dx,r.right-a.x],[-dz,a.z-r.top],[dz,r.bottom-a.z]]) {
    if(Math.abs(p)<EPS){if(q<0)return null;continue;}
    const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
    if(hi<lo)return null;
  }
  if((hi-lo)*Math.hypot(dx,dz)<EPS)return null;
  const at=(t:number):Vec2=>({x:Math.max(r.left,Math.min(r.right,a.x+t*dx)),z:Math.max(r.top,Math.min(r.bottom,a.z+t*dz))});
  return [at(lo),at(hi)];
}
/** Clip AFTER hole-aware triangulation. Each input is convex, so disconnected
 * concave lobes and holes cannot acquire fake bridges along the crop boundary.
 * Do not use a single Sutherland–Hodgman ring on an arbitrary concave province.
 */
export function clipTriangle(triangle:readonly Vec2[],r:Rect):Vec2[] {
  let points=[...triangle];
  const planes:[keyof Vec2,number,boolean][]=[['x',r.left,true],['x',r.right,false],['z',r.top,true],['z',r.bottom,false]];
  for(const [axis,edge,min] of planes) {
    const next:Vec2[]=[];
    for(let i=0;i<points.length;i++) {
      const a=points[i],b=points[(i+1)%points.length],ai=min?a[axis]>=edge:a[axis]<=edge,bi=min?b[axis]>=edge:b[axis]<=edge;
      if(ai)next.push(a);
      if(ai!==bi){const t=(edge-a[axis])/(b[axis]-a[axis]);const p={x:a.x+t*(b.x-a.x),z:a.z+t*(b.z-a.z)};p[axis]=edge;next.push(p);}
    }
    points=next;if(!points.length)break;
  }
  return Math.abs(signedArea(points))>EPS?points:[];
}
export function signedArea(ring:readonly Vec2[]):number {
  let area=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++)area+=ring[j].x*ring[i].z-ring[i].x*ring[j].z;
  return area/2;
}
/** Even/odd scanline intersection of a valid exterior plus non-overlapping holes. */
export function landSpans(part:Vec2[][],z:number,r:Rect):[number,number][] {
  const crossings:number[]=[];
  for(const ring of part)for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if((a.z>z)!==(b.z>z))crossings.push(a.x+(b.x-a.x)*(z-a.z)/(b.z-a.z));
  }
  crossings.sort((a,b)=>a-b);const spans:[number,number][]=[];
  for(let i=0;i+1<crossings.length;i+=2) {
    const left=Math.max(r.left,crossings[i]),right=Math.min(r.right,crossings[i+1]);
    if(right-left>EPS)spans.push([left,right]);
  }
  return spans;
}
/** Positive-area visible intersection and an interior label/spawn anchor.
 * Between vertex/intersection levels each scanline width is linear: midpoint
 * integration is exact for the polygonal input. Source rings are never mutated.
 */
export function visiblePart(part:Vec2[][],r:Rect):{area:number;anchor:Vec2}|null {
  const levels=new Set<number>([r.top,r.bottom]);
  for(const ring of part)for(let i=0;i<ring.length;i++) {
    const a=ring[i],b=ring[(i+1)%ring.length];if(a.z>r.top&&a.z<r.bottom)levels.add(a.z);
    if(a.x!==b.x)for(const x of [r.left,r.right]) {
      const t=(x-a.x)/(b.x-a.x),z=a.z+t*(b.z-a.z);
      if(t>0&&t<1&&z>r.top&&z<r.bottom)levels.add(z);
    }
  }
  const sorted=[...levels].sort((a,b)=>a-b);let area=0,score=-1,anchor:Vec2|undefined;
  for(let i=1;i<sorted.length;i++) {
    const dz=sorted[i]-sorted[i-1];if(dz<EPS)continue;const z=(sorted[i]+sorted[i-1])/2;
    for(const [left,right] of landSpans(part,z,r)) {
      area+=(right-left)*dz;const s=Math.min((right-left)/2,dz/2);
      if(s>score){score=s;anchor={x:(left+right)/2,z};}
    }
  }
  return area>EPS&&anchor?{area,anchor}:null;
}
