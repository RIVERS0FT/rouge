import {BALANCE} from './balance.ts';
import {hasTalent} from './content.ts';
import type {ConstructionKind, GameState, Player, Province, TerritoryConstruction} from './types.ts';

const T=BALANCE.talents;
/** Facilities consume shared funds and specialize local output.
 * These are gameplay facilities, not new pathfinding obstacles.
 * Level 3 needs the Industrial Base talent. Costs and benefits live in balance.ts. */
export const CONSTRUCTION = BALANCE.buildings satisfies Record<ConstructionKind,{costs:readonly [number,number,number];benefits:readonly [number,number,number]}>;
export const CONSTRUCTION_KINDS: readonly ConstructionKind[] = ['market','barracks','fortress'];
export const STARTING_FUNDS = BALANCE.economy.startingFunds;
export const MAX_FUNDS = 1e12;
export const BASE_FUNDS_INCOME = BALANCE.economy.incomePerRegion;
export function armyUpkeep(unitCount: number): number {
 return unitCount * BALANCE.economy.upkeepPerUnit;
}
export const CAPTURE_REWARD = BALANCE.economy.captureReward;
/** Recovery length in campaign days (the name predates the day unit). */
export const CAPTURE_RECOVERY_SECONDS = BALANCE.economy.recoveryDays;

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
 return hasTalent(country,'livingOffLand')?T.livingOffLand.plunder:1;
}
export function captureReward(country?: CountryTalents): number {
 return (hasTalent(country,'warSpoils')?T.warSpoils.captureReward:CAPTURE_REWARD)*plunderMultiplier(country);
}
export function maxConstructionLevel(country?: CountryTalents): 2|3 {
 return hasTalent(country,'industrialBase')?3:2;
}
export function constructionCost(kind: ConstructionKind, level: 0|1|2, country?: CountryTalents): number {
 let cost: number=CONSTRUCTION[kind].costs[level];
 if(hasTalent(country,'publicWorks'))cost*=T.publicWorks.cost;
 if(kind==='fortress'&&hasTalent(country,'fortressDoctrine'))cost*=T.fortressDoctrine.cost;
 return Math.floor(cost);
}
/** Salvage refunds part of the list price of every level built, regardless of who paid. */
export function salvageValue(building: TerritoryConstruction): number {
 let total=0;for(let level=0;level<building.level;level++)total+=CONSTRUCTION[building.kind].costs[level];
 return Math.floor(total*T.salvage.refund);
}
export function recoveryDuration(country?: CountryTalents): number {
 return CAPTURE_RECOVERY_SECONDS*(hasTalent(country,'rapidRecovery') ? T.rapidRecovery.duration : 1);
}
export function recoveryMultiplier(secondsRemaining: number,country?: CountryTalents): number {
 return 1-BALANCE.economy.recoveryLoss*Math.max(0,Math.min(1,secondsRemaining/recoveryDuration(country)));
}
export function constructionProductionMultiplier(p: Pick<Province,'construction'>): number {
 const b=p.construction;
 return b?.kind==='barracks' ? 1+CONSTRUCTION.barracks.benefits[b.level-1] : 1;
}
/** `tradeBonus` is the Trade Routes income from neighbouring markets (funds/day before multipliers). */
export function fundsIncomeRate(p: Pick<Province,'construction'|'recovery'>, baseRate: number, country?: CountryTalents, tradeBonus=0): number {
 const b=p.construction;
 const bonus=(b?.kind==='market'?CONSTRUCTION.market.benefits[b.level-1]:0)+tradeBonus;
 let rate=(BASE_FUNDS_INCOME+baseRate*bonus)*recoveryMultiplier(p.recovery,country)*(hasTalent(country,'taxReform')?T.taxReform.income:1);
 if(hasTalent(country,'mercantilism'))rate*=T.mercantilism.income;
 if(hasTalent(country,'livingOffLand'))rate*=T.livingOffLand.income;
 return rate;
}
/** Daily interest from the Treasury talent. */
export function treasuryInterest(country: Pick<Player,'talents'|'funds'>): number {
 return hasTalent(country,'treasury')?Math.min(T.treasury.max,country.funds*T.treasury.interest):0;
}
export function captureSpeedMultiplier(p: Pick<Province,'construction'>): number {
 const b=p.construction;
 // The progress range (balance capture.days) stays the same in saves and the HUD; only the time to seize changes.
 return b?.kind==='fortress' ? 1/(1+CONSTRUCTION.fortress.benefits[b.level-1]) : 1;
}
