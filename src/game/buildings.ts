var geometryReady=false;
import {kernel,storeData,setupGeometry} from './groundKernel.ts';
import {MAP,pointInProvince} from './map.ts';
import type {Vec2} from './types.ts';
import {terrainLocalSegment,terrainClearance} from './terrain-navigation.ts';
import {UNIT_RADIUS} from './collision.ts';

/** The same four houses that the near-view renderer has always drawn. */
export const HOUSE_WIDTH=.5,HOUSE_DEPTH=.65,HOUSE_HEIGHT=.6,TOWN_OFFSET=.65;
// Leave a walkable shore strip for the largest battalion. Sea/land portals
// remain exact terrain waypoints and must not be covered by a house footprint.
export const BUILDING_SHORE_CLEARANCE=Math.hypot(HOUSE_WIDTH/2+Math.max(...Object.values(UNIT_RADIUS)),HOUSE_DEPTH/2+Math.max(...Object.values(UNIT_RADIUS)));
export interface Building extends Vec2 {province:number;rotation:number}
function fitsLand(b:Building):boolean {
 const c=Math.cos(b.rotation),s=Math.sin(b.rotation);
 const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([dx,dz])=>({x:b.x+c*dx*HOUSE_WIDTH/2+s*dz*HOUSE_DEPTH/2,z:b.z-s*dx*HOUSE_WIDTH/2+c*dz*HOUSE_DEPTH/2}));
 return terrainClearance(b,BUILDING_SHORE_CLEARANCE)>=BUILDING_SHORE_CLEARANCE-1e-8&&pointInProvince(b.province,b.x,b.z)&&corners.every((p,i)=>pointInProvince(b.province,p.x,p.z)&&terrainLocalSegment(p,corners[(i+1)%4]));
}
export const BUILDINGS:readonly Building[]=MAP.flatMap(p=>p.visible?Array.from({length:4},(_,i)=>({province:p.id,rotation:i,x:p.center.x+Math.cos(i*2.3)*TOWN_OFFSET,z:p.center.z+Math.sin(i*2.3)*TOWN_OFFSET})).filter(fitsLand):[]);
export const TOWNS:Building[][]=MAP.map(()=>[]);for(const b of BUILDINGS)TOWNS[b.province].push(b);
type Obstacle=Building&{cos:number;sin:number};
const cell=4,buckets=new Map<number,Map<number,Obstacle[]>>();
for(const b of BUILDINGS){const x=Math.floor(b.x/cell),z=Math.floor(b.z/cell);let column=buckets.get(x);if(!column){column=new Map();buckets.set(x,column);}const list=column.get(z)??[];list.push({...b,cos:Math.cos(b.rotation),sin:Math.sin(b.rotation)});column.set(z,list);}
function nearby(a:Vec2,b:Vec2,r:number):Building[]{
 const out:Building[]=[];r+=Math.hypot(HOUSE_WIDTH,HOUSE_DEPTH)/2;
 for(let x=Math.floor((Math.min(a.x,b.x)-r)/cell);x<=Math.floor((Math.max(a.x,b.x)+r)/cell);x++)for(let z=Math.floor((Math.min(a.z,b.z)-r)/cell);z<=Math.floor((Math.max(a.z,b.z)+r)/cell);z++)out.push(...(buckets.get(x)?.get(z)??[]));
 return out;
}
function local(b:Building,p:Vec2):Vec2 {const x=p.x-b.x,z=p.z-b.z,c=Math.cos(b.rotation),s=Math.sin(b.rotation);return{x:c*x-s*z,z:s*x+c*z};}
/** Check the rectangle of battalion centers against the same padded houses as buildingSegment. */
export function buildingFootprint(center:Vec2,heading:number,halfLength:number,halfWidth:number,radius:number):boolean {
 const span=(angle:number,x:number,z:number)=>Math.abs(Math.cos(angle))*x+Math.abs(Math.sin(angle))*z;
 const width=HOUSE_WIDTH/2+radius,depth=HOUSE_DEPTH/2+radius;
 const reach=Math.hypot(halfLength,halfWidth)+Math.hypot(width,depth);
 const left=Math.floor((center.x-reach)/cell),right=Math.floor((center.x+reach)/cell);
 const top=Math.floor((center.z-reach)/cell),bottom=Math.floor((center.z+reach)/cell);
 for(let x=left;x<=right;x++){
  const column=buckets.get(x);if(!column)continue;
  for(let z=top;z<=bottom;z++){
   const houses=column.get(z);if(!houses)continue;
   for(const house of houses){
    const dx=center.x-house.x,dz=center.z-house.z;
    if(Math.abs(dx)>reach+1e-8||Math.abs(dz)>reach+1e-8)continue;
    const angle=-house.rotation;
    const separated=(axis:number)=>Math.abs(dx*Math.cos(axis)+dz*Math.sin(axis))
      >=span(heading-axis,halfLength,halfWidth)+span(angle-axis,width,depth)-1e-8;
    if(!separated(heading)&&!separated(heading+Math.PI/2)&&!separated(angle)&&!separated(angle+Math.PI/2))return false;
   }
  }
 }
 return true;
}
export function buildingClearance(p:Vec2,radius:number):number {
 let gap=radius;
 for(const b of nearby(p,p,radius)){const q=local(b,p);gap=Math.min(gap,Math.hypot(Math.max(0,Math.abs(q.x)-HOUSE_WIDTH/2),Math.max(0,Math.abs(q.z)-HOUSE_DEPTH/2)));}
 return gap;
}
// Static town buckets, packed for the repeated swept footprint queries.
const townMinX=Math.min(...buckets.keys()),townMaxX=Math.max(...buckets.keys());
const townMinZ=Math.min(...[...buckets.values()].flatMap(column=>[...column.keys()])),townMaxZ=Math.max(...[...buckets.values()].flatMap(column=>[...column.keys()]));
const townCols=townMaxX-townMinX+1,townRows=townMaxZ-townMinZ+1,townOffsets=new Uint32Array(townCols*townRows+1);
const townData=new Float64Array(BUILDINGS.length*4),townIds=new Uint32Array(BUILDINGS.length);
{
 for(const [x,column]of buckets)for(const [z,houses]of column)townOffsets[(z-townMinZ)*townCols+x-townMinX+1]+=houses.length;
 for(let i=1;i<townOffsets.length;i++)townOffsets[i]+=townOffsets[i-1];
 const cursor=townOffsets.slice();let id=0;
 for(const [x,column]of buckets)for(const [z,houses]of column)for(const house of houses){townData.set([house.x,house.z,house.cos,house.sin],id*4);townIds[cursor[(z-townMinZ)*townCols+x-townMinX]++]=id*4;id++;}
}
/** Swept-circle test with the original expanded oriented rectangles. */
export function buildingSegment(a:Vec2,b:Vec2,radius:number):boolean {if(geometryReady)return Boolean(kernel.kernelBuildingSegment(a.x,a.z,b.x,b.z,radius));
 const reach=radius+Math.hypot(HOUSE_WIDTH,HOUSE_DEPTH)/2,left=Math.max(0,Math.floor((Math.min(a.x,b.x)-reach)/cell)-townMinX),right=Math.min(townCols-1,Math.floor((Math.max(a.x,b.x)+reach)/cell)-townMinX),top=Math.max(0,Math.floor((Math.min(a.z,b.z)-reach)/cell)-townMinZ),bottom=Math.min(townRows-1,Math.floor((Math.max(a.z,b.z)+reach)/cell)-townMinZ);
 const width=HOUSE_WIDTH/2+radius,depth=HOUSE_DEPTH/2+radius;
 for(let x=left;x<=right;x++)for(let z=top;z<=bottom;z++){
  const bucket=z*townCols+x;
  for(let at=townOffsets[bucket];at<townOffsets[bucket+1];at++){
   const i=townIds[at],hx=townData[i],hz=townData[i+1],c=townData[i+2],s=townData[i+3];
   const ax=a.x-hx,az=a.z-hz,bx=b.x-hx,bz=b.z-hz;
   const px=c*ax-s*az,qx=c*bx-s*bz,dx=qx-px;let lo=0,hi=1;
   if(Math.abs(dx)<1e-12){if(Math.abs(px)>=width-1e-8)continue;}else{const t1=(-width-px)/dx,t2=(width-px)/dx;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}
   const pz=s*ax+c*az,qz=s*bx+c*bz,dz=qz-pz;
   if(Math.abs(dz)<1e-12){if(Math.abs(pz)>=depth-1e-8)continue;}else{const t1=(-depth-pz)/dz,t2=(depth-pz)/dz;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}
   if(lo<hi-1e-9&&hi>1e-9&&lo<1-1e-9)return false;
  }
 }
 return true;
}
const detourNodes=new Map<string,Vec2[]>();
function townDetourNodes(id:number,radius:number):Vec2[]{
 const key=`${id}:${radius}`,cached=detourNodes.get(key);if(cached)return cached;
 const nodes:Vec2[]=[],c=MAP[id].center,r=TOWN_OFFSET+Math.hypot(HOUSE_WIDTH,HOUSE_DEPTH)/2+Math.SQRT2*radius+.12;
 for(let i=0;i<16;i++){const a=i*Math.PI/8,p={x:c.x+Math.cos(a)*r,z:c.z+Math.sin(a)*r};if(buildingSegment(p,p,radius))nodes.push(p);}
 if(detourNodes.size>=512)detourNodes.delete(detourNodes.keys().next().value!);detourNodes.set(key,nodes);return nodes;
}
/** Final arrival: within this distance of the region center, with the next step inside the region. */
export const ARRIVAL_RADIUS=2.3;
/** A small local visibility graph around existing towns. The terrain flow field
 * remains authoritative; callers constrain every candidate to its land corridor.
 * No persistent steering state: save/replay and array order stay deterministic.
 * On a final leg `arrival` is the target region. Its own houses cover its center,
 * so any detour node inside that region and within ARRIVAL_RADIUS also counts as reached. */
