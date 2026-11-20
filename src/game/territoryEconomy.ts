import {BALANCE} from './balance.ts';
import {MAP,TERRITORY_TOPOLOGY,INITIAL_TERRITORY_GROUPING} from './map.ts';
import {territoryTotals} from './territoryGrouping.ts';
import {allocateAtomBudgets,atomCapacity,atomProductionRate,runtimeLedger,commandGrouping,reconcileRuntimeGrouping,validateRuntimeGrouping,type GroupedRuntimeState} from './territoryRuntime.ts';
import {talentProfile} from './talentEffects.ts';
import type {GameState} from './types.ts';

/** Each locked gameplay region owns one production queue with the balance.ts rate and slots.
 * Raw administrative members have no separate gameplay accounts. Dynamic
 * merge/split keeps these fixed budgets rather than minting new resources. */
export const ATOM_BUDGETS=allocateAtomBudgets(TERRITORY_TOPOLOGY,INITIAL_TERRITORY_GROUPING.groups.map(g=>g.atoms),BALANCE.regions.slots,BALANCE.regions.production);
export function regionCapacity(region:number):number{return Number.isInteger(region)&&MAP[region]?atomCapacity(ATOM_BUDGETS,MAP[region].code):0;}
/** Training slots for a region under its current owner, including Grand Garrison, Human Wave and Conscription. */
export function capacityFor(state:Pick<GameState,'players'|'provinces'>,region:number):number{
 const province=state.provinces[region],owner=state.players[province.owner],base=regionCapacity(region);
 if(!owner)return base;const profile=talentProfile(owner);
 const barracks=profile.barracksCapacity&&province.construction?.kind==='barracks'?BALANCE.talents.conscription.slots[province.construction.level-1]:0;
 return Math.floor(base*profile.capacityFactor)+profile.capacityBonus+barracks;
}
export function regionProductionRate(region:number):number{return Number.isInteger(region)&&MAP[region]?atomProductionRate(ATOM_BUDGETS,MAP[region].code):0;}
export function applyGroupingCommand(state:GroupedRuntimeState,actor:number,input:unknown){return commandGrouping(TERRITORY_TOPOLOGY,ATOM_BUDGETS,state,actor,input);}
export function reconcileGrouping(state:GroupedRuntimeState){return reconcileRuntimeGrouping(TERRITORY_TOPOLOGY,ATOM_BUDGETS,state);}
export function validGroupingState(state:Pick<GroupedRuntimeState,'grouping'|'provinces'>):boolean{return validateRuntimeGrouping(TERRITORY_TOPOLOGY,state);}
export function groupTotals(state:GroupedRuntimeState,groupId:string){
 const group=state.grouping.groups.find(g=>g.id===groupId);if(!group)return null;
 return territoryTotals(TERRITORY_TOPOLOGY,runtimeLedger(TERRITORY_TOPOLOGY,ATOM_BUDGETS,state),group.atoms);
}
