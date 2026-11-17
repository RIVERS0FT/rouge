import {hasTalent} from './content.ts';
import type {ConstructionKind, GameState, Player, Province, TerritoryConstruction} from './types.ts';

/** Facilities consume shared funds and specialize local output.
 * These are gameplay facilities, not new pathfinding obstacles.
 * Level 3 needs the Industrial Base talent. */
export const CONSTRUCTION = {
 market: {costs:[54,78,110], benefits:[1,2,3.5]},
 barracks: {costs:[48,72,100], benefits:[.25,.5,1]},
 fortress: {costs:[44,66,95], benefits:[.25,.5,1]},
} as const satisfies Record<ConstructionKind,{costs:readonly [number,number,number];benefits:readonly [number,number,number]}>;
export const CONSTRUCTION_KINDS: readonly ConstructionKind[] = ['market','barracks','fortress'];
export const STARTING_FUNDS = 184;
export const MAX_FUNDS = 1e12;
export const BASE_FUNDS_INCOME = .75;
export const CAPTURE_REWARD = 30;
export const CAPTURE_RECOVERY_SECONDS = 15;

export function isConstructionKind(value: unknown): value is ConstructionKind {
 return typeof value==='string'&&Object.hasOwn(CONSTRUCTION,value);
}
export function availableFunds(state: Pick<GameState,'players'>, owner: number): number {
 const player=state.players[owner];
 return player ? Math.floor(player.funds) : 0;
}
type CountryTalents=Pick<Player,'talents'>;
/** Living off the Land doubles every funds gain from kills and captures. */
export function plunderMultiplier(country?: CountryTalents): number {
 return hasTalent(country,'livingOffLand')?2:1;
}
export function captureReward(country?: CountryTalents): number {
 return (hasTalent(country,'warSpoils')?40:CAPTURE_REWARD)*plunderMultiplier(country);
}
export function maxConstructionLevel(country?: CountryTalents): 2|3 {
 return hasTalent(country,'industrialBase')?3:2;
}
export function constructionCost(kind: ConstructionKind, level: 0|1|2, country?: CountryTalents): number {
 let cost: number=CONSTRUCTION[kind].costs[level];
 if(hasTalent(country,'publicWorks'))cost*=.85;
 if(kind==='fortress'&&hasTalent(country,'fortressDoctrine'))cost*=.7;
 return Math.floor(cost);
}
/** Salvage refunds part of the list price of every level built, regardless of who paid. */
export function salvageValue(building: TerritoryConstruction): number {
 let total=0;for(let level=0;level<building.level;level++)total+=CONSTRUCTION[building.kind].costs[level];
 return Math.floor(total*.75);
}
export function recoveryDuration(country?: CountryTalents): number {
 return CAPTURE_RECOVERY_SECONDS*(hasTalent(country,'rapidRecovery') ? .75 : 1);
}
export function recoveryMultiplier(secondsRemaining: number,country?: CountryTalents): number {
 return 1-.5*Math.max(0,Math.min(1,secondsRemaining/recoveryDuration(country)));
}
export function constructionProductionMultiplier(p: Pick<Province,'construction'>): number {
 const b=p.construction;
 return b?.kind==='barracks' ? 1+CONSTRUCTION.barracks.benefits[b.level-1] : 1;
}
/** `tradeBonus` is the Trade Routes income from neighbouring markets (funds/day before multipliers). */
export function fundsIncomeRate(p: Pick<Province,'construction'|'recovery'>, baseRate: number, country?: CountryTalents, tradeBonus=0): number {
 const b=p.construction;
 let rate=baseRate*recoveryMultiplier(p.recovery,country)*(BASE_FUNDS_INCOME+(b?.kind==='market'?CONSTRUCTION.market.benefits[b.level-1]:0)+tradeBonus)*(hasTalent(country,'taxReform')?1.15:1);
 if(hasTalent(country,'mercantilism'))rate*=1.3;
 if(hasTalent(country,'livingOffLand'))rate*=.6;
 return rate;
}
/** Daily interest from the Treasury talent. */
export function treasuryInterest(country: Pick<Player,'talents'|'funds'>): number {
 return hasTalent(country,'treasury')?Math.min(5,country.funds*.01):0;
}
export function captureSpeedMultiplier(p: Pick<Province,'construction'>): number {
 const b=p.construction;
 // Keep the original 0–8 progress range in saves and the HUD. Only time to seize changes.
 return b?.kind==='fortress' ? 1/(1+CONSTRUCTION.fortress.benefits[b.level-1]) : 1;
}
