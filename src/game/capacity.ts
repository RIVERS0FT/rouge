import { PROVINCE_CAP } from './content.ts';
import type { GameState } from './types.ts';

/** Physical occupants include stationary, marching and fighting battalions.
 * Hostile factions are counted separately, so enemies cannot deny entry simply
 * by filling a shared cap. A final destination slot is reserved while en route. */
export function regionTroops(state:GameState,owner:number,region:number):number {
  return state.units.reduce((n,u)=>n+Number(u.owner===owner&&!u.transport?.embarked&&u.province===region),0);
}
export function regionReservations(state:GameState,owner:number,region:number):number {
  return state.units.reduce((n,u)=>n+Number(u.owner===owner&&u.destination===region&&u.province!==region),0);
}
export function destinationRoom(state:GameState,owner:number,region:number):number {
  return Math.max(0,PROVINCE_CAP-regionTroops(state,owner,region)-regionReservations(state,owner,region));
}
