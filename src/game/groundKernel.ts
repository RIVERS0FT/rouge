import {KERNEL_BYTES} from '../generated/simulationKernel.ts';
import {BALANCE} from './balance.ts';
import {UNIT_RADIUS,type CircleBody,type CollisionReport} from './collision.ts';
import type {Unit} from './types.ts';
// Type-only: map.ts imports this module, so it must not load talent rules (which read the map) at runtime.
import type {CombatLanes} from './talentEffects.ts';
export const kernel=new WebAssembly.Instance(new WebAssembly.Module(KERNEL_BYTES),{host:{push(){throw Error('Generic callback unavailable in ground kernel');},hypot2:Math.hypot,sin:Math.sin,cos:Math.cos,atan2:Math.atan2}}).exports as any;
let nativeNorm=true,checkSeed=17;
for(let i=0;i<2048;i++){checkSeed=Math.imul(checkSeed,1664525)+1013904223|0;const a=(checkSeed/2147483648)*10**((i%600)-300);checkSeed=Math.imul(checkSeed,1664525)+1013904223|0;const b=(checkSeed/2147483648)*10**(((i*7)%600)-300);if(!Object.is(kernel.scaledNorm(a,b),Math.hypot(a,b))){nativeNorm=false;break;}}
kernel.configureMath(nativeNorm);
// Combat numbers for the WASM path. talentEffects.ts gives the JS fallback the same balance.ts entries.
{
 const T=BALANCE.talents,C=BALANCE.combat;
 if(![C.splashTargets,T.wideSalvo.targets].every(n=>Number.isInteger(n)&&n>=0&&n<=4))throw Error('balance.ts: splash target counts must be whole numbers from 0 to 4');
 kernel.configureCombat(T.forwardMarksmen.damageBonus,T.barrage.damageBonus,T.pointBlank.damageBonus,T.pointBlank.range*T.pointBlank.range,
  C.splashDamage,T.grenadeVolley.splashDamage,T.breakthrough.splashDamage,T.cuirass.splashTaken,C.splashTargets,T.wideSalvo.targets);
}
const memoryGiB=typeof navigator==='undefined'?0:(navigator as Navigator&{deviceMemory?:number}).deviceMemory??0;
kernel.configureNavigationCache(memoryGiB>=8?128:memoryGiB>=4?64:32);
let staticEnd=64*1024*1024;const geometryPointers:Record<string,number>={};
export function storeData(array:ArrayBufferView):number {
 const pointer=(staticEnd+7)&~7;staticEnd=pointer+array.byteLength;
 const pages=Math.ceil(staticEnd/65536),current=kernel.memory.buffer.byteLength/65536;if(pages>current)kernel.memory.grow(pages-current);
 new Uint8Array(kernel.memory.buffer,pointer,array.byteLength).set(new Uint8Array(array.buffer,array.byteOffset,array.byteLength));return pointer;
}
export function setupGeometry(name:string,values:number[]):void{const pointer=storeData(new Float64Array(values));geometryPointers[name]=pointer;kernel[name](pointer);kernel.reserveNavigationArena(staticEnd);}
export function separateGround<T extends CircleBody&{unit:Unit}>(input:readonly T[],tick:number):CollisionReport {
 if(!Number.isInteger(tick)||tick<0||tick>0xffffffff||input.some(body=>!Number.isSafeInteger(body.id)||body.id<1||body.id>0x7fffffff))throw Error('Unsupported native collision identifiers');
 if(!input.length)return {candidates:0,contacts:0,maxPenetration:0,limited:0,constraints:0,constraintLimited:0};
 let bodies=input;for(let i=1;i<input.length;i++)if(input[i].id<input[i-1].id){bodies=[...input].sort((a,b)=>a.id-b.id);break;}
 let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
 for(const b of bodies){const x=Math.floor(b.x/1.24),z=Math.floor(b.z/1.24);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}
 minX-=2;minZ-=2;maxX+=2;maxZ+=2;const cols=maxX-minX+1,cells=cols*(maxZ-minZ+1);let capacity=16;while(capacity<bodies.length)capacity*=2;
 if(cells>4000000||capacity>65536)throw Error('Unsupported ground bounds');
 const pointer=kernel.prepare(bodies.length,capacity,cells,cols,minX,minZ),buffer=kernel.memory.buffer;
 const x=new Float64Array(buffer,pointer,capacity),z=new Float64Array(buffer,pointer+capacity*8,capacity),radii=new Float64Array(buffer,pointer+capacity*16,capacity),ids=new Float64Array(buffer,pointer+capacity*24,capacity),mobility=new Float64Array(buffer,pointer+capacity*32,capacity),metadata=new Float64Array(buffer,kernel.groundPointer(),capacity*6);
 for(let i=0;i<bodies.length;i++){
  // Slot 0 holds the province of a resting body, or the direction a marching body moved this tick.
  const b=bodies[i],u=b.unit,travel=u.travel;x[i]=b.x;z[i]=b.z;radii[i]=b.radius;ids[i]=b.id;mobility[i]=b.mobility??1;metadata[i*6]=travel?b.motion??NaN:u.province;metadata[i*6+1]=Number(!!travel);
  if(travel){const a=travel.points[travel.index-1],end=travel.points[travel.index];metadata[i*6+2]=a.x;metadata[i*6+3]=a.z;metadata[i*6+4]=end.x;metadata[i*6+5]=end.z;}
 }
 kernel.solveGround(tick);let constraintLimited=0;const attempts=new Uint32Array(buffer,kernel.attemptsPointer(),capacity);
 for(let i=0;i<bodies.length;i++){bodies[i].x=x[i];bodies[i].z=z[i];if(attempts[i]>=12)constraintLimited++;}
 return {candidates:Number(kernel.candidates.value),contacts:Number(kernel.contacts.value),maxPenetration:Number(kernel.maxPenetration.value),limited:Number(kernel.limited.value),constraints:Number(kernel.constraints.value),constraintLimited};
}

