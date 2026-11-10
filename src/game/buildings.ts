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
const cell=4,buckets=new Map<string,Building[]>();
for(const b of BUILDINGS){const k=`${Math.floor(b.x/cell)}:${Math.floor(b.z/cell)}`,list=buckets.get(k)??[];list.push(b);buckets.set(k,list);}
function nearby(a:Vec2,b:Vec2,r:number):Building[]{
 const out:Building[]=[];r+=Math.hypot(HOUSE_WIDTH,HOUSE_DEPTH)/2;
 for(let x=Math.floor((Math.min(a.x,b.x)-r)/cell);x<=Math.floor((Math.max(a.x,b.x)+r)/cell);x++)for(let z=Math.floor((Math.min(a.z,b.z)-r)/cell);z<=Math.floor((Math.max(a.z,b.z)+r)/cell);z++)out.push(...(buckets.get(`${x}:${z}`)??[]));
 return out;
}
function local(b:Building,p:Vec2):Vec2 {const x=p.x-b.x,z=p.z-b.z,c=Math.cos(b.rotation),s=Math.sin(b.rotation);return{x:c*x-s*z,z:s*x+c*z};}
export function buildingClearance(p:Vec2,radius:number):number {
 let gap=radius;
 for(const b of nearby(p,p,radius)){const q=local(b,p);gap=Math.min(gap,Math.hypot(Math.max(0,Math.abs(q.x)-HOUSE_WIDTH/2),Math.max(0,Math.abs(q.z)-HOUSE_DEPTH/2)));}
 return gap;
}
/** Swept-circle test, conservatively using the expanded oriented rectangle.
 * Tests the entire step, so fast cavalry cannot tunnel between clear endpoints. */
export function buildingSegment(a:Vec2,b:Vec2,radius:number):boolean {
 for(const house of nearby(a,b,radius)){
  const p=local(house,a),q=local(house,b),extents=[HOUSE_WIDTH/2+radius,HOUSE_DEPTH/2+radius];let lo=0,hi=1;
  for(const [start,end,extent] of [[p.x,q.x,extents[0]],[p.z,q.z,extents[1]]]){
   const d=end-start;if(Math.abs(d)<1e-12){if(Math.abs(start)>=extent-1e-8){hi=-1;break;}}else{const t1=(-extent-start)/d,t2=(extent-start)/d;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}
  }
  if(lo<hi-1e-9&&hi>1e-9&&lo<1-1e-9)return false;
 }
 return true;
}
/** A small local visibility graph around existing towns. The terrain flow field
 * remains authoritative; callers constrain every candidate to its land corridor.
 * No persistent steering state: save/replay and array order stay deterministic. */
export function buildingStep(from:Vec2,goal:Vec2,radius:number,step:number,legal:(a:Vec2,b:Vec2)=>boolean):Vec2 {
 const dist=(a:Vec2,b:Vec2)=>Math.hypot(a.x-b.x,a.z-b.z);
 const advance=(to:Vec2)=>{const d=dist(from,to),f=d?Math.min(step/d,1):0;return{x:from.x+(to.x-from.x)*f,z:from.z+(to.z-from.z)*f};};
 // Bound local work even when a route crosses a continent.
 const d=dist(from,goal),scale=d?Math.min(5/d,1):0,target={x:from.x+(goal.x-from.x)*scale,z:from.z+(goal.z-from.z)*scale},direct=advance(goal);
 // Keep following the detour until the whole local connection is clear,
 // rather than being pulled back toward the blocked centerline each tick.
 if((buildingSegment(from,target,radius)||!buildingSegment(target,target,radius))&&buildingSegment(from,direct,radius)&&legal(from,direct))return direct;
 const towns=[...new Set(nearby(from,target,radius+.5).map(b=>b.province))].slice(0,4);
 const nodes:Vec2[]=[from,target];
 for(const id of towns){const c=MAP[id].center,r=TOWN_OFFSET+Math.hypot(HOUSE_WIDTH,HOUSE_DEPTH)/2+Math.SQRT2*radius+.12;
  for(let i=0;i<16;i++){const a=i*Math.PI/8,p={x:c.x+Math.cos(a)*r,z:c.z+Math.sin(a)*r};if(buildingSegment(p,p,radius))nodes.push(p);}
 }
 const costs=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),done=new Set<number>();costs[0]=0;
 for(let k=0;k<nodes.length;k++){
  let current=-1;for(let i=0;i<nodes.length;i++)if(!done.has(i)&&(current<0||costs[i]<costs[current]))current=i;
  if(current<0||!Number.isFinite(costs[current]))break;if(current===1)break;done.add(current);
  for(let i=1;i<nodes.length;i++)if(!done.has(i)){
   const cost=costs[current]+dist(nodes[current],nodes[i]);
   if(cost>=costs[i]-1e-8||!buildingSegment(nodes[current],nodes[i],radius)||!legal(nodes[current],nodes[i]))continue;
   costs[i]=cost;previous[i]=current;
  }
 }
 if(previous[1]>=0){let i=1;while(previous[i]>0)i=previous[i];return advance(nodes[i]);}
 // A blocked objective is not a license to walk into a house or off an island.
 return from;
}
