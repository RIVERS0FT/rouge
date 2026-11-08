import type { GameState, Province } from '../game/types.ts';

/** Full state on connection; reliable ordered deltas thereafter. Static GIS never travels here. */
export interface SnapshotBase { campaign:string; tick:number; provinces:Province[] }
export type StateFrame = {type:'state';state:GameState} | {
  type:'delta';campaign:string;baseTick:number;state:Omit<GameState,'provinces'>;provinces:Province[];
};
const sameProvince=(a:Province,b:Province)=>a.id===b.id&&a.owner===b.owner&&a.production===b.production&&a.kind===b.kind&&a.recovery===b.recovery&&a.captor===b.captor&&a.capture===b.capture;
export function encodeFrame(state:GameState,base:SnapshotBase|undefined,actor:number):{frame:StateFrame;base:SnapshotBase} {
  const players=state.players.map(p=>({...p,choices:p.id===actor?[...p.choices]:[]}));
  let frame:StateFrame;
  if(!base||base.campaign!==state.campaign||base.provinces.length!==state.provinces.length)frame={type:'state',state:{...state,players}};
  else {
    const {provinces,...rest}=state;
    frame={type:'delta',campaign:state.campaign,baseTick:base.tick,state:{...rest,players},provinces:provinces.filter((p,i)=>!sameProvince(p,base.provinces[i]))};
  }
  return {frame,base:{campaign:state.campaign,tick:state.tick,provinces:state.provinces.map(p=>({...p}))}};
}
export function applyFrame(current:GameState|null,frame:StateFrame):GameState {
  if(frame.type==='state')return frame.state;
  if(!current||current.campaign!==frame.campaign||current.tick!==frame.baseTick||frame.state.map!==current.map)throw new Error('snapshotGap');
  const provinces=current.provinces.slice();
  for(const p of frame.provinces){if(!Number.isInteger(p.id)||p.id<0||p.id>=provinces.length)throw new Error('invalidSnapshot');provinces[p.id]=p;}
  return {...frame.state,provinces};
}
