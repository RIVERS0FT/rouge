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
 for(const army of s.armies)leads.set(army.id,{army,members:0,lead:undefined,region:army.formation?.from??-1});
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

/** Keep each dispatch's identity and remove empty armies and obsolete queues. */
export function settleArmies(s:GameState):void{
 if(!s.armies.length)return;
 const queued=queuedMembers(s),byId=new Map(s.armies.map(army=>[army.id,army]));
 const pendingUnits=new Map<number,Unit|undefined>();
 for(const province of s.provinces)if(province.march)for(const id of province.march.pendingIds)pendingUnits.set(id,undefined);
 const occupied=new Set<number>();
 for(const u of s.units){
  const pending=pendingUnits.has(u.id);
  if(pending)pendingUnits.set(u.id,u);
  if(u.army===undefined)continue;const army=byId.get(u.army);
   if(!army||army.owner!==u.owner||(u.target===null&&queued.get(u.id)!==u.army)){delete u.army;delete u.armyStatus;}
   else if(!pending)occupied.add(u.army);
 }
 const retained=new Map<number,number>();
 for(const province of s.provinces){
   const order=province.march;if(!order)continue;
   const pendingIds=province.owner===order.owner?order.pendingIds.filter(id=>pendingUnits.get(id)?.target===null):[];
   if(order.army!==undefined)for(const id of pendingIds)retained.set(id,order.army);
   if(!pendingIds.length)delete province.march;
   else if(pendingIds.length!==order.pendingIds.length)province.march={...order,pendingIds};
   if(province.owner!==order.owner)for(const id of order.pendingIds){const u=pendingUnits.get(id);if(u&&u.army===order.army){delete u.army;delete u.armyStatus;}}
 }
 for(const u of pendingUnits.values())if(u?.army!==undefined&&(u.target!==null||retained.get(u.id)===u.army))occupied.add(u.army);
 const armies=s.armies.filter(army=>occupied.has(army.id));
 if(armies.length!==s.armies.length)s.armies=armies;
}
