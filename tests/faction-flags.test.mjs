import test from 'node:test';
import assert from 'node:assert/strict';
import {assignFactionFlags, factionFlag, factionFlags} from '../src/game/factionFlags.ts';
import {FLAG_BY_ISO3, FLAG_CATALOG, FLAG_PRESET_IDS} from '../src/game/flagCatalog.ts';
import {validFlag} from '../src/game/flags.ts';
import {createGame} from '../src/game/engine.ts';
import {getSpawnCapacity, makeAISetups} from '../src/game/spawns.ts';
import {MAP} from '../src/game/map.ts';

const ai = (id, origin) => ({id, ai: true, country: {origin, name: [`AI ${id}`, `AI ${id}`]}});
const ARIZONA = 'USA-3520', AISNE = 'FRA-5263', SAO_PAULO = 'BRA-1311', KYOTO = 'JPN-1850', ONTARIO = 'CAN-682';

test('the flag catalog holds real, uniquely keyed national flags that all exist on the map', () => {
 assert.equal(new Set(FLAG_PRESET_IDS).size, FLAG_PRESET_IDS.length);
 assert.ok(FLAG_PRESET_IDS.length >= 120);
 // The original presets keep their ids, so saved preferences and saves keep their meaning.
 assert.deepEqual(FLAG_PRESET_IDS.slice(0, 8), ['cn', 'fr', 'de', 'it', 'jp', 'gb', 'us', 'ch']);
 const codes = FLAG_PRESET_IDS.flatMap(id => FLAG_CATALOG[id].iso3), prefixes = new Set(MAP.map(region => region.code.slice(0, 3)));
 assert.equal(new Set(codes).size, codes.length);
 for(const code of codes) assert.ok(prefixes.has(code), `${code} is a map country`);
 for(const id of FLAG_PRESET_IDS) {
  assert.ok(validFlag({type: 'preset', id}));
  assert.ok(FLAG_CATALOG[id].names.every(name => name.trim().length > 0));
  assert.equal(FLAG_BY_ISO3.get(FLAG_CATALOG[id].iso3[0]), id);
 }
});

test('computer factions fly the flag of the country they spawned in; players keep their own', () => {
 const flags = assignFactionFlags([{id: 0, ai: false, flag: {type: 'preset', id: 'jp'}}, ai(1, SAO_PAULO), ai(2, AISNE), ai(3, KYOTO)]);
 assert.deepEqual(flags[0], {type: 'preset', id: 'jp'});
 assert.deepEqual(flags[1], {type: 'preset', id: 'br'});
 assert.deepEqual(flags[2], {type: 'preset', id: 'fr'});
 // Japan is already the player's banner, so the Kyoto faction takes the nearest flag nobody flies.
 assert.equal(flags[3].type, 'preset');
 assert.ok(['kr', 'kp', 'cn', 'ru'].includes(flags[3].id), flags[3].id);
});

test('later factions from an already-flown country take the nearest unused flag', () => {
 const flags = assignFactionFlags([ai(0, ARIZONA), ai(1, ARIZONA), ai(2, ONTARIO), ai(3, AISNE), ai(4, AISNE)]).map(flag => flag.id);
 assert.equal(flags[0], 'us');
 assert.equal(flags[2], 'ca', 'a home flag is claimed before any neighbour borrows it');
 assert.equal(flags[3], 'fr');
 assert.equal(flags[1], 'mx');
 assert.ok(['be', 'lu', 'de', 'ch', 'nl', 'gb'].includes(flags[4]), flags[4]);
 assert.equal(new Set(flags).size, flags.length);
});

test('every faction of a full campaign gets a valid flag, unique until the catalog runs out', () => {
 const count = Math.min(getSpawnCapacity(), 80);
 const state = createGame([{name: 'Commander', leader: 'warden', loadout: ['infantry'], flag: {type: 'preset', id: 'cn'}}, ...makeAISetups(count - 1, 5)], 5);
 const flags = factionFlags(state.players);
 assert.equal(flags.length, state.players.length);
 assert.ok(flags.every(flag => validFlag(flag)));
 assert.equal(new Set(flags.map(flag => flag.id)).size, flags.length);
 assert.deepEqual(flags[0], {type: 'preset', id: 'cn'});
 // The first computer faction from each catalog country flies that country's flag.
 const seen = new Set(['cn']);
 for(const player of state.players.slice(1)) {
  const home = FLAG_BY_ISO3.get(player.country.origin.slice(0, 3));
  if(home && !seen.has(home)) {assert.equal(flags[player.id].id, home); seen.add(home);}
 }
 // Derived from shared state only: memoized locally and identical for a network copy.
 assert.equal(factionFlags(state.players), flags);
 assert.deepEqual(factionFlags(structuredClone(state.players)), flags);
 assert.deepEqual(factionFlag(state.players, 3), flags[3]);
 assert.equal(factionFlag(state.players, -1), undefined);
});

test('flags repeat only past the catalog size, and legacy factions without a spawn record still get one', () => {
 const crowd = Array.from({length: FLAG_PRESET_IDS.length + 12}, (_, id) => ai(id, ARIZONA));
 const flags = assignFactionFlags(crowd);
 assert.ok(flags.every(flag => validFlag(flag)));
 assert.equal(new Set(flags.slice(0, FLAG_PRESET_IDS.length).map(flag => flag.id)).size, FLAG_PRESET_IDS.length);
 assert.deepEqual(assignFactionFlags([{id: 0}, {id: 1}, {id: 2, flag: {type: 'preset', id: 'cn'}}]).map(flag => flag.id), ['fr', 'de', 'cn']);
});
