import {stats} from '../game/content.ts';
import type {GameState,Unit} from '../game/types.ts';

export interface BattleContact {
 key:string;
 first:number; second:number;
 firstCount:number; secondCount:number;
 x:number; z:number;
}
type Cell={x:number;z:number;owner:number;mixed:boolean;ids:number[];left:number;right:number;top:number;bottom:number};
const CELL_WIDTH=8;
const cellKey=(x:number,z:number)=>x*4096+z;

/** Snapshot-derived contact, not an order or a province total. Same strict
 * distance and nearest-target tie break as the simulation's combat search.
 * Cooldown does not end a contact between attacks. No transport can fight. */
export function battleContacts(state:Pick<GameState,'units'|'players'>):BattleContact[]{
 const units=state.units,columns=new Map<number,Cell>(),ranges=new Map<number,Map<Unit['kind'],number>>();
 const nearestIds=new Int32Array(units.length);nearestIds.fill(-1);const squared=new Float64Array(units.length);
 let maxRange=0;
 for(let index=0;index<units.length;index++){
  const unit=units[index];if(unit.hp<=0||unit.transport?.embarked)continue;
  let kinds=ranges.get(unit.owner);if(!kinds){kinds=new Map();ranges.set(unit.owner,kinds);}
  let range=kinds.get(unit.kind);if(range===undefined){range=stats(state.players[unit.owner],unit.kind).range;kinds.set(unit.kind,range);maxRange=Math.max(maxRange,range);}
  squared[index]=range*range;
  const x=Math.floor(unit.x/CELL_WIDTH),z=Math.floor(unit.z/CELL_WIDTH),key=cellKey(x,z);
  let cell=columns.get(key);
  if(!cell){cell={x,z,owner:unit.owner,mixed:false,ids:[],left:unit.x,right:unit.x,top:unit.z,bottom:unit.z};columns.set(key,cell);}
  else {cell.mixed||=cell.owner!==unit.owner;cell.left=Math.min(cell.left,unit.x);cell.right=Math.max(cell.right,unit.x);cell.top=Math.min(cell.top,unit.z);cell.bottom=Math.max(cell.bottom,unit.z);}
  cell.ids.push(index);
 }
 if(ranges.size<2)return [];
 const firstOrCloser=(a:number,b:number,d:number)=>{
  if(d<squared[a]||(d===squared[a]&&nearestIds[a]>=0&&units[b].id<units[nearestIds[a]].id)){squared[a]=d;nearestIds[a]=b;}
 };
 const halo=Math.ceil(maxRange/CELL_WIDTH),maxSquared=maxRange*maxRange;
 for(const cell of columns.values())for(let dx=0;dx<=halo;dx++)for(let dz=dx?-halo:0;dz<=halo;dz++){
  const other=columns.get(cellKey(cell.x+dx,cell.z+dz));if(!other||(!cell.mixed&&!other.mixed&&cell.owner===other.owner))continue;
  const xGap=Math.max(0,other.left-cell.right,cell.left-other.right),zGap=Math.max(0,other.top-cell.bottom,cell.top-other.bottom);
  if(xGap*xGap+zGap*zGap>=maxSquared)continue;
  const same=cell===other;
  for(let i=0;i<cell.ids.length;i++){
   const a=cell.ids[i],u=units[a];
   for(let j=same?i+1:0;j<other.ids.length;j++){
    const b=other.ids[j],v=units[b];if(u.owner===v.owner)continue;
    const d=(u.x-v.x)**2+(u.z-v.z)**2;
    firstOrCloser(a,b,d);firstOrCloser(b,a,d);
   }
  }
 }
 const pairCombatants=new Map<string,{first:number;second:number;units:Map<number,Unit>;parent:Map<number,number>}>();
 for(let i=0;i<units.length;i++){
  const unit=units[i],nearest=units[nearestIds[i]];
  if(!nearest)continue;
  const rival=nearest,first=Math.min(unit.owner,rival.owner),second=Math.max(unit.owner,rival.owner),key=first+':'+second;
  let pair=pairCombatants.get(key);if(!pair){pair={first,second,units:new Map(),parent:new Map()};pairCombatants.set(key,pair);}
  pair.units.set(unit.id,unit);pair.units.set(rival.id,rival);
  const a=rootOf(pair.parent,unit.id),b=rootOf(pair.parent,rival.id);
  if(a!==b)pair.parent.set(Math.max(a,b),Math.min(a,b));
 }
 const result:BattleContact[]=[];
 for(const [key,pair] of pairCombatants){
  const components=new Map<number,BattleContact>();
  for(const unit of pair.units.values()){
   const root=rootOf(pair.parent,unit.id);
   let c=components.get(root);if(!c){c={key:key+':'+root,first:pair.first,second:pair.second,firstCount:0,secondCount:0,x:0,z:0};components.set(root,c);}
   if(unit.owner===pair.first)c.firstCount++;else c.secondCount++;
   c.x+=unit.x;c.z+=unit.z;
  }
  const local=[...components.values()];
  for(const c of local){const size=c.firstCount+c.secondCount;c.x/=size;c.z/=size;}
  // Two nearby private nearest-target graphs can be one local fight (two
  // adjacent duels). Coalesce same-side-pair components in world space before
  // decluttering screen badges, so a hidden duplicate cannot hide participants.
  const reach=1.25*Math.max(...[pair.first,pair.second].flatMap(owner=>[...(ranges.get(owner)?.values()??[])]));
  mergeNearby(local,reach,result);

 }
 return result;
}

function rootOf(parent:Map<number,number>,id:number):number{
 let root=id,next:number|undefined;
 while((next=parent.get(root))!==undefined)root=next;
 if(root!==id)parent.set(id,root);
 return root;
}

function mergeNearby(contacts:BattleContact[],reach:number,out:BattleContact[]){
 if(contacts.length<=1||reach<=0){out.push(...contacts);return;}
 const buckets=new Map<number,number[]>(),parent=new Map<number,number>(),limit=reach*reach;
 for(let i=0;i<contacts.length;i++){
  const a=contacts[i],x=Math.floor(a.x/reach),z=Math.floor(a.z/reach);
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const j of buckets.get(cellKey(x+dx,z+dz))??[]){
   const b=contacts[j];if((a.x-b.x)**2+(a.z-b.z)**2>limit)continue;
   const u=rootOf(parent,i),v=rootOf(parent,j);if(u!==v)parent.set(Math.max(u,v),Math.min(u,v));
  }
  const key=cellKey(x,z),cell=buckets.get(key);if(cell)cell.push(i);else buckets.set(key,[i]);
 }
 const combined=new Map<number,BattleContact>();
 for(let i=0;i<contacts.length;i++){
  const a=contacts[i],id=rootOf(parent,i),b=combined.get(id),weight=a.firstCount+a.secondCount;
  if(!b){combined.set(id,{...a,x:a.x*weight,z:a.z*weight});continue;}
  b.firstCount+=a.firstCount;b.secondCount+=a.secondCount;b.x+=a.x*weight;b.z+=a.z*weight;
 }
 for(const a of combined.values()){const weight=a.firstCount+a.secondCount;a.x/=weight;a.z/=weight;out.push(a);}
}