let routePointer=0;const ROUTE_CAPACITY=64*1024*1024;
/** Routes and navigation are disjoint arenas after immutable geometry. */
export function initializeBattleMemory():number {
 if(!routePointer){routePointer=Math.ceil(staticEnd/65536)*65536;const end=routePointer+ROUTE_CAPACITY,pages=end/65536,current=kernel.memory.buffer.byteLength/65536;if(pages>current)kernel.memory.grow(pages-current);kernel.reserveNavigationArena(end);}
 return routePointer;
}
export function geometrySnapshot(){initializeBattleMemory();return {memory:kernel.memory.buffer.slice(64*1024*1024,staticEnd),pointers:geometryPointers,routePointer,routeCapacity:ROUTE_CAPACITY};}
const radii=UNIT_RADIUS;
function writeBattleUnit(data:Float64Array,i:number,unit:Unit,s:import('./content.ts').UnitStats,state:import('./types.ts').GameState):void {
 const base=i*32,travel=unit.travel,transport=unit.transport;data.fill(0,base,base+32);
  data[base]=unit.id;data[base+1]=unit.owner;data[base+2]=unit.x;data[base+3]=unit.z;data[base+4]=unit.hp;data[base+5]=Number(unit.kind==='engineer');data[base+6]=unit.province;data[base+7]=unit.target??-1;data[base+8]=unit.origin;data[base+9]=unit.destination??-1;data[base+10]=unit.cooldown;data[base+11]=travel?cachedPaths.get(travel.points)!:-1;data[base+12]=travel?.points.length??0;data[base+13]=travel?.index??0;data[base+14]=transport?1+Number(transport.embarked)*2:0;data[base+15]=transport?.from??0;data[base+16]=transport?.to??0;data[base+17]=transport?.index??0;
  data[base+22]=s.speed;data[base+23]=s.seaSpeed;data[base+24]=s.range;data[base+25]=s.attackSpeed;data[base+26]=s.attack;data[base+27]=s.splash;data[base+28]=s.defense;data[base+29]=radii[unit.kind];
}
let cachedPaths=new WeakMap<object,number>(),cachedPathLength=0,pathEpoch=0;const PATH_CAPACITY=64*1024*1024/8;
export function packBattleUnits(active:readonly Unit[],statsFor:(owner:number,kind:Unit['kind'])=>import('./content.ts').UnitStats,state:import('./types.ts').GameState,includeEmbarked=false,cache?:{data:Float64Array;rows:WeakMap<Unit,number>;pathEpoch:number;ordered?:readonly Unit[]},dirty?:{all:boolean;units:Set<Unit>;owners:Set<number>},lanes?:CombatLanes){
 const n=active.length;if(!n||n>65536)throw Error('Battle scratch capacity exceeded');
 const pointer=32*1024*1024,pathPointer=initializeBattleMemory(),buffer=kernel.memory.buffer,data=new Float64Array(buffer,pointer,n*32),paths=new Float64Array(buffer,pathPointer,PATH_CAPACITY);
 let missing=0,pathCount=0;for(const unit of active)if(unit.travel){const points=unit.travel.points;pathCount+=points.length*3;if(!cachedPaths.has(points))missing+=points.length*3;}
 if(cachedPathLength+missing>PATH_CAPACITY){cachedPaths=new WeakMap();cachedPathLength=0;pathEpoch++;}
 if(pathCount>PATH_CAPACITY)throw Error('Path arena capacity exceeded');
 for(const unit of active)if(unit.travel&&!cachedPaths.has(unit.travel.points)){const points=unit.travel.points;cachedPaths.set(points,cachedPathLength);for(const point of points){paths[cachedPathLength++]=point.x;paths[cachedPathLength++]=point.z;paths[cachedPathLength++]=Number(point.sea);}}
 let runAt=-1,runStart=0,runLength=0,previous=0;
 const flush=()=>{if(runLength){data.set(cache!.data.subarray(runAt*32,(runAt+runLength)*32),runStart*32);runLength=0;}};
 const canReuse=Boolean(cache&&cache.pathEpoch===pathEpoch&&!dirty?.all),checkUnits=Boolean(dirty?.units.size),checkOwners=Boolean(dirty?.owners.size);
 for(let i=0;i<n;i++){const unit=active[i];let oldRow:number|undefined;
  if(canReuse){if(cache!.ordered){while(previous<cache!.ordered.length&&cache!.ordered[previous].id<unit.id)previous++;if(cache!.ordered[previous]===unit)oldRow=previous;}else oldRow=cache!.rows.get(unit);}
  if(oldRow!==undefined&&(!checkUnits||!dirty!.units.has(unit))&&(!checkOwners||!dirty!.owners.has(cache!.data[oldRow*32+1]))){if(runLength&&oldRow===runAt+runLength)runLength++;else{flush();runAt=oldRow;runStart=i;runLength=1;}}
  else{flush();writeBattleUnit(data,i,unit,statsFor(unit.owner,unit.kind),state);}
 }flush();
 const owners=new Int32Array(buffer,kernel.provinceOwnersPointer(),state.provinces.length);for(let i=0;i<owners.length;i++)owners[i]=state.provinces[i].owner;
 writeCombatLanes(data,active,state,lanes);if(!kernel.buildUnitIndex(pointer,n,pathPointer,includeEmbarked))throw Error('Battle spatial capacity exceeded');
 return {data,paths:paths.subarray(0,cachedPathLength),pathEpoch,pointer,n,pathPointer};
}