export function buildingStep(from:Vec2,goal:Vec2,radius:number,step:number,legal:(a:Vec2,b:Vec2)=>boolean,arrival=-1):Vec2 {
 const dist=(a:Vec2,b:Vec2)=>Math.hypot(a.x-b.x,a.z-b.z);
 const advance=(to:Vec2)=>{const d=dist(from,to),f=d?Math.min(step/d,1):0;return{x:from.x+(to.x-from.x)*f,z:from.z+(to.z-from.z)*f};};
 // Bound local work even when a route crosses a continent.
 const d=dist(from,goal),dx=goal.x-from.x,dz=goal.z-from.z,scale=d?Math.min(5/d,1):0,move=d?Math.min(step/d,1):0;
 const target={x:from.x+dx*scale,z:from.z+dz*scale},direct={x:from.x+dx*move,z:from.z+dz*move};
 const covered=!buildingSegment(target,target,radius),arriving=arrival>=0&&covered;
 // Keep following the detour until the whole local connection is clear,
 // rather than being pulled back toward the blocked centerline each tick.
 // An arriving unit plans first: pushing straight at a covered center would undo the detour.
 if(!arriving&&(covered||buildingSegment(from,target,radius))&&buildingSegment(from,direct,radius)&&legal(from,direct))return direct;
 let towns=[...new Set(nearby(from,target,radius+.5).map(b=>b.province))];
 if(arriving)towns=[arrival,...towns.filter(id=>id!==arrival)];
 const nodes:Vec2[]=[from,target];
 for(const id of towns.slice(0,4))nodes.push(...townDetourNodes(id,radius));
 const reached=(i:number)=>i===1||(arriving&&i>1&&dist(nodes[i],goal)<=ARRIVAL_RADIUS&&pointInProvince(arrival,nodes[i].x,nodes[i].z));
 const costs=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),done=new Set<number>();costs[0]=0;let found=-1;
 for(let k=0;k<nodes.length;k++){
  let current=-1;for(let i=0;i<nodes.length;i++)if(!done.has(i)&&(current<0||costs[i]<costs[current]))current=i;
  if(current<0||!Number.isFinite(costs[current]))break;if(reached(current)){found=current;break;}done.add(current);
  for(let i=1;i<nodes.length;i++)if(!done.has(i)){
   const cost=costs[current]+dist(nodes[current],nodes[i]);
   if(cost>=costs[i]-1e-8||!buildingSegment(nodes[current],nodes[i],radius)||!legal(nodes[current],nodes[i]))continue;
   costs[i]=cost;previous[i]=current;
  }
 }
 if(found>0){let i=found;while(previous[i]>0)i=previous[i];return advance(nodes[i]);}
 if(arriving&&buildingSegment(from,direct,radius)&&legal(from,direct))return direct;
 // A blocked objective is not a license to walk into a house or off an island.
 return from;
}

setupGeometry('setupBuildings',[storeData(townData),storeData(townIds),storeData(townOffsets),townMinX,townMinZ,townCols,townRows,cell,HOUSE_WIDTH/2,HOUSE_DEPTH/2,Math.hypot(HOUSE_WIDTH,HOUSE_DEPTH)/2,storeData(Uint32Array.from([...buckets.values()].flatMap(column=>[...column.values()].flatMap(houses=>houses.map(house=>house.province)))))]);

geometryReady=true;
