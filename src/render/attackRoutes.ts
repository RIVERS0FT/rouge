import type {ArmyFormation,GameState,Unit,Vec2} from '../game/types.ts';
import type {TravelPlan} from '../game/terrain-navigation.ts';

export interface AttackRoute {owner:number;from:number;to:number;units:number;segment?:string;start?:Vec2;end?:Vec2}
type Order={owner:number;from:number;to:number;units:number;formation?:ArmyFormation;travel?:TravelPlan;position?:Vec2};
const cell=(p:Vec2)=>Math.round(p.x/2)+','+Math.round(p.z/2);
const dist2=(a:Vec2,b:Vec2)=>(a.x-b.x)**2+(a.z-b.z)**2;
const samePoint=(a?:Vec2,b?:Vec2)=>a===b||!!a&&!!b&&a.x===b.x&&a.z===b.z;

/** Merge overlapping, forward-going legs, even when their armies have different
 * destinations. Use the actual rearmost endpoint; grid coordinates only index the lanes. */
function addLeg(routes:Map<string,AttackRoute>,order:Order,start:Vec2,end:Vec2,previous:Vec2){
 if(dist2(start,end)<.0001)return;
 const direction=Math.round(Math.atan2(end.z-start.z,end.x-start.x)*16/Math.PI);
 const segment=order.owner+':'+cell(previous)+'>'+cell(end)+':'+(direction&31);
 const existing=routes.get(segment);
 if(existing){
  existing.units+=order.units;
  if(dist2(start,end)>dist2(existing.start!,existing.end!)){existing.start=start;existing.end=end;}
 }else routes.set(segment,{owner:order.owner,from:order.from,to:order.to,units:order.units,segment,start,end});
}

export class AttackRouteTracker {
 private retired=new Map<number,string>();private campaign='';private tick=-1;
 private previous:AttackRoute[]=[];
 read(state:GameState):AttackRoute[]{
  if(state.campaign!==this.campaign||state.tick<this.tick)this.retired.clear();
  this.campaign=state.campaign;this.tick=state.tick;
  const formations=new Map((state.armies??[]).filter(a=>a.formation).map(a=>[a.id,a.formation!]));
  const orders=new Map<string,Order>(),alive=new Set<number>(),associated=new Set<number>();
  const add=(owner:number,from:number,to:number,id:number,army?:number,unit?:Unit)=>{
   const target=state.provinces[to];
   if(owner<0||from===to||!target||target.owner===owner)return;
   const key=owner+':'+from+':'+to;associated.add(id);
   if(target.captor===owner&&target.capture>0){this.retired.set(id,key);return;}
   if(this.retired.get(id)===key)return;
   this.retired.delete(id);
   const formation=army===undefined?undefined:formations.get(army);
   const group=formation?'a'+army:unit?.travel?'u'+id:key;
   const existing=orders.get(group);
   if(existing)existing.units++;
   else orders.set(group,{owner,from,to,units:1,formation,travel:unit?.travel,position:unit});
  };
  for(const u of state.units){
   if(u.hp<=0)continue;alive.add(u.id);
   if(u.assault!==undefined&&u.target===u.assault)add(u.owner,u.origin,u.assault,u.id,u.army,u);
  }
  for(const p of state.provinces){
   const order=p.march;if(!order||order.owner!==p.owner||order.reserved)continue;
   for(const id of order.pendingIds)if(alive.has(id))add(order.owner,p.id,order.to,id,order.army);
  }
  for(const id of this.retired.keys())if(!associated.has(id))this.retired.delete(id);
  const routes=new Map<string,AttackRoute>();
  for(const order of orders.values()){
   const {formation:f,owner,from,to,units}=order,plan=f?.route??order.travel;
   if(!plan){routes.set(owner+':'+from+':'+to,{owner,from,to,units});continue;}
   let start=f?.position??order.position!,previous:Vec2=plan.points[plan.index-1];
   // A local bypass temporarily leaves the planned leg and rejoins at its next waypoint.
   if(f?.yieldPoint){addLeg(routes,order,start,f.yieldPoint,start);start=f.yieldPoint;previous=start;}
   for(const p of f?.detour??[]){addLeg(routes,order,start,p,start);start=p;previous=p;}
   for(let i=plan.index;i<plan.points.length;i++){
    const end=plan.points[i];
    addLeg(routes,order,start,end,previous);start=end;previous=end;
   }
  }
  const result=[...routes.values()];
  if(result.length===this.previous.length&&result.every((r,i)=>{
   const p=this.previous[i];return r.owner===p.owner&&r.from===p.from&&r.to===p.to&&r.units===p.units&&r.segment===p.segment&&samePoint(r.start,p.start)&&samePoint(r.end,p.end);
  }))return this.previous;
  return this.previous=result;
 }
}
export function attackRoutes(state:GameState):AttackRoute[]{return new AttackRouteTracker().read(state);}