/** Talent lanes (talentEffects.combatLanes, computed by the engine) are rewritten every tick,
 * including rows reused from the parallel cache: 18 combat mode bits, 30 damage-taken reduction,
 * 31 damage-dealt bonus and 22 conditional land speed. Without lanes, rows carry no talent effects. */
function writeCombatLanes(data:Float64Array,active:readonly Unit[],state:import('./types.ts').GameState,lanes?:CombatLanes):void {
 const engaged=new Set(state.armies.filter(army=>army.formation?.engaged).map(army=>army.id));
 for(let i=0;i<active.length;i++){
  const base=i*32,status=active[i].armyStatus,value=lanes?.speed[i];
  // The high bits describe army-controlled movement, collision and capture.
  const formation=status?64|(status==='formed'||status==='queued'||status==='inside'&&!engaged.has(active[i].army!)?128:0)|(status==='formed'||status==='field'?256:0):0;
  data[base+18]=(lanes?.mode[i]??0)|formation;data[base+30]=lanes?.taken[i]??0;data[base+31]=lanes?.dealt[i]??0;
  if(value!==undefined&&value===value)data[base+22]=value;
 }
}
export function commitBattleUnits(active:readonly Unit[],data:Float64Array,damage:Map<number,{amount:number;attacker:number}>,normalizeCache=false):void {
 for(let i=0;i<active.length;i++){
  const unit=active[i],base=i*32,flags=data[base+19];unit.x=data[base+2];unit.z=data[base+3];unit.province=data[base+6];unit.cooldown=data[base+10];
  if(flags&8)unit.lastShotHeading=data[base+31];
  if(flags&4){delete unit.army;delete unit.travel;delete unit.transport;if(unit.assault!==unit.province)delete unit.assault;unit.target=null;unit.destination=null;unit.route=[];unit.origin=unit.province;}
  else{if(flags&1)delete unit.travel;else if(unit.travel)unit.travel.index=data[base+13];if(data[base+14]){const transport=unit.transport;if(transport){transport.from=data[base+15];transport.to=data[base+16];transport.index=data[base+17];transport.embarked=!!(data[base+14]&2);}else unit.transport={from:data[base+15],to:data[base+16],index:data[base+17],embarked:!!(data[base+14]&2)};}else if(flags&2)delete unit.transport;}
  if(data[base+20])damage.set(unit.id,{amount:data[base+20],attacker:data[base+21]});
  if(normalizeCache){data[base+4]-=data[base+20];data[base+19]=data[base+20]=data[base+21]=0;}
 }
}
export function updateBattleUnits(active:readonly Unit[],statsFor:(owner:number,kind:Unit['kind'])=>import('./content.ts').UnitStats,state:import('./types.ts').GameState,damage:Map<number,{amount:number;attacker:number}>,lanes?:CombatLanes):void {
 if(!active.length)return;const p=packBattleUnits(active,statsFor,state,false,undefined,undefined,lanes);kernel.updateBattalions();commitBattleUnits(active,p.data,damage);
}

