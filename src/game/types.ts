import type {CountryIdentity} from './countryNames.ts';
import type { TerritoryGrouping } from './territoryGrouping.ts';
import type {TravelPlan} from './terrain-navigation.ts';
import type { Flag } from './flags.ts';
import type { MarchFraction } from './countryActions.ts';
export type Vec2 = { x:number; z:number };
export type Kind = 'infantry' | 'cavalry' | 'artillery' | 'engineer' | 'skirmisher' | 'grenadier' | 'heavyCavalry' | 'horseArtillery';
export type Leader = 'warden' | 'vanguard' | 'steward';
export type Upgrade = 'attack' | 'health' | 'speed';
export type Terrain = 'plain' | 'forest' | 'highland';
export interface ProvinceDef { id:number; code:string; name:[string,string]; sourceId:number; sourceAtoms?:readonly string[]; locked?:boolean; center:Vec2; polygon:Vec2[]; parts:Vec2[][][]; neighbors:number[]; terrain:Terrain; playable:boolean; visible:boolean; cropped:boolean; navigationPart:number; bounds:{left:number;right:number;top:number;bottom:number} }
export type ConstructionKind = 'market' | 'barracks' | 'fortress';
export interface TerritoryConstruction {kind:ConstructionKind;level:1|2|3}
/** Friendly queued arrivals count toward local training, not march capacity. */
export type MarchOrder={to:number;owner:number;pendingIds:number[];reserved?:true;fraction?:MarchFraction;army?:number};
export type ArmyMemberStatus = 'queued'|'formed'|'field'|'sea'|'inside';
export interface ArmyFormation {
  from:number;
  phase:'assemble'|'march'|'sea'|'battle'|'enter';
  position:Vec2;
  heading:number;
  columns:number;
  route:TravelPlan;
  lastContact:number;
  readyAt?:number;
  redirect?:number;
  engaged?:boolean;
  detour?:Vec2[];
  retryAt?:number;
  readyCount?:number;
}
/** A source region's dispatch dissolves into the destination garrison on arrival. */
export interface Army { id:number; owner:number; to:number; formed:number; size:number; formation?:ArmyFormation }
/** Side of a regional battle; owner -1 is the neutral garrison. */
export interface BattleSide { owner:number; losses:number }
/** Fighting in one region: every country drawn in joins the same battle until it is quiet for two days. */
export interface Battle { id:number; region:number; start:number; last:number; sides:BattleSide[] }
export interface Province { id:number; owner:number; production:number; kind:Kind; recovery:number; captor:number; capture:number; construction?:TerritoryConstruction; march?:MarchOrder; lastMarchTick?:number }
/** An assault destination marks where a unit was sent while it was hostile. */
export interface Unit { travel?:TravelPlan; assault?:number; army?:number; armyStatus?:ArmyMemberStatus; id:number; owner:number; kind:Kind; x:number; z:number; hp:number; province:number; target:number|null; origin:number; destination:number|null; route:number[]; transport?:{from:number;to:number;index:number;embarked:boolean}; cooldown:number }
export interface Player { id:number; name:string; country?:CountryIdentity; flag?:Flag; leader:Leader; loadout:Kind[]; ai:boolean; funds:number; xp:number; level:number; upgrades:Record<Kind,Record<Upgrade,number>>; talents:string[]; choices:string[]; drafts:number; rerollsUsed:number }
export interface GameEvent { tick:number; key:'capture'|'level'|'victory'|'battle'; player:number; province?:number; sides?:number[] }
export interface GameState { version:typeof import('./content.ts').STATE_VERSION; map:typeof import('./content.ts').MAP_ID; grouping:TerritoryGrouping; spawnModel:'single'; neutralGarrisonModel:'preplaced'; campaign:string; seed:number; rng:number; tick:number; nextId:number; topology:number; players:Player[]; provinces:Province[]; units:Unit[]; events:GameEvent[]; winner:number|null; domination:number[]; armies:Army[]; nextArmy:number; battles:Battle[]; nextBattle:number }
export interface PlayerSetup { name:string; flag?:Flag; leader:Leader; loadout:Kind[]; ai?:boolean }
export type Result = {ok:true} | {ok:false;error:string};
