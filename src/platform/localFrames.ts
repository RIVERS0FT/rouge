import {KINDS,MAP_ID,STATE_VERSION} from '../game/content.ts';
import {validGroupingState} from '../game/territoryEconomy.ts';
import type {Army,GameState,Province,Unit} from '../game/types.ts';
import {applyArmyPaths,encodeArmyPaths,type ArmyPaths} from './replication.ts';

const WIDTH=22;
const memberStatuses=[undefined,'queued','formed','field','sea','inside'] as const;
const kindIndex=Object.fromEntries(KINDS.map((kind,index)=>[kind,index]));
type Path=NonNullable<Unit['travel']>;
type PathEntry={id:number;revision:string;points:Path['points']};
export interface LocalBase {campaign:string;tick:number;groupingRevision:number;provinces:Province[];paths:Map<number,Path>;armyPaths?:ArmyPaths;armies?:Map<number,Army>}
export interface LocalFrame {
 type:'local';full:boolean;campaign:string;baseTick:number;
 state:Omit<GameState,'units'|'provinces'|'grouping'>;
 provinces:Province[];grouping?:GameState['grouping'];
 units:Float64Array;paths:PathEntry[];routes:number[][];reusedArmyPaths?:number[];armyOrder?:number[];
}
// The worker replaces position/itinerary objects as formations move. Save
// the values of the mutable records, retaining the immutable route geometry.
function sameFields(a:object,b:object,except?:string,also?:string):boolean {
 const left=a as Record<string,unknown>,right=b as Record<string,unknown>;
 for(const key in left)if(!Object.hasOwn(right,key)||(key!==except&&key!==also&&left[key]!==right[key]))return false;
 for(const key in right)if(!Object.hasOwn(left,key))return false;
 return true;
}
function sameArmy(a:Army,b:Army):boolean {
 if(!sameFields(a,b,'formation'))return false;
 const f=a.formation,g=b.formation;
 return f&&g?sameFields(f,g,'position','route')&&sameFields(f.position,g.position)&&sameFields(f.route,g.route):f===g;
}
function captureArmy(a:Army):Army{
 const f=a.formation;return f?{...a,formation:{...f,position:{...f.position},route:{...f.route}}}:{...a};
}
function encodeLocalArmies(armies:Army[],base?:LocalBase){
 // For small ledgers a full list costs less than building a second index.
 if(armies.length<256)return {...encodeArmyPaths(armies,base?.armyPaths),snapshots:undefined,order:undefined};
 const snapshots=new Map<number,Army>(),changed:Army[]=[];
 for(const army of armies){
  const old=base?.armies?.get(army.id);
  if(old&&sameArmy(army,old))snapshots.set(army.id,old);
  else{snapshots.set(army.id,captureArmy(army));changed.push(army);}
 }
 const fleet=encodeArmyPaths(changed,base?.armyPaths);
 if(changed.length===armies.length)return {...fleet,snapshots,order:undefined};
 for(const army of snapshots.values())if(army.formation)fleet.paths.set(army.id,army.formation.route.points);
 return {...fleet,snapshots,order:armies.map(a=>a.id)};
}
const sameProvince=(a:Province,b:Province)=>a.id===b.id&&a.owner===b.owner&&a.production===b.production&&a.kind===b.kind&&a.recovery===b.recovery&&a.captor===b.captor&&a.capture===b.capture&&a.march===b.march&&a.lastMarchTick===b.lastMarchTick&&a.construction?.kind===b.construction?.kind&&a.construction?.level===b.construction?.level;
function writeUnit(data:Float64Array,at:number,u:Unit,routes:number[][]):void {
 const travel=u.travel,transport=u.transport;
 data[at]=u.id;data[at+1]=u.owner;data[at+2]=kindIndex[u.kind];data[at+3]=u.x;data[at+4]=u.z;data[at+5]=u.hp;data[at+6]=u.province;
 data[at+7]=u.target??-1;data[at+8]=u.origin;data[at+9]=u.destination??-1;data[at+10]=u.cooldown;data[at+11]=u.assault??0;
 data[at+12]=travel?.index??0;data[at+13]=transport?.from??0;data[at+14]=transport?.to??0;data[at+15]=transport?.index??0;data[at+16]=Number(transport?.embarked??false);
 data[at+17]=u.route.length?routes.push(u.route)-1:-1;
 data[at+18]=(travel?1:Object.hasOwn(u,'travel')?3:0)|(transport?4:Object.hasOwn(u,'transport')?12:0)|(u.assault!==undefined?16:Object.hasOwn(u,'assault')?48:0)|(u.army!==undefined?64:Object.hasOwn(u,'army')?192:0);
 data[at+19]=u.army??0;
 data[at+20]=memberStatuses.indexOf(u.armyStatus);
 data[at+21]=u.lastShotHeading??NaN;
}
export function encodeLocalFrame(s:GameState,base?:LocalBase):{frame:LocalFrame;base:LocalBase;transfer:ArrayBuffer[]} {
 const full=!base||base.campaign!==s.campaign||base.provinces.length!==s.provinces.length;
 const {units,provinces,grouping,...state}=s,data=new Float64Array(units.length*WIDTH),paths:PathEntry[]=[],routes:number[][]=[],current=new Map<number,Path>();
 const fleet=encodeLocalArmies(s.armies,full?undefined:base);
 for(let i=0;i<units.length;i++){
  const unit=units[i];writeUnit(data,i*WIDTH,unit,routes);
  if(unit.travel){const old=full?undefined:base!.paths.get(unit.id);if(!old||old.points!==unit.travel.points||old.revision!==unit.travel.revision)paths.push({id:unit.id,revision:unit.travel.revision,points:unit.travel.points});current.set(unit.id,{...unit.travel});}
 }
 return {frame:{type:'local',full,campaign:s.campaign,baseTick:base?.tick??s.tick,state:{...state,armies:fleet.records},provinces:full?provinces:provinces.filter((p,i)=>!sameProvince(p,base!.provinces[i])),...(full||grouping.revision!==base!.groupingRevision?{grouping}:{}),units:data,paths,routes,...(fleet.reused.length?{reusedArmyPaths:fleet.reused}:{}),...(fleet.order?{armyOrder:fleet.order}:{})},base:{campaign:s.campaign,tick:s.tick,groupingRevision:grouping.revision,provinces:provinces.map(p=>({...p})),paths:current,armyPaths:fleet.paths,armies:fleet.snapshots},transfer:[data.buffer]};
}
function readUnit(data:Float64Array,at:number,paths:Map<number,PathEntry|Path>,routes:number[][]):Unit {
 const id=data[at],kind=KINDS[data[at+2]],flags=data[at+18],route=data[at+17];if(!kind||!Number.isSafeInteger(id)||id<1||!Number.isInteger(flags)||flags<0||flags>255||((flags&2)&&!(flags&1))||((flags&8)&&!(flags&4))||((flags&32)&&!(flags&16))||((flags&128)&&!(flags&64))||!Number.isInteger(route)||route< -1||route>=routes.length)throw Error('invalidSnapshot');
 const u:Unit={id,owner:data[at+1],kind,x:data[at+3],z:data[at+4],hp:data[at+5],province:data[at+6],target:data[at+7]===-1?null:data[at+7],origin:data[at+8],destination:data[at+9]===-1?null:data[at+9],cooldown:data[at+10],route:route===-1?[]:routes[route]};
 if(flags&1){if(flags&2)u.travel=undefined;else{const path=paths.get(id);if(!path)throw Error('invalidSnapshot');u.travel={revision:path.revision,points:path.points,index:data[at+12]};}}
 if(flags&4)u.transport=flags&8?undefined:{from:data[at+13],to:data[at+14],index:data[at+15],embarked:Boolean(data[at+16])};
 if(flags&16)u.assault=flags&32?undefined:data[at+11];
 if(flags&64)u.army=flags&128?undefined:data[at+19];
 const status=data[at+20];if(!Number.isInteger(status)||status<0||status>=memberStatuses.length||status&&!u.army)throw Error('invalidSnapshot');
 if(status)u.armyStatus=memberStatuses[status];
 const heading=data[at+21];
 if(!Number.isNaN(heading)){
   if(Math.abs(heading)>Math.PI)throw Error('invalidSnapshot');
   u.lastShotHeading=heading;
 }
 return u;
}
export function applyLocalFrame(current:GameState|null,frame:LocalFrame):GameState {
 if(frame.state.map!==MAP_ID||frame.state.version!==STATE_VERSION||frame.state.spawnModel!=='single'||frame.state.neutralGarrisonModel!=='preplaced')throw Error('incompatibleMap');
 if(frame.state.campaign!==frame.campaign||!(frame.units instanceof Float64Array)||frame.units.length%WIDTH)throw Error('invalidSnapshot');
 if(!frame.full&&(!current||current.campaign!==frame.campaign||current.tick!==frame.baseTick))throw Error('snapshotGap');
 if(frame.full&&!frame.grouping)throw Error('invalidSnapshot');
 const provinces=frame.full?frame.provinces:current!.provinces.slice();
 if(!frame.full)for(const p of frame.provinces){if(!Number.isInteger(p.id)||p.id<0||p.id>=provinces.length)throw Error('invalidSnapshot');provinces[p.id]=p;}
 const paths=new Map<number,PathEntry|Path>();if(!frame.full)for(const u of current!.units)if(u.travel)paths.set(u.id,u.travel);
 const sent=new Set<number>();for(const path of frame.paths){if(sent.has(path.id))throw Error('invalidSnapshot');sent.add(path.id);paths.set(path.id,path);}
 const units:Unit[]=[],ids=new Set<number>(),travelIds=new Set<number>();for(let at=0;at<frame.units.length;at+=WIDTH){const u=readUnit(frame.units,at,paths,frame.routes);if(ids.has(u.id))throw Error('invalidSnapshot');ids.add(u.id);if(u.travel)travelIds.add(u.id);units.push(u);}
 for(const id of sent)if(!travelIds.has(id))throw Error('invalidSnapshot');
 const next:GameState={...frame.state,provinces,grouping:frame.grouping??current!.grouping,units};
 if(frame.reusedArmyPaths){if(!current||frame.full)throw Error('invalidSnapshot');next.armies=applyArmyPaths(next.armies,current.armies,frame.reusedArmyPaths);}
 if(frame.armyOrder){
  if(!current||frame.full)throw Error('invalidSnapshot');
  const previous=new Map(current.armies.map(a=>[a.id,a])),changed=new Map(next.armies.map(a=>[a.id,a]));
  if(changed.size!==next.armies.length)throw Error('invalidSnapshot');
  next.armies=frame.armyOrder.map(id=>{
   const army=changed.get(id)??previous.get(id);
   if(!army)throw Error('invalidSnapshot');
   previous.delete(id);changed.delete(id);return army;
  });
  if(changed.size)throw Error('invalidSnapshot');
 }
 if((frame.full||frame.grouping||frame.provinces.some(p=>current!.provinces[p.id].owner!==p.owner))&&!validGroupingState(next))throw Error('invalidSnapshot');return next;
}
