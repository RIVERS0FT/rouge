import {validGroupingState} from '../game/territoryEconomy.ts';
import {MAP_ID} from '../game/content.ts';
import type {GameState, Province, Unit} from '../game/types.ts';

/** Full state on connection; reliable ordered deltas thereafter. Static GIS never travels here. */
export interface SnapshotBase { campaign:string; tick:number; groupingRevision:number; provinces:Province[]; neutral?:Map<number,Unit> }
type NeutralChanges={updated:Unit[];removed:number[]};
export type StateFrame = {type:'state';state:GameState} | {
  type:'delta';campaign:string;baseTick:number;state:Omit<GameState,'provinces'|'grouping'>&{grouping?:GameState['grouping']};provinces:Province[];
  /** When present, state.units lists all non-neutral units; patch neutral units by ID. */
  neutral?:NeutralChanges;
};
const sameProvince=(a:Province,b:Province)=>a.id===b.id&&a.owner===b.owner&&a.production===b.production&&a.kind===b.kind&&a.recovery===b.recovery&&a.captor===b.captor&&a.capture===b.capture&&a.march===b.march&&a.lastMarchTick===b.lastMarchTick&&a.construction?.kind===b.construction?.kind&&a.construction?.level===b.construction?.level;
// Neutral guards are not assigned travel or transport orders. Fall back to a
// regular frame if one ever has a nonstandard order; no state is silently lost.
const regularNeutral=(u:Unit)=>u.target===null&&u.destination===null&&!u.travel&&!u.transport&&u.route.length===0;
const sameNeutral=(a:Unit,b:Unit)=>a.kind===b.kind&&a.x===b.x&&a.z===b.z&&a.hp===b.hp&&a.cooldown===b.cooldown&&a.province===b.province&&a.origin===b.origin;
export function encodeFrame(state:GameState,base:SnapshotBase|undefined,actor:number):{frame:StateFrame;base:SnapshotBase} {
  const players=state.players.map(p=>({...p,choices:p.id===actor?[...p.choices]:[]}));
  const delta=!!base&&base.campaign===state.campaign&&base.provinces.length===state.provinces.length;
  const previous=delta?base.neutral:undefined;
  const useSparse=state.units.every((u,i)=>u.id>(state.units[i-1]?.id??0)&&(u.owner>=0||regularNeutral(u)));
  const current=useSparse?new Map<number,Unit>():undefined,updated:Unit[]=[],removed:number[]=[],fieldUnits:Unit[]=[];
  if(current){
    for(const u of state.units){
      if(u.owner>=0){fieldUnits.push(u);continue;}
      const old=previous?.get(u.id);
      if(old&&sameNeutral(old,u))current.set(u.id,old);
      else{current.set(u.id,{...u});if(previous)updated.push(u);}
    }
    if(previous)for(const id of previous.keys())if(!current.has(id))removed.push(id);
  }
  let frame:StateFrame;
  if(!delta)frame={type:'state',state:{...state,players}};
  else {
    const {provinces,grouping,...rest}=state,sparse=!!previous&&!!current;
    frame={type:'delta',campaign:state.campaign,baseTick:base.tick,state:{...rest,players,...(sparse?{units:fieldUnits}:{}),...(grouping.revision!==base.groupingRevision?{grouping}:{})},provinces:provinces.filter((p,i)=>!sameProvince(p,base.provinces[i])),...(sparse?{neutral:{updated,removed}}:{})};
  }
  return {frame,base:{campaign:state.campaign,tick:state.tick,groupingRevision:state.grouping.revision,provinces:state.provinces.map(p=>({...p})),neutral:current}};
}
export function applyFrame(current:GameState|null,frame:StateFrame):GameState {
  if(frame.state.map!==MAP_ID||frame.state.version!==5||frame.state.spawnModel!=='single'||frame.state.neutralGarrisonModel!=='preplaced')throw new Error('incompatibleMap');
  if(frame.type==='state'){if(!validGroupingState(frame.state))throw new Error('invalidSnapshot');return frame.state;}
  if(!current||current.campaign!==frame.campaign||current.tick!==frame.baseTick||frame.state.map!==current.map)throw new Error('snapshotGap');
  const provinces=current.provinces.slice();
  for(const p of frame.provinces){if(!Number.isInteger(p.id)||p.id<0||p.id>=provinces.length)throw new Error('invalidSnapshot');provinces[p.id]=p;}
  const next={...frame.state,grouping:frame.state.grouping??current.grouping,provinces};
  if(frame.neutral){
    if(next.units.some(u=>u.owner<0))throw new Error('invalidSnapshot');
    const units=new Map<number,Unit>();
    for(const u of current.units)if(u.owner<0)units.set(u.id,u);
    for(const id of frame.neutral.removed)if(!units.delete(id))throw new Error('invalidSnapshot');
    for(const u of frame.neutral.updated){if(u.owner!==-1||!regularNeutral(u))throw new Error('invalidSnapshot');units.set(u.id,u);}
    for(const u of next.units){if(units.has(u.id))throw new Error('invalidSnapshot');units.set(u.id,u);}
    next.units=[...units.values()].sort((a,b)=>a.id-b.id);
  }
  if((frame.state.grouping||frame.provinces.some(p=>current.provinces[p.id].owner!==p.owner))&&!validGroupingState(next))throw new Error('invalidSnapshot');
  return next;
}
