import {isRegionGarrison,trainingSlots} from '../../game/capacity.ts';
import {armyUpkeep, availableFunds, fundsIncomeRate, treasuryInterest} from '../../game/construction.ts';
import {BALANCE} from '../../game/balance.ts';
import {UNITS} from '../../game/content.ts';
import {MAP, PLAYABLE_COUNT} from '../../game/map.ts';
import {tradeBonus} from '../../game/talentEffects.ts';
import {capacityFor, regionProductionRate} from '../../game/territoryEconomy.ts';
import type {ConstructionKind, GameState} from '../../game/types.ts';

/** Derived, read-only HUD figures. These mirror the authoritative engine rules
 * (income per owned playable region, garrison definition, victory share) and
 * never feed back into the simulation. */
export const VICTORY_SHARE = BALANCE.victory.share;
export const DOMINATION_DAYS = BALANCE.victory.days;
export const victoryTarget = () => Math.ceil(PLAYABLE_COUNT * VICTORY_SHARE);
export const CAPTURE_THRESHOLD = BALANCE.capture.days;

export function territoryCounts(state: GameState): Map<number, number> {
 const counts = new Map<number, number>();
 for(const province of state.provinces) if(province.owner >= 0 && MAP[province.id]?.playable) counts.set(province.owner, (counts.get(province.owner) ?? 0) + 1);
 return counts;
}

/** Regions of `actor` holding another country's Raiders cavalry: they earn and train nothing. */
export function raidedRegions(state: GameState, actor: number): Set<number> {
 const raided = new Set<number>(), raiders = new Set(state.players.filter(p => p.id !== actor && p.talents.includes('lightSaddles')).map(p => p.id));
 if(raiders.size) for(const unit of state.units) if(raiders.has(unit.owner) && !unit.transport?.embarked && state.provinces[unit.province]?.owner === actor) raided.add(unit.province);
 return raided;
}

export function dailyFundsBreakdown(state: GameState, actor: number, units = armyBreakdown(state, actor).total) {
 const player = state.players[actor], raided = raidedRegions(state, actor);
 let regions = 0;
 for(const province of state.provinces) if(province.owner === actor && MAP[province.id]?.playable && !raided.has(province.id)) regions += fundsIncomeRate(province, regionProductionRate(province.id), player, tradeBonus(state, province.id, player));
 const interest = player ? treasuryInterest(player) : 0, upkeep = armyUpkeep(units);
 return {regions, interest, upkeep, net: regions + interest - upkeep};
}

export function incomePerDay(state: GameState, actor: number): number {
 return dailyFundsBreakdown(state, actor).net;
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
 return {army: armyBreakdown(state, nation), buildings, funds: nation === actor ? availableFunds(state, actor) : null};
}

export interface RegionSummary {id: number; garrison: number; capacity: number; production: number; train: number; capture: number; captor: number; recovering: boolean; full: boolean}
/** The local faction's regions; contested ones first, then the largest garrisons. */
export function ownedRegions(state: GameState, actor: number): RegionSummary[] {
 // One pass over units, not one per region: late campaigns own hundreds of regions.
 const slots = trainingSlots(state);
 const result: RegionSummary[] = [];
 for(const province of state.provinces) {
  if(province.owner !== actor || !MAP[province.id]?.playable) continue;
  const capacity = capacityFor(state, province.id), stationed = slots.stationed[province.id];
  const occupied = stationed + slots.reserved[province.id];
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
