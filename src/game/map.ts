/** The operational map is the locked output of the SAME grouping kernel used
 * for in-game merge/split. Raw Natural Earth shapes and topology are retained
 * separately; no destructive dissolve or historical-boundary fabrication. */
import {SOURCE_MAP,PREPROCESSED_GROUPING,PREPROCESSED_GROUP_NAMES,SOURCE_TOPOLOGY,contains,containsPart,boundsOf} from './sourceMap.ts';
import {createTerritoryGrouping,type TerritoryTopology} from './territoryGrouping.ts';
import {MAP_ID} from './content.ts';
import {WORLD_BOUNDS,PROJECTION_ID,CROP_ID,NORTH_LATITUDE,SOUTH_LATITUDE} from './geo.ts';
import {inRect,intersectBounds,signedArea} from './crop.ts';
import type {ProvinceDef,Vec2} from './types.ts';
export {contains,containsPart,boundsOf,SOURCE_MAP,SOURCE_TOPOLOGY,PREPROCESSED_GROUPING};
export {heightAt} from './sourceMap.ts';
export const BOUNDS=WORLD_BOUNDS;
const sourceByCode=new Map(SOURCE_MAP.map(p=>[p.code,p]));
const area=(p:ProvinceDef)=>p.parts.reduce((total,part)=>total+Math.abs(signedArea(part[0]))-part.slice(1).reduce((n,hole)=>n+Math.abs(signedArea(hole)),0),0);
/** Stable base IDs are the canonical original member IDs, not array indices.
 * sourceAtoms and PREPROCESSED_GROUPING retain the full reversible lineage.
 * A later ruleset can lower the lock floor using SOURCE_MAP, with an explicit
 * save/network migration; current commands cannot address original members. */
export const MAP:ProvinceDef[]=PREPROCESSED_GROUPING.groups.map((group,id)=>{
 const members=group.atoms.map(code=>sourceByCode.get(code)!);
 const primary=[...members].sort((a,b)=>Number(b.playable)-Number(a.playable)||area(b)-area(a)||a.id-b.id)[0];
 const parts=members.flatMap(p=>p.parts),navigationPart=parts.indexOf(primary.parts[primary.navigationPart]);
 const visibleBounds=members.filter(p=>p.visible).map(p=>p.bounds);
 const bounds=visibleBounds.length?{left:Math.min(...visibleBounds.map(b=>b.left)),right:Math.max(...visibleBounds.map(b=>b.right)),top:Math.min(...visibleBounds.map(b=>b.top)),bottom:Math.max(...visibleBounds.map(b=>b.bottom))}:primary.bounds;
 return {...primary,id,code:group.atoms[0],name:PREPROCESSED_GROUP_NAMES.get(group.atoms[0])??primary.name,sourceAtoms:[...group.atoms],locked:true,parts,polygon:parts[navigationPart][0],navigationPart,bounds,neighbors:[],visible:members.some(p=>p.visible),playable:members.some(p=>p.playable),cropped:members.some(p=>p.cropped)};
});
export const SOURCE_TO_REGION:Readonly<Record<string,number>>=Object.freeze(Object.fromEntries(MAP.flatMap(p=>p.sourceAtoms!.map(code=>[code,p.id]))));
for(const region of MAP){const neighbors=new Set<number>();for(const code of region.sourceAtoms!)for(const source of sourceByCode.get(code)!.neighbors){const id=SOURCE_TO_REGION[SOURCE_MAP[source].code];if(id!==region.id)neighbors.add(id);}region.neighbors=[...neighbors].sort((a,b)=>a-b);}
export const VISIBLE_COUNT=MAP.filter(p=>p.visible).length;
export const PLAYABLE_COUNT=MAP.filter(p=>p.playable).length;
export const MAP_METADATA={source:'Natural Earth 1:10m Admin 1 v5.1.1',revision:'Natural Earth 5.1.1 / locked gameplay regions v5',mapId:MAP_ID,projection:PROJECTION_ID,crop:CROP_ID,north:NORTH_LATITUDE,south:SOUTH_LATITUDE,count:MAP.length,visibleCount:VISIBLE_COUNT,playableCount:PLAYABLE_COUNT,sourceAtomCount:SOURCE_MAP.length,preprocessedLocked:true};
const SIZE=25,index=new Map<string,{id:number;part:Vec2[][];bounds:ReturnType<typeof boundsOf>}[]>();
for(const p of MAP)if(p.visible)for(const part of p.parts){
 const bounds=intersectBounds(boundsOf(part[0]),BOUNDS);if(!bounds)continue;
 const entry={id:p.id,part,bounds};
 for(let x=Math.floor(bounds.left/SIZE);x<=Math.floor(bounds.right/SIZE);x++)for(let z=Math.floor(bounds.top/SIZE);z<=Math.floor(bounds.bottom/SIZE);z++){const key=`${x}:${z}`,bucket=index.get(key)??[];bucket.push(entry);index.set(key,bucket);}
}
export function pointInProvince(id:number,x:number,z:number):boolean{return inRect({x,z},BOUNDS)&&(MAP[id]?.visible??false)&&(MAP[id]?.parts.some(part=>containsPart(part,x,z))??false);}
export function navigableInProvince(id:number,x:number,z:number):boolean{return !!MAP[id]?.playable&&pointInProvince(id,x,z);}
export function provinceAt(x:number,z:number):number{
 if(!inRect({x,z},BOUNDS))return -1;
 for(const e of index.get(`${Math.floor(x/SIZE)}:${Math.floor(z/SIZE)}`)??[])if(inRect({x,z},e.bounds)&&containsPart(e.part,x,z))return e.id;
 return -1;
}
export function searchProvinces(query:string,limit=8):ProvinceDef[]{const q=query.trim().toLocaleLowerCase();if(!q)return [];return MAP.filter(p=>p.visible&&[...p.name,p.code,...p.sourceAtoms!.flatMap(code=>[code,...sourceByCode.get(code)!.name])].some(v=>v.toLocaleLowerCase().includes(q))).slice(0,limit);}
/** Source-code lookup is an alias to its whole gameplay region, never a route
 * to select or command that original administrative unit independently. */
export function provinceByCode(code:string):number{const id=Object.hasOwn(SOURCE_TO_REGION,code)?SOURCE_TO_REGION[code]:undefined;if(id===undefined)throw new Error(`Unknown province ${code}`);return id;}
export const STARTS=MAP.filter(p=>p.playable&&p.neighbors.length>0).slice(0,4).map(p=>p.id);
export const START_CODES=STARTS.map(id=>MAP[id].code);
export const TERRITORY_TOPOLOGY:TerritoryTopology={mapId:MAP_ID,atoms:MAP.map(p=>({id:p.code,neighbors:p.neighbors.map(id=>MAP[id].code),playable:p.playable}))};
export const INITIAL_TERRITORY_GROUPING=createTerritoryGrouping(TERRITORY_TOPOLOGY);
