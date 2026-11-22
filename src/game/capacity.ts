import type { GameState, Unit } from './types.ts';

/** A garrison is ready for a new order, not merely inside a region's border.
 * Issuing an order removes it immediately, including while fighting en route
 * or embarked. Friendly arrival / completed capture clears the active order. */
export function isRegionGarrison(unit:Unit,owner:number,region:number):boolean {
  return unit.owner===owner&&unit.province===region&&unit.target===null&&!unit.armyStatus&&!unit.travel&&!unit.transport?.embarked;
}
export function regionGarrison(state:GameState,owner:number,region:number):number {
  return state.units.reduce((n,u)=>n+Number(isRegionGarrison(u,owner,region)),0);
}

/** The town a battalion is inside. Queued members leave individually during assembly. */
function townOf(u:Unit):number {
  if(u.armyStatus==='queued'||u.armyStatus==='inside')return u.province;
  return isRegionGarrison(u,u.owner,u.province)?u.province:-1;
}
export function regionTroops(state:GameState,owner:number,region:number):number {
  return state.units.reduce((n,u)=>n+Number(u.owner===owner&&townOf(u)===region),0);
}
export function regionReservations(state:GameState,owner:number,region:number):number {
  return state.units.reduce((n,u)=>n+Number(u.owner===owner&&u.destination===region&&townOf(u)!==region),0);
}

/** Training uses the town's own occupants and friendly incoming orders. */
export function trainingSlots(state:Pick<GameState,'provinces'|'units'>) {
  const stationed=new Uint32Array(state.provinces.length),reserved=new Uint32Array(state.provinces.length);
  for(const unit of state.units){
    if(unit.owner<0)continue;
    const town=townOf(unit),to=unit.destination;
    if(town>=0&&state.provinces[town].owner===unit.owner)stationed[town]++;
    if(to!==null&&to!==town&&state.provinces[to].owner===unit.owner)reserved[to]++;
  }
  for(const province of state.provinces){
    const order=province.march;
    if(order?.reserved&&order.owner===province.owner&&state.provinces[order.to].owner===order.owner)reserved[order.to]+=order.pendingIds.length;
  }
  return {stationed,reserved};
}
