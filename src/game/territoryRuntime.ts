import {applyTerritoryGrouping,reconcileTerritoryOwners,validateTerritoryGrouping,type TerritoryTopology,type TerritoryGrouping,type TerritoryLedger,type GroupingResult} from './territoryGrouping.ts';

export interface AtomBudget {readonly capacity:number;readonly productionRate:number;readonly initialGroup:string}
export type AtomBudgets=Readonly<Record<string,Readonly<AtomBudget>>>;
export interface RuntimeProvince {owner:number;production:number}
export interface RuntimeUnit {province:number;owner:number;transport?:{embarked:boolean}}
export interface GroupedRuntimeState {grouping:TerritoryGrouping;provinces:readonly RuntimeProvince[];units:readonly RuntimeUnit[]}
/** The initial partition, never the current editable grouping, assigns resources.
 * Repeated split/merge cannot mint capacity or production. Zero-capacity atoms are
 * valid accounts in exact-budget mode (minimumPerPlayableAtom=0). Production
 * callers can select minimumPerPlayableAtom=1 for a fixed initial group budget
 * max(capacity, playableAtomCount), avoiding impassable zero-capacity provinces.
 * Off-screen atoms receive zero budget; their geometry is retained for identity. */
export function allocateAtomBudgets(topology:TerritoryTopology,initialParts:readonly (readonly string[])[],capacity=12,productionRate=1,minimumPerPlayableAtom=0):AtomBudgets {
 if(!Number.isSafeInteger(capacity)||capacity<0||!Number.isFinite(productionRate)||productionRate<0||!Number.isSafeInteger(minimumPerPlayableAtom)||minimumPerPlayableAtom<0)throw Error('invalidBudget');
 const playable=new Set(topology.atoms.filter(a=>a.playable!==false).map(a=>a.id));
 const known=new Set(topology.atoms.map(a=>a.id)),seen=new Set<string>(),out:Record<string,AtomBudget>=Object.create(null);
 if(known.size!==topology.atoms.length||!known.size||!initialParts.length)throw Error('invalidBudget');
 for(const part of initialParts){
  if(!part.length)throw Error('invalidBudget');const ids=[...part].sort();
  for(const id of ids){if(!known.has(id)||seen.has(id))throw Error('invalidBudget');seen.add(id);}
  const active=ids.filter(id=>playable.has(id));
  const totalCapacity=active.length?Math.max(capacity,minimumPerPlayableAtom*active.length):0;
  if(!Number.isSafeInteger(totalCapacity))throw Error('invalidBudget');
  const quotient=active.length?Math.floor(totalCapacity/active.length):0,remainder=active.length?totalCapacity%active.length:0,share=active.length?productionRate/active.length:0;
  // The last share absorbs floating-point summation residue so each original
  // budget totals exactly its configured amount in canonical playable atom order.
  let allocated=0,index=0;
  for(const id of ids){
   if(!playable.has(id)){out[id]=Object.freeze({capacity:0,productionRate:0,initialGroup:`group:${ids[0]}`});continue;}
   const rate=index===active.length-1?productionRate-allocated:share;allocated+=rate;
   out[id]=Object.freeze({capacity:quotient+Number(index<remainder),productionRate:rate,initialGroup:`group:${ids[0]}`});index++;
  }
 }
 if(seen.size!==known.size)throw Error('invalidBudget');return Object.freeze(out);
}
export function atomCapacity(budgets:AtomBudgets,atom:string):number{return Object.hasOwn(budgets,atom)?budgets[atom].capacity:0;}
export function atomProductionRate(budgets:AtomBudgets,atom:string):number{return Object.hasOwn(budgets,atom)?budgets[atom].productionRate:0;}
/** Aggregation only: a mutable group's displayed totals are sums of immutable
 * accounts. Numeric province indices are mapped through topology.atoms order. */
export function runtimeLedger(topology:TerritoryTopology,budgets:AtomBudgets,state:Pick<GroupedRuntimeState,'provinces'|'units'>):TerritoryLedger {
 if(state.provinces.length!==topology.atoms.length)throw Error('invalidLedger');
 const troops=new Int32Array(topology.atoms.length);
 for(const u of state.units){if(!Number.isInteger(u.province)||u.province<0||u.province>=troops.length)throw Error('invalidLedger');if(!u.transport?.embarked)troops[u.province]++;}
 return Object.fromEntries(topology.atoms.map((a,i)=>{const p=state.provinces[i],budget=budgets[a.id];if(!budget||!p)throw Error('invalidLedger');return[a.id,{owner:p.owner,troops:troops[i],production:p.production,productionRate:budget.productionRate,capacity:budget.capacity}];}));
}
/** Return a replacement grouping only. Queues, ownership, armies, movement and
 * atomic progress are never reset by merge/split. Caller commits only on ok. */
export function commandGrouping(topology:TerritoryTopology,budgets:AtomBudgets,state:GroupedRuntimeState,actor:number,input:unknown):GroupingResult {
 let ledger:TerritoryLedger;try{ledger=runtimeLedger(topology,budgets,state);}catch{return{ok:false,error:'invalidLedger'};}
 return applyTerritoryGrouping(topology,state.grouping,ledger,actor,input);
}
export function reconcileRuntimeGrouping(topology:TerritoryTopology,budgets:AtomBudgets,state:GroupedRuntimeState):TerritoryGrouping {
 return reconcileTerritoryOwners(topology,state.grouping,runtimeLedger(topology,budgets,state));
}
/** New-map saves must contain a complete valid grouping and homogeneous owners.
 * Captures are reconciled by the engine before publishing/saving a frame. */
export function validateRuntimeGrouping(topology:TerritoryTopology,state:Pick<GroupedRuntimeState,'grouping'|'provinces'>):boolean {
 if(state.provinces.length!==topology.atoms.length||!validateTerritoryGrouping(topology,state.grouping))return false;
 const owner=new Map(topology.atoms.map((atom,i)=>[atom.id,state.provinces[i]?.owner]));
 return state.grouping.groups.every(g=>g.atoms.every(a=>Number.isInteger(owner.get(a))&&owner.get(a)!>=-1&&owner.get(a)===owner.get(g.atoms[0])));
}
