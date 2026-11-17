import {MAP} from './map.ts';
import type {Army,GameState,Unit} from './types.ts';

/** Unit id → army id for troops still queued at their source region. */
function queuedMembers(s:Pick<GameState,'provinces'>):Map<number,number>{
 const queued=new Map<number,number>();
 for(const province of s.provinces){const order=province.march;if(order?.army!==undefined)for(const id of order.pendingIds)queued.set(id,order.army);}
 return queued;
}

/** The member closest to the army's destination; it carries the nameplate and decides merges. */
export interface ArmyLead {army:Army;members:number;lead:Unit|undefined;region:number}

/** Departed troops keep their army until they halt in a friendly region; queued troops belong to
 * it only while their source order lists them. Lead = the departed member nearest the target
 * (ties by unit id); an army still entirely queued is located at its source region. */
export function armyLeads(s:Pick<GameState,'armies'|'units'|'provinces'>):Map<number,ArmyLead>{
 const leads=new Map<number,ArmyLead>(),queued=queuedMembers(s);
 if(!s.armies.length)return leads;
 for(const army of s.armies)leads.set(army.id,{army,members:0,lead:undefined,region:-1});
 const best=new Map<number,number>();
 for(const u of s.units){
  if(u.army===undefined)continue;const entry=leads.get(u.army);
  if(!entry||entry.army.owner!==u.owner||(u.target===null&&queued.get(u.id)!==u.army))continue;
  entry.members++;
  if(u.target===null){if(entry.region<0&&!entry.lead)entry.region=u.province;continue;}
  const goal=MAP[entry.army.to].center,d=(u.x-goal.x)**2+(u.z-goal.z)**2,previous=best.get(u.army);
  if(previous===undefined||d<previous||(d===previous&&u.id<entry.lead!.id)){best.set(u.army,d);entry.lead=u;entry.region=u.province;}
 }
 return leads;
}

/** Per-tick upkeep: clear stale memberships, dissolve empty armies and merge armies of one
 * country that share a destination once their leads stand in the same region. */
export function settleArmies(s:GameState):void{
 if(!s.armies.length)return;
 const queued=queuedMembers(s),byId=new Map(s.armies.map(army=>[army.id,army]));
 for(const u of s.units){
  if(u.army===undefined)continue;const army=byId.get(u.army);
  if(!army||army.owner!==u.owner||(u.target===null&&queued.get(u.id)!==u.army))delete u.army;
 }
 const leads=armyLeads(s);let armies=s.armies.filter(army=>leads.get(army.id)!.members>0);
 const meeting=new Map<string,Army>(),merged=new Map<number,number>();
 for(const army of armies){
  const key=`${army.owner}:${army.to}:${leads.get(army.id)!.region}`,keep=meeting.get(key);
  if(!keep){meeting.set(key,army);continue;}
  keep.size+=army.size;merged.set(army.id,keep.id);
 }
 if(merged.size){
  armies=armies.filter(army=>!merged.has(army.id));
  for(const u of s.units)if(u.army!==undefined){const into=merged.get(u.army);if(into!==undefined)u.army=into;}
  // Replace queue objects so snapshot deltas see the new owner army.
  for(const province of s.provinces){const order=province.march;if(order?.army===undefined)continue;const into=merged.get(order.army);if(into!==undefined)province.march={...order,army:into};}
 }
 if(armies.length!==s.armies.length)s.armies=armies;
}
