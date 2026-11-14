import {MAP, SOURCE_TO_REGION} from './map.ts';
import {FLAG_BY_ISO3, FLAG_PRESET_IDS, type FlagPresetId} from './flagCatalog.ts';
import type {Flag} from './flags.ts';
import type {Player, Vec2} from './types.ts';

/** Display-only banners for every faction. A player's own flag always wins.
 * Each computer faction flies the real flag of the country it spawned in;
 * when that flag is already flown (or the country has none in the catalog) it
 * takes the nearest unused national flag instead. The result is derived from
 * the shared state alone, so every participant sees the same flag
 * without anything new being stored or sent over the network. */
type FlagOwner = Pick<Player, 'id' | 'flag' | 'country'>;

let regionPoints: Map<FlagPresetId, Vec2[]> | undefined;
/** Region centres of each catalog country, by the region's source prefix. */
function flagRegions(): Map<FlagPresetId, Vec2[]> {
 if(regionPoints) return regionPoints;
 regionPoints = new Map();
 for(const region of MAP) {
  const id = FLAG_BY_ISO3.get(region.code.slice(0, 3));
  if(!id) continue;
  const points = regionPoints.get(id) ?? [];
  points.push(region.center);
  regionPoints.set(id, points);
 }
 return regionPoints;
}

function spawnOf(player: FlagOwner): {home?: FlagPresetId; at?: Vec2} {
 const origin = player.country?.origin;
 if(!origin) return {};
 const region = Object.hasOwn(SOURCE_TO_REGION, origin) ? MAP[SOURCE_TO_REGION[origin]] : undefined;
 return {home: FLAG_BY_ISO3.get(origin.slice(0, 3)), at: region?.center};
}

function nearest(at: Vec2 | undefined, allowed: (id: FlagPresetId) => boolean): FlagPresetId | undefined {
 let best: FlagPresetId | undefined, bestDistance = Infinity;
 const regions = flagRegions();
 for(const id of FLAG_PRESET_IDS) {
  if(!allowed(id)) continue;
  if(!at) return id; // no known spawn: first free flag in catalog order
  for(const point of regions.get(id) ?? []) {
   const distance = (point.x - at.x) ** 2 + (point.z - at.z) ** 2;
   if(distance < bestDistance) {bestDistance = distance; best = id;}
  }
 }
 return best ?? FLAG_PRESET_IDS.find(allowed);
}

/** Flags indexed by player id. */
export function assignFactionFlags(players: readonly FlagOwner[]): Flag[] {
 const flags: (Flag | undefined)[] = players.map(player => player.flag);
 const flown = new Set<FlagPresetId>();
 for(const flag of flags) if(flag?.type === 'preset') flown.add(flag.id);
 // First claim: home flags, in seat order, so the earliest faction from a country keeps it.
 const waiting: FlagOwner[] = [];
 for(const player of players) {
  if(flags[player.id]) continue;
  const {home} = spawnOf(player);
  if(home && !flown.has(home)) {flown.add(home); flags[player.id] = {type: 'preset', id: home};}
  else waiting.push(player);
 }
 // Then the nearest flag nobody flies yet; past the catalog size flags repeat.
 for(const player of waiting) {
  const {at} = spawnOf(player);
  const id = nearest(at, id => !flown.has(id)) ?? nearest(at, () => true)!;
  flown.add(id);
  flags[player.id] = {type: 'preset', id};
 }
 return flags as Flag[];
}

let cache: {key: string; flags: Flag[]} | undefined;
const byPlayers = new WeakMap<readonly FlagOwner[], Flag[]>();
/** Memoized: the same players (or an identical roster from a network frame) reuse one assignment. */
export function factionFlags(players: readonly FlagOwner[]): Flag[] {
 const known = byPlayers.get(players);
 if(known) return known;
 const key = players.map(player => `${player.flag ? JSON.stringify(player.flag) : ''}@${player.country?.origin ?? ''}`).join('|');
 if(cache?.key !== key) cache = {key, flags: assignFactionFlags(players)};
 byPlayers.set(players, cache.flags);
 return cache.flags;
}

export function factionFlag(players: readonly FlagOwner[], id: number): Flag | undefined {
 return id >= 0 ? factionFlags(players)[id] : undefined;
}
