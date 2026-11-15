var geometryReady=false;
import {kernel,storeData,setupGeometry} from './groundKernel.ts';
/** The operational map is the locked output of the SAME grouping kernel used
 * for in-game merge/split. Raw Natural Earth shapes and topology are retained
 * separately; no destructive dissolve or historical-boundary fabrication. */
import {SOURCE_MAP,PREPROCESSED_GROUPING,PREPROCESSED_GROUP_NAMES,SOURCE_TOPOLOGY,contains,containsPart,boundsOf} from './sourceMap.ts';
import {createTerritoryGrouping,type TerritoryTopology} from './territoryGrouping.ts';
import {MAP_ID} from './content.ts';
import {WORLD_BOUNDS,PROJECTION_ID,CROP_ID,NORTH_LATITUDE,SOUTH_LATITUDE} from './geo.ts';
import {inRect,intersectBounds,signedArea} from './crop.ts';
import type {ProvinceDef,Vec2} from './types.ts';
import {prepareRing,ringContains} from './polygonQuery.ts';
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
const queries=MAP.map(p=>p.parts.map(part=>part.map(prepareRing)));
function partContains(part:ReturnType<typeof prepareRing>[],x:number,z:number):boolean {if(x<part[0].left-1e-7||x>part[0].right+1e-7||!ringContains(part[0],x,z))return false;for(let i=1;i<part.length;i++)if(ringContains(part[i],x,z))return false;return true;}
const SIZE=5,minX=Math.floor(BOUNDS.left/SIZE),minZ=Math.floor(BOUNDS.top/SIZE),cols=Math.floor(BOUNDS.right/SIZE)-minX+1,rows=Math.floor(BOUNDS.bottom/SIZE)-minZ+1;
const index:Array<{id:number;part:ReturnType<typeof prepareRing>[];bounds:ReturnType<typeof boundsOf>}[]|undefined>=new Array(cols*rows);
for(const p of MAP)if(p.visible)for(const part of p.parts){
 const bounds=intersectBounds(boundsOf(part[0]),BOUNDS);if(!bounds)continue;
 const entry={id:p.id,part:queries[p.id][p.parts.indexOf(part)],bounds};
 for(let x=Math.floor(bounds.left/SIZE);x<=Math.floor(bounds.right/SIZE);x++)for(let z=Math.floor(bounds.top/SIZE);z<=Math.floor(bounds.bottom/SIZE);z++){const key=(z-minZ)*cols+x-minX,bucket=index[key]??[];bucket.push(entry);index[key]=bucket;}
}
const memberships=new Map<number,boolean>();
export function pointInProvince(id:number,x:number,z:number):boolean{if(Number.isFinite(x)&&Number.isFinite(z)&&Number.isInteger(id)&&id>=0&&id<MAP.length&&geometryReady)return Boolean(kernel.kernelPointInProvince(id,x,z));
 if(!inRect({x,z},BOUNDS)||!MAP[id]?.visible)return false;
 const cell=(Math.floor(z/querySize)-queryMinZ)*queryCols+Math.floor(x/querySize)-queryMinX,key=cell*MAP.length+id;
 if(!queryBoundary[cell]){if(queryAnswers[cell]===id)return true;const found=memberships.get(key);if(found!==undefined)return found;}
 const found=queries[id].some(part=>partContains(part,x,z));
 if(!queryBoundary[cell]){if(memberships.size>=65536)memberships.delete(memberships.keys().next().value!);memberships.set(key,found);}return found;
}
export function navigableInProvince(id:number,x:number,z:number):boolean{return !!MAP[id]?.playable&&pointInProvince(id,x,z);}
// Cells touched by any ring edge retain the exact polygon query. Interior
// cells have a constant answer, including holes, overlaps and source ordering.
const querySize=2,queryMinX=Math.floor(BOUNDS.left/querySize),queryMinZ=Math.floor(BOUNDS.top/querySize),queryCols=Math.floor(BOUNDS.right/querySize)-queryMinX+1,queryRows=Math.floor(BOUNDS.bottom/querySize)-queryMinZ+1;
const queryBoundary=new Uint8Array(queryCols*queryRows),queryAnswers=new Int16Array(queryCols*queryRows).fill(-2);
for(const province of MAP)if(province.visible)for(const part of province.parts)for(const ring of part)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j],left=Math.max(0,Math.floor((Math.min(a.x,b.x)-1e-7)/querySize)-queryMinX),right=Math.min(queryCols-1,Math.floor((Math.max(a.x,b.x)+1e-7)/querySize)-queryMinX),top=Math.max(0,Math.floor((Math.min(a.z,b.z)-1e-7)/querySize)-queryMinZ),bottom=Math.min(queryRows-1,Math.floor((Math.max(a.z,b.z)+1e-7)/querySize)-queryMinZ);
 for(let z=top;z<=bottom;z++)for(let x=left;x<=right;x++)queryBoundary[z*queryCols+x]=1;
}
export function provinceAt(x:number,z:number):number{if(Number.isFinite(x)&&Number.isFinite(z)&&geometryReady)return kernel.kernelProvinceAt(x,z);
 if(!inRect({x,z},BOUNDS))return -1;
 const cell=(Math.floor(z/querySize)-queryMinZ)*queryCols+Math.floor(x/querySize)-queryMinX;
 if(!queryBoundary[cell]&&queryAnswers[cell]!==-2)return queryAnswers[cell];
 let found=-1;
 for(const e of index[(Math.floor(z/SIZE)-minZ)*cols+Math.floor(x/SIZE)-minX]??[])if(x>=e.bounds.left&&x<=e.bounds.right&&z>=e.bounds.top&&z<=e.bounds.bottom&&partContains(e.part,x,z)){found=e.id;break;}
 if(!queryBoundary[cell])queryAnswers[cell]=found;
 return found;
}
export function searchProvinces(query:string,limit=8):ProvinceDef[]{const q=query.trim().toLocaleLowerCase();if(!q)return [];return MAP.filter(p=>p.visible&&[...p.name,p.code,...p.sourceAtoms!.flatMap(code=>[code,...sourceByCode.get(code)!.name])].some(v=>v.toLocaleLowerCase().includes(q))).slice(0,limit);}
/** Source-code lookup is an alias to its whole gameplay region, never a route
 * to select or command that original administrative unit independently. */
