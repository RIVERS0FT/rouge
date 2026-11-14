import {isRegionGarrison} from '../../game/capacity.ts';
import {constructionFunds, recoveryMultiplier} from '../../game/construction.ts';
import {UNITS} from '../../game/content.ts';
import {MAP, PLAYABLE_COUNT} from '../../game/map.ts';
import {regionCapacity, regionProductionRate} from '../../game/territoryEconomy.ts';
import type {ConstructionKind, GameState} from '../../game/types.ts';

/** Derived, read-only HUD figures. These mirror the authoritative engine rules
 * (income per owned playable region, garrison definition, victory share) and
 * never feed back into the simulation. */
export const VICTORY_SHARE = 0.6;
export const DOMINATION_SECONDS = 30;
export const victoryTarget = () => Math.ceil(PLAYABLE_COUNT * VICTORY_SHARE);
/** Gold accrues at 0.5 × the region's base rate, adjusted by recovery. */
export const INCOME_PER_RATE = 0.5;
export const CAPTURE_REWARD = 30;
export const CAPTURE_THRESHOLD = 8;

export function territoryCounts(state: GameState): Map<number, number> {
 const counts = new Map<number, number>();
 for(const province of state.provinces) if(province.owner >= 0 && MAP[province.id]?.playable) counts.set(province.owner, (counts.get(province.owner) ?? 0) + 1);
 return counts;
}

export function incomePerSecond(state: GameState, actor: number): number {
 let rate = 0;
 for(const province of state.provinces) if(province.owner === actor && MAP[province.id]?.playable) rate += INCOME_PER_RATE * regionProductionRate(province.id) * recoveryMultiplier(province.recovery);
 return rate;
}

export interface ArmyBreakdown {total: number; garrison: number; marching: number; embarked: number}
export function armyBreakdown(state: GameState, actor: number): ArmyBreakdown {
 const result = {total: 0, garrison: 0, marching: 0, embarked: 0};
 for(const unit of state.units) {
  if(unit.owner !== actor) continue;
  result.total++;
  if(unit.transport?.embarked) result.embarked++;
  else if(isRegionGarrison(unit, actor, unit.province)) result.garrison++;
  else result.marching++;
 }
 return result;
}

export interface FactionSummary {id: number; territory: number; share: number; army: number; level: number; eliminated: boolean; ai: boolean}
/** Factions ranked by territory, then battalions, then seat order (stable). */
export function factionSummaries(state: GameState): FactionSummary[] {
 const territory = territoryCounts(state), army = new Map<number, number>();
 for(const unit of state.units) if(unit.owner >= 0) army.set(unit.owner, (army.get(unit.owner) ?? 0) + 1);
 return state.players.map(player => {
  const owned = territory.get(player.id) ?? 0;
  return {id: player.id, territory: owned, share: owned / PLAYABLE_COUNT, army: army.get(player.id) ?? 0, level: player.level, eliminated: owned === 0, ai: player.ai};
 }).sort((a, b) => b.territory - a.territory || b.army - a.army || a.id - b.id);
}

/** Playable base provinces are visited once, regardless of their current grouping.
 * Only the local actor's funds are returned to the details view. */
export function nationDetails(state: GameState, nation: number, actor: number) {
 const buildings: Record<ConstructionKind, number> = {market: 0, barracks: 0, fortress: 0};
 for(const province of state.provinces) {
  if(province.owner === nation && MAP[province.id]?.playable && province.construction) buildings[province.construction.kind]++;
 }
 return {army: armyBreakdown(state, nation), buildings, funds: nation === actor ? constructionFunds(state, actor) : null};
}

export interface RegionSummary {id: number; garrison: number; capacity: number; production: number; train: number; capture: number; captor: number; recovering: boolean; full: boolean}
/** The local faction's regions; contested ones first, then the largest garrisons. */
export function ownedRegions(state: GameState, actor: number): RegionSummary[] {
 // One pass over units, not one per region: late campaigns own hundreds of regions.
 const garrison = new Map<number, number>(), present = new Map<number, number>(), incoming = new Map<number, number>();
 for(const unit of state.units) {
  if(unit.owner !== actor) continue;
  if(isRegionGarrison(unit, actor, unit.province)) garrison.set(unit.province, (garrison.get(unit.province) ?? 0) + 1);
  if(!unit.transport?.embarked) present.set(unit.province, (present.get(unit.province) ?? 0) + 1);
  if(unit.destination !== null && unit.province !== unit.destination) incoming.set(unit.destination, (incoming.get(unit.destination) ?? 0) + 1);
 }
 const result: RegionSummary[] = [];
 for(const province of state.provinces) {
  if(province.owner !== actor || !MAP[province.id]?.playable) continue;
  const capacity = regionCapacity(province.id), stationed = garrison.get(province.id) ?? 0;
  // Mirrors the engine's production stall: physical occupants plus reservations fill the region.
  const occupied = (present.get(province.id) ?? 0) + (incoming.get(province.id) ?? 0);
  result.push({id: province.id, garrison: stationed, capacity, production: province.production, train: UNITS[province.kind].train,
   capture: province.capture, captor: province.captor, recovering: province.recovery > 0, full: occupied >= capacity});
 }
 return result.sort((a, b) => Number(b.capture > 0) - Number(a.capture > 0) || b.capture - a.capture || b.garrison - a.garrison || a.id - b.id);
}

/** A region worth showing for a faction: the one holding its largest garrison,
 * falling back to its first owned region. -1 when the faction holds nothing. */
export function factionFocusRegion(state: GameState, actor: number): number {
 const garrison = new Map<number, number>();
 for(const unit of state.units) if(unit.owner === actor && !unit.transport?.embarked) garrison.set(unit.province, (garrison.get(unit.province) ?? 0) + 1);
 let best = -1, bestCount = -1;
 for(const province of state.provinces) {
  if(province.owner !== actor || !MAP[province.id]?.playable) continue;
  const count = garrison.get(province.id) ?? 0;
  if(count > bestCount) {best = province.id; bestCount = count;}
 }
 return best;
}

/** Compact large values for narrow HUD slots: 9 870 → 9.87K. */
export function compactNumber(value: number, language: 'zh' | 'en'): string {
 const abs = Math.abs(value);
 if(language === 'zh' && abs >= 10000) return `${trim(value / 10000)}万`;
 if(abs >= 1e6) return `${trim(value / 1e6)}M`;
 if(abs >= 1e4) return `${trim(value / 1e3)}K`;
 return Math.floor(value).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US');
}
function trim(value: number) {return Number(value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)).toString();}

export function signed(value: number, digits = 1): string {
 const rounded = Number(value.toFixed(digits));
 return `${rounded > 0 ? '+' : rounded < 0 ? '−' : '±'}${Math.abs(rounded).toFixed(digits)}`;
}