export interface UnitCensus {counts:Uint32Array;occupants:Uint32Array;nearOwner:Int32Array;engineers:Uint8Array}
export function physicsCensus(provinces:number,players:number):UnitCensus {
 const base=kernel.unitCensus(provinces,players);if(!base)throw Error('Census capacity exceeded');const buffer=kernel.memory.buffer,count=(players+1)*provinces,occupants=base+count*4,nearOwner=occupants+provinces*4,engineers=nearOwner+provinces*4;
 return {counts:new Uint32Array(buffer,base,count),occupants:new Uint32Array(buffer,occupants,provinces),nearOwner:new Int32Array(buffer,nearOwner,provinces),engineers:new Uint8Array(buffer,engineers,provinces)};
}
export function blockedByBuildings(units:readonly Unit[]):Unit[] {
 const input=new Float64Array(kernel.memory.buffer,32*1024*1024,units.length*3),out=48*1024*1024;
 for(let i=0;i<units.length;i++){const unit=units[i];input[i*3]=unit.x;input[i*3+1]=unit.z;input[i*3+2]=unit.transport?.embarked&&unit.travel?.points[unit.travel.index]?.sea!==false?-1:radii[unit.kind];}
 const count=kernel.blockedBuildings(input.byteOffset,units.length,out),indices=new Uint32Array(kernel.memory.buffer,out,count),result:Unit[]=[];for(const index of indices)result.push(units[index]);return result;
}
