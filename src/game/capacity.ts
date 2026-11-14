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
 * by filling a shared budget. Final destination reservations constrain training
 * only. An outgoing order does not free production room before it leaves. */
export function regionTroops(state:GameState,owner:number,region:number):number {
  return state.units.reduce((n,u)=>n+Number(u.owner===owner&&!u.transport?.embarked&&u.province===region),0);
}
export function regionReservations(state:GameState,owner:number,region:number):number {
  return state.units.reduce((n,u)=>n+Number(u.owner===owner&&u.destination===region&&u.province!==region),0);
}
