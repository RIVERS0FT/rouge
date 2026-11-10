import {MAP,TERRITORY_TOPOLOGY,INITIAL_TERRITORY_GROUPING} from './map.ts';
import {territoryTotals} from './territoryGrouping.ts';
import {allocateAtomBudgets,atomCapacity,atomProductionRate,runtimeLedger,commandGrouping,reconcileRuntimeGrouping,validateRuntimeGrouping,type GroupedRuntimeState} from './territoryRuntime.ts';

/** NEW MAP BALANCE: each initial playable group receives max(12, atom count)
 * capacity and one total production rate. This is NOT identical to the old map's
 * total budget. At least one slot per playable atom keeps every atom conquerable.
 * Allocation is immutable: later merge/split/capture never recomputes a budget. */
export const ATOM_BUDGETS=allocateAtomBudgets(TERRITORY_TOPOLOGY,INITIAL_TERRITORY_GROUPING.groups.map(g=>g.atoms),12,1,1);
export function regionCapacity(region:number):number{return Number.isInteger(region)&&MAP[region]?atomCapacity(ATOM_BUDGETS,MAP[region].code):0;}
export function regionProductionRate(region:number):number{return Number.isInteger(region)&&MAP[region]?atomProductionRate(ATOM_BUDGETS,MAP[region].code):0;}
export function applyGroupingCommand(state:GroupedRuntimeState,actor:number,input:unknown){return commandGrouping(TERRITORY_TOPOLOGY,ATOM_BUDGETS,state,actor,input);}
export function reconcileGrouping(state:GroupedRuntimeState){return reconcileRuntimeGrouping(TERRITORY_TOPOLOGY,ATOM_BUDGETS,state);}
export function validGroupingState(state:Pick<GroupedRuntimeState,'grouping'|'provinces'>):boolean{return validateRuntimeGrouping(TERRITORY_TOPOLOGY,state);}
export function groupTotals(state:GroupedRuntimeState,groupId:string){
 const group=state.grouping.groups.find(g=>g.id===groupId);if(!group)return null;
 return territoryTotals(TERRITORY_TOPOLOGY,runtimeLedger(TERRITORY_TOPOLOGY,ATOM_BUDGETS,state),group.atoms);
}
