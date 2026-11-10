import {clipSegment,type Rect} from '../game/crop.ts';
import type {Vec2} from '../game/types.ts';

export interface BorderRegion {id:number;code:string;visible:boolean;parts:Vec2[][][]}
export interface BorderEdge {a:Vec2;b:Vec2;atoms:number[]}
export type BorderKind='country'|'internal'|'coast'|'hidden';
export const COUNTRY_BORDER_WIDTH=2.2;
export const SELECTION_BORDER_WIDTH=3;
export const COUNTRY_BORDER_COLOR=0x303c35;
export function internalBorderOpacity(distance:number):number {return distance>1000?0.10:distance>300?0.16:0.23;}
const pointKey=(p:Vec2)=>`${p.x.toFixed(6)},${p.z.toFixed(6)}`;
/** Original ring segments only: clipping must not invent a boundary across sea or
 * a crop edge. Shared sides are indexed once, including reversed ring winding.
 * Vertical +/-180 edges in this atlas are polygon cut closures, not coastlines.
 * The repeated world supplies the continuous land on the other side. */
export function buildBorderEdges(regions:readonly BorderRegion[],bounds:Rect):BorderEdge[] {
 const edges=new Map<string,BorderEdge>();
 for(const region of regions)if(region.visible)for(const part of region.parts)for(const ring of part)for(let i=0;i<ring.length;i++){
  const segment=clipSegment(ring[i],ring[(i+1)%ring.length],bounds);if(!segment)continue;
  const[a,b]=segment;
  if(Math.abs(a.x-b.x)<1e-7&&(Math.abs(a.x-bounds.left)<1e-7||Math.abs(a.x-bounds.right)<1e-7))continue;
  const ka=pointKey(a),kb=pointKey(b);if(ka===kb)continue;
  const key=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`,edge=edges.get(key);
  if(edge){if(!edge.atoms.includes(region.id))edge.atoms.push(region.id);}
  else edges.set(key,{a,b,atoms:[region.id]});
 }
 return [...edges.values()];
}
/** Political identity comes only from live ownership, never real-world country
 * metadata or palette color. A neutral management territory is its own country;
 * complete atoms hidden inside that territory do not become new countries. */
export function classifyBorder(edge:BorderEdge,ownerIds:readonly number[],groupIds:readonly string[]):BorderKind {
 if(edge.atoms.length<2)return 'coast';
 const first=edge.atoms[0],owner=ownerIds[first]??-1,group=groupIds[first]??`atom:${first}`;
 let internal=false;
 for(const id of edge.atoms.slice(1)){
  const otherOwner=ownerIds[id]??-1,otherGroup=groupIds[id]??`atom:${id}`;
  if(owner!==otherOwner||(owner<0&&group!==otherGroup))return 'country';
  if(group!==otherGroup)internal=true;
 }
 return internal?'internal':'hidden';
}
export function borderPositions(edges:readonly BorderEdge[],height:number):number[]{
 const positions:number[]=[];for(const {a,b}of edges)positions.push(a.x,height,a.z,b.x,height,b.z);return positions;
}
