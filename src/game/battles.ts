import {BALANCE} from './balance.ts';
import {DT} from './content.ts';
import type {Battle,GameState} from './types.ts';

/** A battle ends after `combat.battleQuietDays` campaign days without a hit in its region. */
export const BATTLE_QUIET_TICKS=Math.round(BALANCE.combat.battleQuietDays/DT);

/** Combat hits of one tick, grouped by the region of the unit that was hit. */
export class CombatLog {
 readonly regions=new Map<number,{owners:number[];losses:Map<number,number>}>();
 note(region:number,victim:number,attacker:number,killed:boolean):void {
  let entry=this.regions.get(region);if(!entry){entry={owners:[],losses:new Map()};this.regions.set(region,entry);}
  if(!entry.owners.includes(victim))entry.owners.push(victim);
  if(!entry.owners.includes(attacker))entry.owners.push(attacker);
  if(killed)entry.losses.set(victim,(entry.losses.get(victim)??0)+1);
 }
}

/** Fighting in a region opens one battle; every country drawn in later joins it as another side.
 * Quiet battles end, and those fought by at least two countries are reported with their winner. */
export function settleBattles(s:GameState,log:CombatLog):void{
 if(log.regions.size){
  const open=new Map(s.battles.map(battle=>[battle.region,battle]));
  for(const [region,entry] of log.regions){
   let battle=open.get(region);
   if(!battle){battle={id:s.nextBattle++,region,start:s.tick,last:s.tick,sides:[]};s.battles.push(battle);open.set(region,battle);}
   battle.last=s.tick;
   for(const owner of entry.owners)if(!battle.sides.some(side=>side.owner===owner))battle.sides.push({owner,losses:0});
   for(const [owner,lost] of entry.losses)battle.sides.find(side=>side.owner===owner)!.losses+=lost;
  }
 }
 if(!s.battles.some(battle=>s.tick-battle.last>=BATTLE_QUIET_TICKS))return;
 const ended=s.battles.filter(battle=>s.tick-battle.last>=BATTLE_QUIET_TICKS);
 s.battles=s.battles.filter(battle=>s.tick-battle.last<BATTLE_QUIET_TICKS);
 for(const battle of ended){
  if(battle.sides.filter(side=>side.owner>=0).length<2)continue;
  const winner=battleWinner(s,battle);
  if(winner>=0)s.events.push({tick:s.tick,key:'battle',player:winner,province:battle.region,sides:battle.sides.map(side=>side.owner)});
 }
}

/** The participating owner of the region, otherwise the country with the most troops left there. */
export function battleWinner(s:Pick<GameState,'provinces'|'units'>,battle:Battle):number{
 const owner=s.provinces[battle.region]?.owner??-1;
 if(owner>=0&&battle.sides.some(side=>side.owner===owner))return owner;
 const present=battlePresence(s,battle);let best=-1,most=0;
 for(const side of battle.sides)if(side.owner>=0&&(present.get(side.owner)??0)>most){most=present.get(side.owner)!;best=side.owner;}
 return best;
}
/** Troops of each side standing in the battle region (not at sea). */
export function battlePresence(s:Pick<GameState,'units'>,battle:Battle):Map<number,number>{
 const sides=new Set(battle.sides.map(side=>side.owner)),present=new Map<number,number>();
 for(const u of s.units)if(u.province===battle.region&&sides.has(u.owner)&&!u.transport?.embarked)present.set(u.owner,(present.get(u.owner)??0)+1);
 return present;
}
