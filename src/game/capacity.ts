import {regionCapacity} from './territoryEconomy.ts';
import type { GameState, Unit } from './types.ts';

/** A garrison is ready for a new order, not merely inside a region's border.
 * Issuing an order removes it immediately, including while fighting en route
 * or embarked. Friendly arrival / completed capture clears the active order. */
export function isRegionGarrison(unit:Unit,owner:number,region:number):boolean {
  return unit.owner===owner&&unit.province===region&&unit.target===null&&!unit.travel&&!unit.transport?.embarked;
}
export function regionGarrison(state:GameState,owner:number,region:number):number {
  return state.units.reduce((n,u)=>n+Number(isRegionGarrison(u,owner,region)),0);
}

/** Physical occupants include stationary, marching and fighting battalions.
 * Hostile factions are counted separately, so enemies cannot deny entry simply
 * by filling a shared cap. A final destination slot is reserved while en route.
 * Keep this capacity ledger separate from the displayed/dispatchable garrison:
 * an outgoing order does not free physical room before it actually leaves. */
export function regionTroops(state:GameState,owner:number,region:number):number {
  return state.units.reduce((n,u)=>n+Number(u.owner===owner&&!u.transport?.embarked&&u.province===region),0);
}
export function regionReservations(state:GameState,owner:number,region:number):number {
  return state.units.reduce((n,u)=>n+Number(u.owner===owner&&u.destination===region&&u.province!==region),0);
}
export function destinationRoom(state:GameState,owner:number,region:number):number {
  return Math.max(0,regionCapacity(region)-regionTroops(state,owner,region)-regionReservations(state,owner,region));
}

/** Waiting troops still belong to the source's displayed garrison. A friendly
 * order nevertheless claims space for them until it is replaced or completes. */
export function queuedMarchReservations(state:GameState,owner:number,region:number,except?:number):number {
  return state.provinces.reduce((n,p)=>{
    const order=p.march;
    return n+(p.id!==except&&p.owner===owner&&order&&'pendingIds' in order&&order.owner===owner&&order.reserved&&order.to===region?order.pendingIds.length:0);
  },0);
}