export function provinceByCode(code:string):number{const id=Object.hasOwn(SOURCE_TO_REGION,code)?SOURCE_TO_REGION[code]:undefined;if(id===undefined)throw new Error(`Unknown province ${code}`);return id;}
export const STARTS=MAP.filter(p=>p.playable&&p.neighbors.length>0).slice(0,4).map(p=>p.id);
export const START_CODES=STARTS.map(id=>MAP[id].code);
export const TERRITORY_TOPOLOGY:TerritoryTopology={mapId:MAP_ID,atoms:MAP.map(p=>({id:p.code,neighbors:p.neighbors.map(id=>MAP[id].code),playable:p.playable}))};
export const INITIAL_TERRITORY_GROUPING=createTerritoryGrouping(TERRITORY_TOPOLOGY);

{
   const ringData:number[]=[],parts:number[]=[],provinceOffsets:number[]=[0],partIds=new Map<object,number>();
   for(const province of queries){for(const part of province){const partId=parts.length/2;partIds.set(part,partId);parts.push(ringData.length/9,part.length);for(const ring of part)ringData.push(ring.left,ring.right,ring.top,ring.bottom,ring.step,storeData(ring.coordinates),storeData(ring.offsets),storeData(ring.edges),ring.offsets.length-1);}provinceOffsets.push(parts.length/2);}
   const entryMap=new Map<object,number>(),entryParts:number[]=[],entryProvinces:number[]=[],entryBounds:number[]=[],entryIds:number[]=[],indexOffsets:number[]=[0];
   for(const bucket of index){for(const e of bucket??[]){let id=entryMap.get(e);if(id===undefined){id=entryMap.size;entryMap.set(e,id);entryParts.push(partIds.get(e.part)!);entryProvinces.push(e.id);entryBounds.push(e.bounds.left,e.bounds.right,e.bounds.top,e.bounds.bottom);}entryIds.push(id);}indexOffsets.push(entryIds.length);}
   setupGeometry('setupMap',[storeData(new Float64Array(ringData)),storeData(new Uint32Array(parts)),storeData(new Uint32Array(provinceOffsets)),storeData(new Uint32Array(indexOffsets)),storeData(new Uint32Array(entryIds)),storeData(new Uint32Array(entryParts)),storeData(new Uint32Array(entryProvinces)),storeData(new Float64Array(entryBounds)),storeData(queryBoundary),storeData(queryAnswers),storeData(Uint8Array.from(MAP,p=>Number(p.visible))),SIZE,minX,minZ,cols,querySize,queryMinX,queryMinZ,queryCols,BOUNDS.left,BOUNDS.right,BOUNDS.top,BOUNDS.bottom,storeData(new Float64Array(MAP.flatMap(p=>[p.center.x,p.center.z]))),storeData(new Int32Array(MAP.length))]);
  }

geometryReady=true;
