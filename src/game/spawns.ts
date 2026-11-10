import {MAP,INITIAL_TERRITORY_GROUPING} from './map.ts';
import {TerrainNavigator} from './terrain-navigation.ts';
import {KINDS,LEADERS} from './content.ts';
import type {GameState,PlayerSetup} from './types.ts';
/** Server/local-session-owned AI seats. A lobby client can request only a count. */
export function makeAISetups(count:number,seed=0):PlayerSetup[]{
 if(!Number.isInteger(count)||count<0||count>3)throw new Error('invalidAI');
 return Array.from({length:count},(_,i)=>({name:`AI ${i+1}`,leader:LEADERS[i%LEADERS.length],loadout:[KINDS[((seed>>>0)+i+1)%KINDS.length]],ai:true}));
}
function hash(seed:number,id:number):number{let x=(seed^Math.imul(id+1,0x9e3779b9))>>>0;x=Math.imul(x^(x>>>16),0x85ebca6b);x=Math.imul(x^(x>>>13),0xc2b2ae35);return(x^(x>>>16))>>>0;}
const cache=new Map<string,[number,number][]>();
const corridors=new Map<string,boolean>();
/** Equal starting resources, no country/flag/leader bias. Pick a seeded first
 * region, then maximize minimum projected distance to existing two-region seats.
 * Every selected pair must have a real bidirectional land corridor. */
export function chooseSpawnPairs(seed:number,count:number,state:GameState):[number,number][]{
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Number.isInteger(count)||count<2||count>4)throw new Error('invalidSetup');
 const groupOf=(id:number)=>INITIAL_TERRITORY_GROUPING.atomToGroup[MAP[id].code];
 const idsByCode=new Map(MAP.map(p=>[p.code,p.id]));
 const groupMembers=new Map(INITIAL_TERRITORY_GROUPING.groups.map(g=>[g.id,g.atoms.map(code=>idsByCode.get(code)!)]));
 const key=`${seed}:${count}`,cached=cache.get(key);if(cached)return cached.map(p=>[...p]);
 const nav=new TerrainNavigator(),pairs:[number,number][]=[],used=new Set<number>();
 // Tiny slivers are excluded from seats, not from the game map. No designated
 // country starts: all retained land regions with useful land neighbors qualify.
 const eligible=(id:number)=>MAP[id].playable&&groupMembers.get(groupOf(id))!.length<=12&&MAP[id].bounds.right-MAP[id].bounds.left>=6&&MAP[id].bounds.bottom-MAP[id].bounds.top>=6;
 const pool=MAP.filter(p=>eligible(p.id)&&p.neighbors.some(eligible));
 const reach=(a:number,b:number)=>{const key=`${a}:${b}`;if(corridors.has(key))return corridors.get(key)!;const plan=nav.plan(MAP[a].center,MAP[b].center),ok=!!plan&&plan.points.every(p=>!p.sea);corridors.set(key,ok);return ok;};
 for(let actor=0;actor<count;actor++){
  const distance=(id:number)=>pairs.length?Math.min(...pairs.flatMap(pair=>pair.map(other=>Math.hypot(MAP[id].center.x-MAP[other].center.x,MAP[id].center.z-MAP[other].center.z)))):0;
  const candidates=pool.filter(p=>!used.has(p.id)).sort((a,b)=>distance(b.id)-distance(a.id)||hash(seed,a.id)-hash(seed,b.id)||a.id-b.id);
  let selected:[number,number]|undefined;
  for(const p of candidates){
   const neighbors=p.neighbors.filter(n=>eligible(n)&&!used.has(n)&&groupOf(n)!==groupOf(p.id)).sort((a,b)=>distance(b)-distance(a)||hash(seed,a)-hash(seed,b)||a-b);
   const exit=(a:number,b:number)=>MAP[a].neighbors.some(n=>n!==b&&!used.has(n)&&groupOf(n)!==groupOf(a)&&groupOf(n)!==groupOf(b)&&eligible(n)&&reach(a,n)&&reach(n,a));
   const other=neighbors.find(n=>reach(p.id,n)&&reach(n,p.id)&&exit(p.id,n)&&exit(n,p.id));
   if(other!==undefined){selected=[p.id,other];break;}
  }
  if(!selected)throw new Error('noSpawnRegions');pairs.push(selected);selected.forEach(id=>groupMembers.get(groupOf(id))!.forEach(member=>used.add(member)));
 }
 if(cache.size>=32)cache.delete(cache.keys().next().value!);cache.set(key,pairs);return pairs.map(p=>[...p]);
}
