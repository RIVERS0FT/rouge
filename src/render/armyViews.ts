import {armyLeads} from '../game/armies.ts';
import type {ArmyFormation,GameState,Unit,Vec2} from '../game/types.ts';

/** One nameplate per army: its flag and current strength, carried by the lead battalion. */
export interface ArmyView {id:number;owner:number;count:number;ready?:number;to:number;lead?:Unit;region:number;position:Vec2;phase?:ArmyFormation['phase']}
export function armyViews(state:Pick<GameState,'armies'|'units'|'provinces'>):ArmyView[]{
 const views:ArmyView[]=[];
 for(const {army,members,lead,region} of armyLeads(state).values()){
  const f=army.formation,position=f?.position??lead;
  if(position&&members>0)views.push({id:army.id,owner:army.owner,count:members,to:army.to,lead,region:f?.phase==='enter'?army.to:region,position,phase:f?.phase,...(f?.phase==='assemble'?{ready:f.readyCount??0}:{})});
 }
 return views;
}

/** A regional battle as drawn on the map: every side still standing there, at their centroid. */
export interface BattleView {key:string;id:number;region:number;x:number;z:number;sides:{owner:number;count:number}[]}
/** Only fights with at least two sides present are shown; a quiet battle may linger in the
 * ledger for two days before it ends, but its badge disappears once one side is left.
 * One pass over units serves every battle (hundreds of AI fights at once). */
export function battleViews(state:Pick<GameState,'battles'|'units'>):BattleView[]{
 if(!state.battles.length)return [];
 const byRegion=new Map(state.battles.map(battle=>[battle.region,{battle,present:new Map<number,number>(),x:0,z:0,n:0,sides:new Set(battle.sides.map(side=>side.owner))}]));
 for(const u of state.units){
  const entry=byRegion.get(u.province);if(!entry||!entry.sides.has(u.owner)||u.transport?.embarked)continue;
  entry.present.set(u.owner,(entry.present.get(u.owner)??0)+1);entry.x+=u.x;entry.z+=u.z;entry.n++;
 }
 const views:BattleView[]=[];
 for(const {battle,present,x,z,n} of byRegion.values()){
  const sides=battle.sides.flatMap(side=>{const count=present.get(side.owner)??0;return count?[{owner:side.owner,count}]:[];});
  if(sides.length<2)continue;
  views.push({key:`battle:${battle.id}`,id:battle.id,region:battle.region,x:x/n,z:z/n,sides:sides.sort((a,b)=>b.count-a.count||a.owner-b.owner)});
 }
 return views;
}
