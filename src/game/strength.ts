import {UNITS,stats,type UnitStats} from './content.ts';
import {combatLanes,secondaryMultiplier,secondaryTargets,talentProfile} from './talentEffects.ts';
import type {Battle,GameState,Kind,Player,Unit} from './types.ts';

/** Military strength estimates: the HUD shows them and AI countries plan with them (ai.ts);
 * combat rules never read them. Health is what a side can soak (current hp, defense, damage reduction); damage is what it
 * deals per day (attack, attack rate, damage bonuses, splash). Under Lanchester's square law
 * the side with the larger health × damage wins, so √(health × damage) is the size-like
 * figure: N identical battalions are worth N times one. A fresh, un-upgraded infantry
 * battalion is worth STRENGTH_PER_INFANTRY. Range and target-specific bonuses are left out. */
export interface Strength {units:number;health:number;damage:number;power:number}
export const STRENGTH_PER_INFANTRY=10;
/** Power ratios at or beyond these read as a clear edge; between them the fight is even. */
export const AHEAD_RATIO=1.25,BEHIND_RATIO=.8;

const splashFactor=(st:UnitStats,mode:number)=>st.splash>0?1+secondaryTargets(mode)*secondaryMultiplier(mode):1;
export const unitHealth=(hp:number,st:UnitStats,taken=0)=>hp*(100+st.defense)/100/(1-taken);
export const unitDamage=(st:UnitStats,mode:number,dealt=0)=>st.attack*st.attackSpeed*(1+dealt)*splashFactor(st,mode);
const BASE=Math.sqrt(unitHealth(UNITS.infantry.hp,UNITS.infantry)*unitDamage(UNITS.infantry,0));
export function strengthPower(health:number,damage:number):number{return health>0&&damage>0?Math.sqrt(health*damage)/BASE*STRENGTH_PER_INFANTRY:0;}

function statsCache(players:readonly Player[]){
 const cache=new Map<number,Map<Kind,UnitStats>>();
 return (owner:number,kind:Kind)=>{
  let byKind=cache.get(owner);if(!byKind){byKind=new Map();cache.set(owner,byKind);}
  let value=byKind.get(kind);if(!value){value=stats(owner>=0?players[owner]:undefined,kind);byKind.set(kind,value);}
  return value;
 };
}

/** Every country's whole army (indexed by player id), upgrades and stat talents included.
 * Situational modifiers (own territory, marching, encirclement…) are left out so the figure
 * stays steady while troops move; battleStrengths counts them for a fight in progress. */
export function countryStrengths(state:Pick<GameState,'players'|'units'>):Strength[]{
 const statsFor=statsCache(state.players),profiles=state.players.map(player=>talentProfile(player));
 const totals=state.players.map(():Strength=>({units:0,health:0,damage:0,power:0}));
 for(const u of state.units){
  const total=totals[u.owner];if(!total)continue;
  const st=statsFor(u.owner,u.kind),profile=profiles[u.owner],mode=profile.modeKind===u.kind?profile.mode:0;
  total.units++;total.health+=unitHealth(u.hp,st);total.damage+=unitDamage(st,mode);
 }
 for(const total of totals)total.power=strengthPower(total.health,total.damage);
 return totals;
}

export interface BattleSide extends Strength {owner:number;losses:number}
export interface BattleStrength {id:number;region:number;start:number;sides:BattleSide[]}
/** Fights with at least two sides standing in the region, each side measured on the spot:
 * the troops present (not at sea) with their current talent modifiers, as the engine applies
 * them this tick. Sides are strongest first. `include` limits the work to the battles needed. */
export function battleStrengths(state:GameState,include:(battle:Battle)=>boolean=()=>true):BattleStrength[]{
 const entries=new Map<number,{battle:Battle;sides:Map<number,BattleSide>}>();
 for(const battle of state.battles)if(include(battle))entries.set(battle.region,{battle,sides:new Map(battle.sides.map(side=>[side.owner,{owner:side.owner,losses:side.losses,units:0,health:0,damage:0,power:0}]))});
 if(!entries.size)return [];
 const present:Unit[]=[];
 for(const u of state.units)if(!u.transport?.embarked&&entries.get(u.province)?.sides.has(u.owner))present.push(u);
 if(!present.length)return [];
 // The lanes are reused buffers: read them before anything else calls combatLanes.
 const statsFor=statsCache(state.players),lanes=combatLanes(present,state,statsFor);
 for(let i=0;i<present.length;i++){
  const u=present[i],side=entries.get(u.province)!.sides.get(u.owner)!,st=statsFor(u.owner,u.kind);
  side.units++;side.health+=unitHealth(u.hp,st,lanes.taken[i]);side.damage+=unitDamage(st,lanes.mode[i],lanes.dealt[i]);
 }
 const result:BattleStrength[]=[];
 for(const {battle,sides} of entries.values()){
  const standing=[...sides.values()].filter(side=>side.units>0);if(standing.length<2)continue;
  for(const side of standing)side.power=strengthPower(side.health,side.damage);
  result.push({id:battle.id,region:battle.region,start:battle.start,sides:standing.sort((a,b)=>b.power-a.power||a.owner-b.owner)});
 }
 return result;
}

export type Verdict='ahead'|'even'|'behind';
/** `owner`'s power against the strongest other side: >1 means stronger. Infinity when unopposed. */
export function powerRatio(sides:readonly {owner:number;power:number}[],owner:number):number{
 const mine=sides.find(side=>side.owner===owner)?.power??0;
 let rival=0;for(const side of sides)if(side.owner!==owner)rival=Math.max(rival,side.power);
 return rival>0?mine/rival:mine>0?Infinity:1;
}
export function verdict(ratio:number):Verdict{return ratio>=AHEAD_RATIO?'ahead':ratio<=BEHIND_RATIO?'behind':'even';}
