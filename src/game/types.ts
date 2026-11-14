import type {CountryIdentity} from './countryNames.ts';
import type { TerritoryGrouping } from './territoryGrouping.ts';
import type {TravelPlan} from './terrain-navigation.ts';
import type { Flag } from './flags.ts';
export type Vec2 = { x:number; z:number };
export type Kind = 'infantry' | 'cavalry' | 'artillery' | 'engineer' | 'skirmisher' | 'grenadier' | 'heavyCavalry' | 'horseArtillery';
export type Leader = 'warden' | 'vanguard' | 'steward';
export type Upgrade = 'attack' | 'health' | 'speed';
export type Terrain = 'plain' | 'forest' | 'highland';
export interface ProvinceDef { id:number; code:string; name:[string,string]; sourceId:number; sourceAtoms?:readonly string[]; locked?:boolean; center:Vec2; polygon:Vec2[]; parts:Vec2[][][]; neighbors:number[]; terrain:Terrain; playable:boolean; visible:boolean; cropped:boolean; navigationPart:number; bounds:{left:number;right:number;top:number;bottom:number} }
export type ConstructionKind = 'market' | 'barracks' | 'fortress';
export interface TerritoryConstruction {kind:ConstructionKind;level:1|2}
export interface Province { id:number; owner:number; production:number; kind:Kind; recovery:number; captor:number; capture:number; construction?:TerritoryConstruction; march?:{to:number;unitIds:number[]} }
export interface Unit { travel?:TravelPlan; id:number; owner:number; kind:Kind; x:number; z:number; hp:number; province:number; target:number|null; origin:number; destination:number|null; route:number[]; transport?:{from:number;to:number;index:number;embarked:boolean}; cooldown:number }
export interface Player { id:number; name:string; country?:CountryIdentity; flag?:Flag; leader:Leader; loadout:Kind[]; ai:boolean; gold:number; constructionFunds?:number; xp:number; level:number; upgrades:Record<Kind,Record<Upgrade,number>>; talents:string[]; choices:string[]; drafts:number; rerolls:number }
export interface GameEvent { tick:number; key:'capture'|'level'|'victory'; player:number; province?:number }
export interface GameState { version:5; map:'earth-natural-earth-admin1-511-regions-v3'; grouping:TerritoryGrouping; spawnModel?:'single'; neutralGarrisonModel?:'preplaced'; campaign:string; seed:number; rng:number; tick:number; nextId:number; topology:number; players:Player[]; provinces:Province[]; units:Unit[]; events:GameEvent[]; winner:number|null; domination:number[] }
export interface PlayerSetup { name:string; flag?:Flag; leader:Leader; loadout:Kind[]; ai?:boolean }
export type Command =
  | {type:'mergeGroups';groups:string[];expectedRevision:number}
  | {type:'splitGroup';group:string;atoms:string[];expectedRevision:number}
  | {type:'march';from:number;to:number;fraction:number}
  | {type:'construct';province:number;kind:ConstructionKind;expectedLevel:0|1}
  | {type:'production';province:number;kind:Kind}
  | {type:'upgrade';kind:Kind;stat:Upgrade}
  | {type:'talent';id:string}
  | {type:'reroll'};
export type Result = {ok:true} | {ok:false;error:string};
