import type {GameState} from '../game/types.ts';

export interface AttackRoute {owner:number;from:number;to:number;units:number}
export class AttackRouteTracker {
 private retired=new Map<number,string>();private campaign='';private tick=-1;
 read(state:GameState):AttackRoute[]{
 if(state.campaign!==this.campaign||state.tick<this.tick)this.retired.clear();
 this.campaign=state.campaign;this.tick=state.tick;
/** Derive routes from authoritative orders, including troops fighting on arrival.
 * Reinforcements without an order never create or prolong an attack arrow. */
 const routes=new Map<string,AttackRoute>(),alive=new Set<number>(),associated=new Set<number>();
 const add=(owner:number,from:number,to:number,id:number)=>{
  const target=state.provinces[to];
  if(owner<0||from===to||!target||target.owner===owner)return;
  const key=`${owner}:${from}:${to}`;associated.add(id);
  if(target.captor===owner&&target.capture>0){this.retired.set(id,key);return;}
  if(this.retired.get(id)===key)return;
  this.retired.delete(id);const route=routes.get(key);
  if(route)route.units++;else routes.set(key,{owner,from,to,units:1});
 };
 for(const unit of state.units){
  if(unit.hp<=0)continue;alive.add(unit.id);
  if(unit.assault!==undefined&&unit.target===unit.assault)add(unit.owner,unit.origin,unit.assault,unit.id);
 }
 for(const province of state.provinces){
  const order=province.march;
  if(!order||order.owner!==province.owner||order.reserved)continue;
  for(const id of order.pendingIds)if(alive.has(id))add(order.owner,province.id,order.to,id);
 }
 for(const id of this.retired.keys())if(!associated.has(id))this.retired.delete(id);
 return [...routes.values()].sort((a,b)=>a.owner-b.owner||a.from-b.from||a.to-b.to);
 }
}
export function attackRoutes(state:GameState):AttackRoute[]{return new AttackRouteTracker().read(state);}
