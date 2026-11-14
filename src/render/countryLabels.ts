import {nearestWorldX,wrapX,WORLD_WIDTH} from '../game/geo.ts';
import type {ProvinceDef,Vec2} from '../game/types.ts';
export interface CountryLabel {owner:number;area:number;anchor:Vec2;angle:number}
interface LandMoment {area:number;center:Vec2;left:number;right:number;xx:number;xz:number;zz:number}
export type RegionMoments=readonly (readonly LandMoment[])[];
export interface LabelRect {left:number;right:number;top:number;bottom:number}
export function overlaps(a:LabelRect,b:LabelRect,gap=6):boolean{return a.left<b.right+gap&&a.right>b.left-gap&&a.top<b.bottom+gap&&a.bottom>b.top-gap;}

/** Exact planar polygon moments in the map's Miller x/z coordinates, not
 * longitude/latitude or the province's navigation point. Unwrap each ring before
 * shoelace integration; translating to its first vertex avoids cancellation. */
function ringMoment(ring:readonly Vec2[]):LandMoment|null{
 if(ring.length<3)return null;
 const points:Vec2[]=[];let previous=ring[0].x;
 for(const point of ring){const x=nearestWorldX(point.x,previous);points.push({x,z:point.z});previous=x;}
 const origin=points[0];let twiceArea=0,mx=0,mz=0,qxx=0,qxz=0,qzz=0,left=Infinity,right=-Infinity;
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a={x:points[j].x-origin.x,z:points[j].z-origin.z},b={x:points[i].x-origin.x,z:points[i].z-origin.z},cross=a.x*b.z-b.x*a.z;
  twiceArea+=cross;mx+=(a.x+b.x)*cross;mz+=(a.z+b.z)*cross;left=Math.min(left,points[i].x);right=Math.max(right,points[i].x);
  qxx+=(a.x*a.x+a.x*b.x+b.x*b.x)*cross;qzz+=(a.z*a.z+a.z*b.z+b.z*b.z)*cross;
  qxz+=(2*a.x*a.z+a.x*b.z+b.x*a.z+2*b.x*b.z)*cross;
 }
 if(Math.abs(twiceArea)<1e-9)return null;
 const x=mx/(3*twiceArea),z=mz/(3*twiceArea);
 return {area:Math.abs(twiceArea)/2,center:{x:origin.x+x,z:origin.z+z},left,right,
  xx:Math.max(0,qxx/(6*twiceArea)-x*x),xz:qxz/(12*twiceArea)-x*z,zz:Math.max(0,qzz/(6*twiceArea)-z*z)};
}
/** Cache immutable geometry once per atlas. All islands and original geometry
 * contribute, including cropped/offscreen land. Holes subtract regardless of winding. */
export function regionMoments(map:readonly ProvinceDef[]):RegionMoments{
 return map.map(province=>province.parts.flatMap(part=>{
  const outer=ringMoment(part[0]??[]);if(!outer)return [];
  let area=outer.area,mx=0,mz=0,qxx=outer.xx*outer.area,qxz=outer.xz*outer.area,qzz=outer.zz*outer.area;
  for(const ring of part.slice(1)){
   const hole=ringMoment(ring);if(!hole)continue;
   const x=nearestWorldX(hole.center.x,outer.center.x)-outer.center.x,z=hole.center.z-outer.center.z;
   area-=hole.area;mx-=x*hole.area;mz-=z*hole.area;
   qxx-=(hole.xx+x*x)*hole.area;qxz-=(hole.xz+x*z)*hole.area;qzz-=(hole.zz+z*z)*hole.area;
  }
  return area>1e-9?[{area,center:{x:outer.center.x+mx/area,z:outer.center.z+mz/area},left:outer.left,right:outer.right,
   xx:Math.max(0,qxx/area-(mx/area)**2),xz:qxz/area-mx*mz/(area*area),zz:Math.max(0,qzz/area-(mz/area)**2)}]:[];
 }));
}
/** Choose a camera-independent longitude cut through the largest empty gap.
 * This puts separated islands on one shared sheet across the date line, rather
 * than averaging +179 and -179 into Greenwich. Ties use the canonical order. */
