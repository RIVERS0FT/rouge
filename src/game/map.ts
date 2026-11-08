import data from '../generated/world.json' with { type: 'json' };
import { project, PROJECTION_ID, WORLD_BOUNDS, CROP_ID, NORTH_LATITUDE, SOUTH_LATITUDE } from './geo.ts';
import { inRect, intersectBounds, clipSegment, visiblePart, signedArea } from './crop.ts';
import type { Vec2, ProvinceDef } from './types.ts';
export const BOUNDS = WORLD_BOUNDS;
export function contains(polygon: Vec2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
export function containsPart(part: Vec2[][], x: number, z: number): boolean {
  return contains(part[0], x, z) && !part.slice(1).some(hole => contains(hole, x, z));
}
export function boundsOf(points: Vec2[]) {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const p of points) { left = Math.min(left, p.x); right = Math.max(right, p.x); top = Math.min(top, p.z); bottom = Math.max(bottom, p.z); }
  return { left, right, top, bottom };
}
export const MAP: ProvinceDef[] = data.provinces.map((p, id) => {
  // Keep the geographic source and all ring topology. The renderer clips individual
  // triangles AFTER hole-aware tessellation; queries intersect this topology with BOUNDS.
  const parts = p.geometry.map(poly => poly.map(ring => ring.slice(0, -1).map(v => project(v[0], v[1]))));
  const originalCenter=project(p.center[0],p.center[1]);
  const candidates=parts.map((part,partIndex)=>{
    const full=boundsOf(part[0]),bounds=intersectBounds(full,BOUNDS);if(!bounds)return null;
    const cropped=full.top<BOUNDS.top||full.bottom>BOUNDS.bottom||full.left<BOUNDS.left||full.right>BOUNDS.right;
    // Most provinces are wholly inside: no expensive scanline work is needed.
    const info=cropped?visiblePart(part,bounds):{area:Math.abs(signedArea(part[0]))-part.slice(1).reduce((sum,r)=>sum+Math.abs(signedArea(r)),0),anchor:originalCenter};
    return info&&info.area>1e-9?{partIndex,bounds,cropped,...info}:null;
  }).filter((v):v is NonNullable<typeof v>=>v!==null);
  // Preserve the old main landmass while it remains visible; otherwise use the
  // largest remaining component. Do not move an anchor into a lake or the ocean.
  const primary=candidates.find(c=>c.partIndex===0)??candidates.sort((a,b)=>b.area-a.area)[0];
  const navigationPart=primary?.partIndex??0,main=parts[navigationPart];
  let center=originalCenter;
  if(primary&&(!inRect(center,primary.bounds)||!containsPart(main,center.x,center.z)))center=visiblePart(main,primary.bounds)!.anchor;
  return { id, code:p.code, name:[p.name[0]||p.name[1]||p.countryName||p.code,p.name[1]||p.name[0]||p.countryName||p.code] as [string,string],
    country:p.country, countryName:p.countryName||p.country, center, polygon:main[0], parts,
    neighbors:[], terrain:'plain', visible:!!primary, playable:!!primary&&p.country!=='ATA', navigationPart,
    cropped:candidates.some(c=>c.cropped)||candidates.length!==parts.length, bounds:primary?.bounds??boundsOf(main[0]) };
});
// Rebuild permission edges only from positive-length ORIGINAL shared borders inside
// the crop. The new top/bottom cut lines never create adjacency or sea bridges.
const edgeOwners=new Map<string,number[]>(),neighbors=MAP.map(()=>new Set<number>());
const pointKey=(p:Vec2)=>`${p.x.toFixed(6)},${p.z.toFixed(6)}`;
for(const province of MAP)if(province.playable)for(const part of province.parts)for(const ring of part)for(let i=0;i<ring.length;i++) {
  const a=ring[i],b=ring[(i+1)%ring.length];if(!clipSegment(a,b,BOUNDS))continue;
  const ka=pointKey(a),kb=pointKey(b),key=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`,others=edgeOwners.get(key)??[];
  for(const other of others)if(other!==province.id&&(data.provinces[province.id].neighbors as number[]).includes(other)) {
    neighbors[province.id].add(other);neighbors[other].add(province.id);
  }
  others.push(province.id);edgeOwners.set(key,others);
}
// An entirely retained neighbor guarantees the ORIGINAL shared border is inside.
// Preserve these source adjacencies even when simplification changed edge segmentation.
for(const p of MAP)if(p.playable)for(const id of data.provinces[p.id].neighbors) {
  const other=MAP[id];if(other.playable&&(!p.cropped||!other.cropped)){neighbors[p.id].add(id);neighbors[id].add(p.id);}
}
for(const p of MAP)p.neighbors=[...neighbors[p.id]].sort((a,b)=>a-b);
edgeOwners.clear();
export const VISIBLE_COUNT=MAP.filter(p=>p.visible).length;
export const PLAYABLE_COUNT=MAP.filter(p=>p.playable).length;
export const MAP_METADATA={source:data.source,revision:data.sourceRevision,projection:PROJECTION_ID,crop:CROP_ID,
  north:NORTH_LATITUDE,south:SOUTH_LATITUDE,count:MAP.length,visibleCount:VISIBLE_COUNT,playableCount:PLAYABLE_COUNT};
// Component-aware spatial index: bound queries as well as rendering. Outside
// polar land remains in source data but cannot be picked, occupied, or navigated.
const SIZE=25,index=new Map<string,{id:number;part:Vec2[][];bounds:ReturnType<typeof boundsOf>}[]>();
for(const p of MAP)if(p.visible)for(const part of p.parts) {
  const bounds=intersectBounds(boundsOf(part[0]),BOUNDS);if(!bounds)continue;
  const entry={id:p.id,part,bounds};
  for(let x=Math.floor(bounds.left/SIZE);x<=Math.floor(bounds.right/SIZE);x++)
    for(let z=Math.floor(bounds.top/SIZE);z<=Math.floor(bounds.bottom/SIZE);z++) {
      const key=`${x}:${z}`,bucket=index.get(key)??[];bucket.push(entry);index.set(key,bucket);
    }
}
export function pointInProvince(id:number,x:number,z:number):boolean {
  return inRect({x,z},BOUNDS)&&(MAP[id]?.visible??false)&&(MAP[id]?.parts.some(part=>containsPart(part,x,z))??false);
}
export function navigableInProvince(id:number,x:number,z:number):boolean {
  const p=MAP[id];return !!p?.playable&&inRect({x,z},BOUNDS)&&containsPart(p.parts[p.navigationPart],x,z);
}
export function provinceAt(x:number,z:number):number {
  if(!inRect({x,z},BOUNDS))return -1;
  for(const e of index.get(`${Math.floor(x/SIZE)}:${Math.floor(z/SIZE)}`)??[])
    if(x>=e.bounds.left&&x<=e.bounds.right&&z>=e.bounds.top&&z<=e.bounds.bottom&&containsPart(e.part,x,z))return e.id;
  return -1;
}
export function searchProvinces(query:string,limit=8):ProvinceDef[] {
  const q=query.trim().toLocaleLowerCase();if(!q)return [];
  return MAP.filter(p=>p.visible&&[...p.name,p.code,p.countryName].some(v=>v.toLocaleLowerCase().includes(q))).slice(0,limit);
}
// Procedural relief is only a visual placeholder, not measured elevation or a movement obstacle.
export function heightAt(x:number,z:number):number {return 0.16+0.32*(1+Math.sin(x*0.18)*Math.cos(z*0.22));}
export function provinceByCode(code:string):number {
  const p=MAP.find(p=>p.code===code);if(!p)throw new Error(`Unknown province ${code}`);return p.id;
}
export const START_CODES=['DEU-1574','DEU-1591','FRA-5328','POL-3144'];
export const STARTS=START_CODES.map((code,i)=>{
  const exact=MAP.find(p=>p.code===code&&p.playable);
  const fallback=MAP.filter(p=>p.playable&&p.country===['DEU','DEU','FRA','POL'][i]&&p.neighbors.length>=3)[i];
  const p=exact??fallback;if(!p)throw new Error('Missing start province');return p.id;
});
