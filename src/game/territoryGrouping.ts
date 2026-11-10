/** Geometry-free grouping of COMPLETE immutable administrative atoms.
 * The same partition kernel creates locked preprocessed groups and editable
 * in-game groups. A group can be materialized as an atom at the next level.
 * Units, queues, production progress and capacity remain on gameplay atoms.
 * This module never redistributes or resets those resources. */
export interface TerritoryAtom {id:string;neighbors:readonly string[];playable?:boolean}
export interface TerritoryTopology {mapId:string;atoms:readonly TerritoryAtom[]}
export interface TerritoryGroup {id:string;atoms:string[];locked?:boolean}
export interface TerritoryGrouping {version:1;mapId:string;revision:number;lockedParts?:string[][];groups:TerritoryGroup[];atomToGroup:Record<string,string>}
export interface AtomAccount {owner:number;troops:number;production:number;productionRate:number;capacity:number}
export type TerritoryLedger=Readonly<Record<string,Readonly<AtomAccount>>>;
export interface TerritoryTotals {troops:number;production:number;productionRate:number;capacity:number}
export type GroupingCommand={type:'merge';mapId:string;expectedRevision:number;groups:string[]}|{type:'split';mapId:string;expectedRevision:number;group:string;atoms:string[]};
export type GroupingResult={ok:true;state:TerritoryGrouping;totals:TerritoryTotals;changedGroups:string[]}|{ok:false;error:'invalidGrouping'|'invalidLedger'|'invalidCommand'|'wrongMap'|'staleRevision'|'notOwner'|'notConnected'|'noChange'|'notPlayable'|'lockedGroup'};
const ordered=(ids:readonly string[])=>[...ids].sort();
const validId=(id:unknown):id is string=>typeof id==='string'&&id.length>0&&id.length<=160;
const unique=(ids:unknown):ids is string[]=>Array.isArray(ids)&&ids.every(validId)&&new Set(ids).size===ids.length;
const groupId=(atoms:readonly string[])=>`group:${ordered(atoms)[0]}`;
function graph(topology:TerritoryTopology):Map<string,readonly string[]> {
 if(!validId(topology.mapId)||!Array.isArray(topology.atoms)||!topology.atoms.length)throw Error('invalidGrouping');
 const map=new Map<string,readonly string[]>();
 for(const a of topology.atoms){if(!a||!validId(a.id)||(a.playable!==undefined&&typeof a.playable!=='boolean')||map.has(a.id)||!unique(a.neighbors)||a.neighbors.includes(a.id))throw Error('invalidGrouping');map.set(a.id,a.neighbors);}
 for(const[id,neighbors]of map)for(const n of neighbors)if(!map.get(n)?.includes(id))throw Error('invalidGrouping');
 return map;
}
function components(ids:readonly string[],map:Map<string,readonly string[]>):string[][] {
 const remaining=new Set(ids),out:string[][]=[];
 for(const start of ordered(ids))if(remaining.delete(start)){
  const found=[start];for(let i=0;i<found.length;i++)for(const next of map.get(found[i])??[])if(remaining.delete(next))found.push(next);
  out.push(ordered(found));
 }
 return out;
}
function partition(mapId:string,revision:number,parts:readonly (readonly string[])[],lockedParts:readonly (readonly string[])[]=[]):TerritoryGrouping {
 const locks=lockedParts.map(ordered),lockedKeys=new Set(locks.map(ids=>JSON.stringify(ids)));
 const groups=parts.map(atoms=>({id:groupId(atoms),atoms:ordered(atoms),locked:atoms.length===1||lockedKeys.has(JSON.stringify(ordered(atoms)))})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 return {version:1,mapId,revision,lockedParts:locks,groups,atomToGroup:Object.fromEntries(groups.flatMap(g=>g.atoms.map(a=>[a,g.id])))};
}
export function createTerritoryGrouping(topology:TerritoryTopology,parts?:readonly (readonly string[])[],options:{locked?:boolean}={}):TerritoryGrouping {
 const map=graph(topology),groups=parts??[...map.keys()].map(id=>[id]);
 const state=partition(topology.mapId,0,groups,options.locked?groups:[]);if(!validateTerritoryGrouping(topology,state))throw Error('invalidGrouping');return state;
}
export function validateTerritoryGrouping(topology:TerritoryTopology,value:unknown):value is TerritoryGrouping {
 try{
  const map=graph(topology),s=value as TerritoryGrouping;
  if(!s||s.version!==1||s.mapId!==topology.mapId||!Number.isSafeInteger(s.revision)||s.revision<0||!Array.isArray(s.groups)||!s.groups.length||!s.atomToGroup||typeof s.atomToGroup!=='object')return false;
  const seen=new Set<string>();
  for(const g of s.groups){if(!g||(g.locked!==undefined&&typeof g.locked!=='boolean')||!unique(g.atoms)||!g.atoms.length||g.id!==groupId(g.atoms)||components(g.atoms,map).length!==1)return false;
   for(const id of g.atoms){if(!map.has(id)||seen.has(id)||!Object.hasOwn(s.atomToGroup,id)||s.atomToGroup[id]!==g.id)return false;seen.add(id);}}
  if(s.lockedParts!==undefined){
   if(!Array.isArray(s.lockedParts))return false;
   const locked=new Set<string>();
   for(const part of s.lockedParts){if(!unique(part)||!part.length||components(part,map).length!==1)return false;const group=s.atomToGroup[part[0]];
    for(const id of part){if(!map.has(id)||locked.has(id)||s.atomToGroup[id]!==group)return false;locked.add(id);}}
   const keys=new Set(s.lockedParts.map(ids=>JSON.stringify(ordered(ids))));
   for(const g of s.groups)if(g.locked!==(g.atoms.length===1||keys.has(JSON.stringify(ordered(g.atoms)))))return false;
  }
  return seen.size===map.size&&Object.keys(s.atomToGroup).length===map.size;
 }catch{return false;}
}
export function territoryTotals(topology:TerritoryTopology,ledger:TerritoryLedger,atoms=topology.atoms.map(a=>a.id)):TerritoryTotals {
 if(!ledger||typeof ledger!=='object'||Object.keys(ledger).length!==topology.atoms.length||!unique(atoms))throw Error('invalidLedger');
 const totals={troops:0,production:0,productionRate:0,capacity:0};
 for(const id of ordered(atoms)){
  const a=Object.hasOwn(ledger,id)?ledger[id]:null;
  if(!a||!Number.isSafeInteger(a.owner)||a.owner< -1||!Number.isSafeInteger(a.troops)||!Number.isSafeInteger(a.capacity)||a.troops<0||a.capacity<0||![a.production,a.productionRate].every(v=>Number.isFinite(v)&&v>=0))throw Error('invalidLedger');
  for(const key of Object.keys(totals) as (keyof TerritoryTotals)[]){totals[key]+=a[key];if(!Number.isFinite(totals[key]))throw Error('invalidLedger');}
  if(!Number.isSafeInteger(totals.troops)||!Number.isSafeInteger(totals.capacity))throw Error('invalidLedger');
 }
 return totals;
}
/** All command fields are untrusted. actor and ledger must come from the server,
 * never from the request. Revision is checked against the latest authoritative state. */
export function applyTerritoryGrouping(topology:TerritoryTopology,state:TerritoryGrouping,ledger:TerritoryLedger,actor:number,input:unknown):GroupingResult {
 if(!validateTerritoryGrouping(topology,state))return {ok:false,error:'invalidGrouping'};
 let totals:TerritoryTotals;try{totals=territoryTotals(topology,ledger);}catch{return {ok:false,error:'invalidLedger'};}
 if(!input||typeof input!=='object'||!Number.isSafeInteger(actor)||actor<0)return {ok:false,error:'invalidCommand'};
 const c=input as GroupingCommand;
 if(c.mapId!==state.mapId)return {ok:false,error:'wrongMap'};
 if(!Number.isSafeInteger(c.expectedRevision)||c.expectedRevision<0)return {ok:false,error:'invalidCommand'};
 if(c.expectedRevision!==state.revision)return {ok:false,error:'staleRevision'};
 if(state.revision===Number.MAX_SAFE_INTEGER)return {ok:false,error:'invalidGrouping'};
 const map=graph(topology);let selected:TerritoryGroup[],parts:string[][];
 if(c.type==='merge'){
  if(!unique(c.groups)||c.groups.length<2)return {ok:false,error:'invalidCommand'};
  const requested=new Set(c.groups);selected=state.groups.filter(g=>requested.has(g.id));if(selected.length!==c.groups.length)return {ok:false,error:'invalidCommand'};
  const atoms=selected.flatMap(g=>g.atoms);if(components(atoms,map).length!==1)return {ok:false,error:'notConnected'};parts=[atoms];
 }else if(c.type==='split'){
  const g=state.groups.find(g=>g.id===c.group);
  if(!g||!unique(c.atoms)||!c.atoms.length||c.atoms.some(id=>!g.atoms.includes(id)))return {ok:false,error:'invalidCommand'};
  if((state.lockedParts??[]).some(part=>part.some(id=>c.atoms.includes(id))&&!part.every(id=>c.atoms.includes(id))))return {ok:false,error:'lockedGroup'};
  if(c.atoms.length===g.atoms.length)return {ok:false,error:'noChange'};
  selected=[g];const chosen=new Set(c.atoms);parts=[...components(c.atoms,map),...components(g.atoms.filter(id=>!chosen.has(id)),map)];
 }else return {ok:false,error:'invalidCommand'};
 const unplayable=new Set(topology.atoms.filter(a=>a.playable===false).map(a=>a.id));
 if(selected.some(g=>g.atoms.some(id=>unplayable.has(id))))return {ok:false,error:'notPlayable'};
 if(selected.some(g=>g.atoms.some(id=>ledger[id].owner!==actor)))return {ok:false,error:'notOwner'};
 const removed=new Set(selected.map(g=>g.id)),next=partition(state.mapId,state.revision+1,[...state.groups.filter(g=>!removed.has(g.id)).map(g=>g.atoms),...parts],state.lockedParts);
 return {ok:true,state:next,totals,changedGroups:ordered([...new Set([...removed,...parts.map(groupId)])])};
}
/** Call after a batch of captures, before accepting new grouping commands.
 * Different-owner components are separated without changing atomic resources. */
export function reconcileTerritoryOwners(topology:TerritoryTopology,state:TerritoryGrouping,ledger:TerritoryLedger):TerritoryGrouping {
 if(!validateTerritoryGrouping(topology,state))throw Error('invalidGrouping');territoryTotals(topology,ledger);
 for(const part of state.lockedParts??[])if(part.some(id=>ledger[id].owner!==ledger[part[0]].owner))throw Error('invalidLedger');
 const map=graph(topology),parts:string[][]=[];
 for(const g of state.groups){const owners=new Map<number,string[]>();for(const id of g.atoms){const owner=ledger[id].owner,list=owners.get(owner)??[];list.push(id);owners.set(owner,list);}for(const ids of owners.values())parts.push(...components(ids,map));}
 if(parts.length===state.groups.length)return state;
 if(state.revision===Number.MAX_SAFE_INTEGER)throw Error('invalidGrouping');return partition(state.mapId,state.revision+1,parts,state.lockedParts);
}