function longitudeCut(parts:readonly LandMoment[]):number{
 const intervals:[number,number][]=[];
 for(const part of parts){
  const width=part.right-part.left;if(width>=WORLD_WIDTH)return -WORLD_WIDTH/2;
  const left=wrapX(part.left)+WORLD_WIDTH/2,right=left+width;
  if(right<=WORLD_WIDTH)intervals.push([left,right]);else intervals.push([left,WORLD_WIDTH],[0,right-WORLD_WIDTH]);
 }
 intervals.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const merged:[number,number][]=[];
 for(const interval of intervals){const last=merged[merged.length-1];if(last&&interval[0]<=last[1])last[1]=Math.max(last[1],interval[1]);else merged.push([...interval]);}
 let gap=-1,cut=0;
 for(let i=0;i<merged.length;i++){
  const end=merged[i][1],next=merged[(i+1)%merged.length][0]+(i===merged.length-1?WORLD_WIDTH:0),size=next-end;
  if(size>gap){gap=size;cut=(end+size/2)%WORLD_WIDTH;}
 }
 return cut-WORLD_WIDTH/2;
}
/** One area-weighted geometric centroid of ALL currently owned territory per
 * country, disconnected possessions included. A centroid over water or inside
 * a hole stays there: never snap to a province or a largest connected component.
 * Rebuild on ownership/campaign changes only; camera/UI changes just project it. */
export function buildCountryLabels(map:readonly ProvinceDef[],owners:readonly number[],geometry:RegionMoments=regionMoments(map)):CountryLabel[]{
 const countries=new Map<number,LandMoment[]>();
 for(const province of map){
  const owner=owners[province.id];if(owner===undefined||owner<0)continue;
  const parts=countries.get(owner)??[];parts.push(...geometry[province.id]);countries.set(owner,parts);
 }
 const labels:CountryLabel[]=[];
 for(const [owner,parts] of countries){
  if(!parts.length)continue;
  const reference=longitudeCut(parts)+WORLD_WIDTH/2;let area=0,mx=0,mz=0;
  for(const part of parts){area+=part.area;mx+=nearestWorldX(part.center.x,reference)*part.area;mz+=part.center.z*part.area;}
  if(area>1e-9){
   const x=mx/area,z=mz/area;let xx=0,xz=0,zz=0;
   for(const part of parts){const dx=nearestWorldX(part.center.x,reference)-x,dz=part.center.z-z;
    xx+=(part.xx+dx*dx)*part.area;xz+=(part.xz+dx*dz)*part.area;zz+=(part.zz+dz*dz)*part.area;
   }
   // A long realm reads along its principal land axis. Nearly round realms
   // stay horizontal; quantization keeps insignificant geometry noise still.
   const elongated=Math.hypot(xx-zz,2*xz)>.4*(xx+zz);
   const angle=elongated?Math.round(Math.max(-75,Math.min(75,Math.atan2(2*xz,xx-zz)*90/Math.PI))*2)/2:0;
   labels.push({owner,area,anchor:{x:wrapX(x),z},angle});
  }
 }
 return labels.sort((a,b)=>b.area-a.area||a.owner-b.owner);
}

export const COUNTRY_LABEL_FONT='"ROUGE Country Serif","Noto Serif SC","Songti SC","STSong","SimSun",serif';
/** Tighten tracking for long names; their size is set by the world-space curve. */
export function countryLetterSpacing(name:string):number{
 const length=Array.from(name).length,cjk=/[\u3400-\u9fff]/u.test(name);
 return cjk?(length>8?.1:.14):(length>24?.12:.14);
}

/** Screen-space bucket index keeps dense army/HUD collision work bounded. */
export class LabelCollisionIndex {
 private buckets=new Map<string,LabelRect[]>();
 private keys(rect:LabelRect):string[]{const keys:string[]=[];for(let x=Math.floor(rect.left/64);x<=Math.floor(rect.right/64);x++)for(let y=Math.floor(rect.top/64);y<=Math.floor(rect.bottom/64);y++)keys.push(`${x}:${y}`);return keys;}
 add(rect:LabelRect):void{for(const key of this.keys(rect)){const bucket=this.buckets.get(key)??[];bucket.push(rect);this.buckets.set(key,bucket);}}
 collides(rect:LabelRect,gap=8):boolean{for(const key of this.keys({left:rect.left-gap,right:rect.right+gap,top:rect.top-gap,bottom:rect.bottom+gap}))if(this.buckets.get(key)?.some(other=>overlaps(rect,other,gap)))return true;return false;}
}

/** Partial text stays visible, including when its anchor is outside the screen. */
export function labelIntersectsViewport(rect:LabelRect,width:number,height:number):boolean{
 return rect.right>=0&&rect.left<=width&&rect.bottom>=0&&rect.top<=height;
}

/** Preserve the original province-name zoom range; country names are separate. */
export function provinceNamesVisible(distance:number):boolean{return distance<500;}
