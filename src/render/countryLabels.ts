import {nearestWorldX,wrapX,WORLD_WIDTH} from '../game/geo.ts';
import type {ProvinceDef,Vec2} from '../game/types.ts';
export interface CountryLabel {owner:number;area:number;anchor:Vec2}
interface LandMoment {area:number;center:Vec2;left:number;right:number}
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
 const origin=points[0];let twiceArea=0,mx=0,mz=0,left=Infinity,right=-Infinity;
 for(let i=0,j=points.length-1;i<points.length;j=i++){
  const a={x:points[j].x-origin.x,z:points[j].z-origin.z},b={x:points[i].x-origin.x,z:points[i].z-origin.z},cross=a.x*b.z-b.x*a.z;
  twiceArea+=cross;mx+=(a.x+b.x)*cross;mz+=(a.z+b.z)*cross;left=Math.min(left,points[i].x);right=Math.max(right,points[i].x);
 }
 if(Math.abs(twiceArea)<1e-9)return null;
 return {area:Math.abs(twiceArea)/2,center:{x:origin.x+mx/(3*twiceArea),z:origin.z+mz/(3*twiceArea)},left,right};
}
/** Cache immutable geometry once per atlas. All islands and original geometry
 * contribute, including cropped/offscreen land. Holes subtract regardless of winding. */
export function regionMoments(map:readonly ProvinceDef[]):RegionMoments{
 return map.map(province=>province.parts.flatMap(part=>{
  const outer=ringMoment(part[0]??[]);if(!outer)return [];
  let area=outer.area,mx=0,mz=0;
  for(const ring of part.slice(1)){
   const hole=ringMoment(ring);if(!hole)continue;
   area-=hole.area;mx-=(nearestWorldX(hole.center.x,outer.center.x)-outer.center.x)*hole.area;mz-=(hole.center.z-outer.center.z)*hole.area;
  }
  return area>1e-9?[{area,center:{x:outer.center.x+mx/area,z:outer.center.z+mz/area},left:outer.left,right:outer.right}]:[];
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
  if(area>1e-9)labels.push({owner,area,anchor:{x:wrapX(mx/area),z:mz/area}});
 }
 return labels.sort((a,b)=>b.area-a.area||a.owner-b.owner);
}

export const COUNTRY_LABEL_FONT='"Palatino Linotype","Book Antiqua",Georgia,"Noto Serif CJK SC","Songti SC","SimSun",serif';
/** Restrained engraved-atlas typography: large realms read first; long names
 * stay compact without truncation, viewport-driven hiding, or anchor movement. */
export function countryTypography(name:string,area:number,scale:number):{font:number;spacing:number}{
 const length=Array.from(name).length,cjk=/[\u3400-\u9fff]/u.test(name),compact=Math.min(1,Math.sqrt((cjk?7:18)/Math.max(1,length)));
 return {font:Math.round(Math.min(24,Math.max(13,(14+Math.sqrt(area)*scale/32)*compact))),spacing:cjk?(length>8?.06:.12):.1};
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
