import type {ConstructionKind, GameState, Province} from './types.ts';

/** Facilities consume shared funds and specialize local output.
 * These are gameplay facilities, not new pathfinding obstacles. */
export const CONSTRUCTION = {
 market: {costs:[54,78], benefits:[1,2]},
 barracks: {costs:[48,72], benefits:[.25,.5]},
 fortress: {costs:[44,66], benefits:[.25,.5]},
} as const satisfies Record<ConstructionKind,{costs:readonly [number,number];benefits:readonly [number,number]}>;
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
export function recoveryMultiplier(secondsRemaining: number): number {
 return 1-.5*Math.max(0,Math.min(1,secondsRemaining/CAPTURE_RECOVERY_SECONDS));
}
export function constructionProductionMultiplier(p: Pick<Province,'construction'>): number {
 const b=p.construction;
 return b?.kind==='barracks' ? 1+CONSTRUCTION.barracks.benefits[b.level-1] : 1;
}
export function fundsIncomeRate(p: Pick<Province,'construction'|'recovery'>, baseRate: number): number {
 const b=p.construction;
 return baseRate*recoveryMultiplier(p.recovery)*(BASE_FUNDS_INCOME+(b?.kind==='market'?CONSTRUCTION.market.benefits[b.level-1]:0));
}
export function captureSpeedMultiplier(p: Pick<Province,'construction'>): number {
 const b=p.construction;
 // Keep the original 0–8 progress range in saves and the HUD. Only time to seize changes.
 return b?.kind==='fortress' ? 1/(1+CONSTRUCTION.fortress.benefits[b.level-1]) : 1;
}
