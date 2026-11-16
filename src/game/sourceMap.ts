import {createTerritoryGrouping,type TerritoryTopology} from './territoryGrouping.ts';
import data from '../generated/world.js';
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
export const SOURCE_MAP: ProvinceDef[] = data.provinces.map((p, id) => {
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
  return { id, code:p.code, name:[p.name[0]||`未命名地区 ${id+1}`,p.name[1]||`Unnamed region ${id+1}`] as [string,string],
    sourceId:p.sourceId, center, polygon:main[0], parts,
    neighbors:[], terrain:'plain', visible:!!primary, playable:!!primary, navigationPart,
    cropped:candidates.some(c=>c.cropped)||candidates.length!==parts.length, bounds:primary?.bounds??boundsOf(main[0]) };
});
// Rebuild permission edges only from positive-length ORIGINAL shared borders inside
// the crop. The new top/bottom cut lines never create adjacency or sea bridges.
const edgeOwners=new Map<string,number[]>(),neighbors=SOURCE_MAP.map(()=>new Set<number>());
const pointKey=(p:Vec2)=>`${p.x.toFixed(6)},${p.z.toFixed(6)}`;
for(const province of SOURCE_MAP)if(province.playable)for(const part of province.parts)for(const ring of part)for(let i=0;i<ring.length;i++) {
  const a=ring[i],b=ring[(i+1)%ring.length];if(!clipSegment(a,b,BOUNDS))continue;
  const ka=pointKey(a),kb=pointKey(b),key=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`,others=edgeOwners.get(key)??[];
  for(const other of others)if(other!==province.id&&(data.provinces[province.id].neighbors as number[]).includes(other)) {
    neighbors[province.id].add(other);neighbors[other].add(province.id);
  }
  others.push(province.id);edgeOwners.set(key,others);
}
// An entirely retained neighbor guarantees the ORIGINAL shared border is inside.
// Preserve these source adjacencies even when simplification changed edge segmentation.
for(const p of SOURCE_MAP)if(p.playable)for(const id of data.provinces[p.id].neighbors) {
  const other=SOURCE_MAP[id];if(other.playable&&(!p.cropped||!other.cropped)){neighbors[p.id].add(id);neighbors[id].add(p.id);}
}
for(const p of SOURCE_MAP)p.neighbors=[...neighbors[p.id]].sort((a,b)=>a-b);
edgeOwners.clear();
export const VISIBLE_COUNT=SOURCE_MAP.filter(p=>p.visible).length;
export const PLAYABLE_COUNT=SOURCE_MAP.filter(p=>p.playable).length;
export const SOURCE_MAP_METADATA={source:data.source,revision:data.sourceRevision,projection:PROJECTION_ID,crop:CROP_ID,
  north:NORTH_LATITUDE,south:SOUTH_LATITUDE,count:SOURCE_MAP.length,visibleCount:VISIBLE_COUNT,playableCount:PLAYABLE_COUNT};
export {LAND_Y,heightAt} from './mapHeight.ts';
export const SOURCE_TOPOLOGY:TerritoryTopology={mapId:data.mapId,atoms:SOURCE_MAP.map(p=>({id:p.code,neighbors:p.neighbors.map(id=>SOURCE_MAP[id].code),playable:p.playable}))};
// Administrative memberships may include reviewed off-shore islands. Add
// those links ONLY to the topology used to build and validate the source
// partition. SOURCE_MAP, SOURCE_TOPOLOGY, MAP's land adjacency and the
// terrain navigator never consume these non-physical membership links.
const byCode=new Map(SOURCE_MAP.map(p=>[p.code,p]));
const groupingNeighbors=new Map(SOURCE_TOPOLOGY.atoms.map(atom=>[atom.id,new Set(atom.neighbors)]));
for(const group of data.gameplayGroups)for(const [island,hub] of group.islandAttachments??[]){
  const a=byCode.get(island),b=byCode.get(hub);
  if(!a?.visible||!b?.visible)continue;
  groupingNeighbors.get(island)!.add(hub);
  groupingNeighbors.get(hub)!.add(island);
}
export const PREPROCESSED_TOPOLOGY:TerritoryTopology={...SOURCE_TOPOLOGY,atoms:SOURCE_TOPOLOGY.atoms.map(atom=>({...atom,neighbors:[...groupingNeighbors.get(atom.id)!]}))};
// Cropping can remove a real border. Split the initial reference group into
// remaining components, keeping only the explicitly reviewed island memberships.
const initialParts:string[][]=[];
export const PREPROCESSED_GROUP_NAMES=new Map<string,[string,string]>();
export const PREPROCESSED_GROUP_SEARCH_ALIASES=new Map<string,string[]>();
export const PREPROCESSED_GROUP_ANCHORS=new Map<string,string>();
for(const g of data.gameplayGroups){
  const remaining=new Set(g.atomIds);
  for(const start of [...remaining].sort())if(remaining.delete(start)){
    const part=[start];for(let i=0;i<part.length;i++)for(const code of groupingNeighbors.get(part[i])!){if(remaining.delete(code))part.push(code);}
    initialParts.push(part);
    // Use a curated name only for the complete group, never for crop fragments.
    if(part.length===g.atomIds.length){
      if(g.displayName)PREPROCESSED_GROUP_NAMES.set(start,g.displayName);
      if(g.searchAliases?.length)PREPROCESSED_GROUP_SEARCH_ALIASES.set(start,g.searchAliases);
      if(g.anchorAtomId&&part.includes(g.anchorAtomId)&&byCode.get(g.anchorAtomId)?.playable)PREPROCESSED_GROUP_ANCHORS.set(start,g.anchorAtomId);
    }
  }
}
export const PREPROCESSED_GROUPING=createTerritoryGrouping(PREPROCESSED_TOPOLOGY,initialParts,{locked:true});
