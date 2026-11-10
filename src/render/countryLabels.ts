import {signedArea} from '../game/crop.ts';
import {nearestWorldX} from '../game/geo.ts';
import type {ProvinceDef} from '../game/types.ts';
export const COUNTRY_LABEL_LIMIT=32;
export interface CountryComponent {owner:number;area:number;anchors:number[]}
export interface LabelRect {left:number;right:number;top:number;bottom:number}
export function overlaps(a:LabelRect,b:LabelRect,gap=6):boolean{return a.left<b.right+gap&&a.right>b.left-gap&&a.top<b.bottom+gap&&a.bottom>b.top-gap;}
export function regionAreas(map:readonly ProvinceDef[]):number[]{
 return map.map(p=>p.parts.reduce((sum,part)=>sum+Math.max(0,Math.abs(signedArea(part[0]))-part.slice(1).reduce((n,h)=>n+Math.abs(signedArea(h)),0)),0));
}
/** Rebuild only on ownership/campaign changes. Neutral land never becomes a
 * country. Use actual adjacency, and an interior region anchor rather than a
 * centroid that could lie in an enemy enclave, a lake or the ocean. */
export function buildCountryComponents(map:readonly ProvinceDef[],owners:readonly number[],areas=regionAreas(map)):CountryComponent[]{
 const seen=new Set<number>(),result:CountryComponent[]=[];
 for(const first of map){
  const owner=owners[first.id];if(owner===undefined||owner<0||!first.visible||seen.has(first.id))continue;
  const ids=[first.id];seen.add(first.id);
  for(let i=0;i<ids.length;i++)for(const id of map[ids[i]].neighbors){if(!seen.has(id)&&map[id]?.visible&&owners[id]===owner){seen.add(id);ids.push(id);}}
  const origin=first.center.x,area=ids.reduce((n,id)=>n+areas[id],0);
  const x=ids.reduce((n,id)=>n+nearestWorldX(map[id].center.x,origin)*areas[id],0)/(area||1),z=ids.reduce((n,id)=>n+map[id].center.z*areas[id],0)/(area||1);
  ids.sort((a,b)=>{
   const score=(id:number)=>Math.hypot(nearestWorldX(map[id].center.x,origin)-x,map[id].center.z-z)/Math.max(1,Math.sqrt(areas[id]));
   return score(a)-score(b)||a-b;
  });
  // Retain all region anchors so a large country still gets a label when its
  // center is outside the viewport. Per-frame placement is bounded separately.
  result.push({owner,area,anchors:ids});
 }
 return result.sort((a,b)=>b.area-a.area||a.owner-b.owner||a.anchors[0]-b.anchors[0]);
}

/** Screen-space bucket index keeps dense army/HUD collision work bounded. */
export class LabelCollisionIndex {
 private buckets=new Map<string,LabelRect[]>();
 private keys(rect:LabelRect):string[]{const keys:string[]=[];for(let x=Math.floor(rect.left/64);x<=Math.floor(rect.right/64);x++)for(let y=Math.floor(rect.top/64);y<=Math.floor(rect.bottom/64);y++)keys.push(`${x}:${y}`);return keys;}
 add(rect:LabelRect):void{for(const key of this.keys(rect)){const bucket=this.buckets.get(key)??[];bucket.push(rect);this.buckets.set(key,bucket);}}
 collides(rect:LabelRect,gap=8):boolean{for(const key of this.keys({left:rect.left-gap,right:rect.right+gap,top:rect.top-gap,bottom:rect.bottom+gap}))if(this.buckets.get(key)?.some(other=>overlaps(rect,other,gap)))return true;return false;}
}
