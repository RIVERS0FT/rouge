import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/game/engine.ts';
import {MAP, PLAYABLE_COUNT} from '../src/game/map.ts';
import {regionProductionRate} from '../src/game/territoryEconomy.ts';
import {isRegionGarrison} from '../src/game/capacity.ts';
import {armyBreakdown, compactNumber, factionFocusRegion, factionSummaries, incomePerSecond, ownedRegions, signed, territoryCounts, victoryTarget} from '../src/ui/hud/hudModel.ts';
import {placeTip} from '../src/ui/tipPlacement.ts';
import {clothAmplitude, clothOffset, clothShade, CLOTH_PERIOD, CLOTH_WAVELENGTH, FLAG_WIDTH} from '../src/ui/flagCloth.ts';
import {politicalRibbonGeometry} from '../src/render/politicalTint.ts';

const setups = ['warden', 'vanguard', 'steward'].map((leader, i) => ({name: `Seat ${i}`, leader, loadout: ['infantry']}));

test('ledger figures mirror engine rules: playable territory, income per region rate and the 60% goal', () => {
 const state = createGame(setups, 99);
 const counts = territoryCounts(state);
 for(const player of state.players) {
  const owned = state.provinces.filter(p => p.owner === player.id && MAP[p.id].playable);
  assert.equal(counts.get(player.id), owned.length);
  const expected = owned.reduce((sum, p) => sum + .5 * regionProductionRate(p.id), 0);
  assert.ok(Math.abs(incomePerSecond(state, player.id) - expected) < 1e-9);
 }
 assert.equal(victoryTarget(), Math.ceil(PLAYABLE_COUNT * .6));
});

test('army breakdown partitions every battalion exactly once', () => {
 const state = createGame(setups, 7);
 const unit = state.units.find(u => u.owner === 0);
 unit.transport = {from: unit.province, to: unit.province, index: 0, embarked: true};
 const other = state.units.find(u => u.owner === 0 && u !== unit);
 other.target = other.province;
 const army = armyBreakdown(state, 0);
 assert.equal(army.total, state.units.filter(u => u.owner === 0).length);
 assert.equal(army.garrison + army.marching + army.embarked, army.total);
 assert.equal(army.embarked, 1);
 assert.equal(army.garrison, state.units.filter(u => isRegionGarrison(u, 0, u.province)).length);
});

test('factions rank by territory then battalions then seat, and eliminated factions sink', () => {
 const state = createGame(setups, 11);
 for(const p of state.provinces) if(p.owner === 2) p.owner = 1;
 state.units = state.units.filter(u => u.owner !== 2);
 const ranking = factionSummaries(state);
 assert.deepEqual(ranking.map(f => f.id), [1, 0, 2]);
 assert.equal(ranking[2].eliminated, true);
 assert.equal(ranking[0].territory, territoryCounts(state).get(1));
 assert.ok(Math.abs(ranking[0].share - ranking[0].territory / PLAYABLE_COUNT) < 1e-12);
});

test('own regions list contested regions first and flag full garrisons; focus picks the largest garrison', () => {
 const state = createGame(setups, 13);
 const regions = ownedRegions(state, 0);
 assert.equal(regions.length, territoryCounts(state).get(0));
 const target = regions[regions.length - 1];
 state.provinces[target.id].capture = 3; state.provinces[target.id].captor = 1;
 const sorted = ownedRegions(state, 0);
 assert.equal(sorted[0].id, target.id);
 assert.ok(sorted.every(r => r.capacity > 0 && r.train > 0));
 const focus = factionFocusRegion(state, 0);
 const best = Math.max(...sorted.map(r => state.units.filter(u => u.owner === 0 && u.province === r.id && !u.transport?.embarked).length));
 assert.equal(state.units.filter(u => u.owner === 0 && u.province === focus && !u.transport?.embarked).length, best);
 for(const p of state.provinces) if(p.owner === 2) p.owner = -1;
 assert.equal(factionFocusRegion(state, 2), -1);
});

test('compact numbers and signed deltas stay short and language-appropriate', () => {
 assert.equal(compactNumber(987, 'en'), '987');
 assert.equal(compactNumber(12345, 'en'), '12.3K');
 assert.equal(compactNumber(12345, 'zh'), '1.23万');
 assert.equal(compactNumber(2.5e6, 'en'), '2.5M');
 assert.equal(signed(2.04), '+2.0');
 assert.equal(signed(-1.26), '−1.3');
 assert.equal(signed(0), '±0.0');
});

test('tooltips stay inside the viewport and flip when the preferred side is full', () => {
 const viewport = {width: 1000, height: 600}, size = {width: 200, height: 120};
 const top = {top: 10, bottom: 50, left: 400, right: 500, width: 100, height: 40};
 assert.deepEqual(placeTip(top, size, viewport, 'below'), {top: 58, left: 350});
 const bottom = {...top, top: 540, bottom: 580};
 assert.equal(placeTip(bottom, size, viewport, 'below').top, 540 - 8 - 120);
 const edge = {top: 200, bottom: 240, left: 950, right: 990, width: 40, height: 40};
 const right = placeTip(edge, size, viewport, 'right');
 assert.equal(right.left, 950 - 8 - 200);
 for(const placement of ['below', 'above', 'right', 'left']) for(const anchor of [top, bottom, edge]) {
  const p = placeTip(anchor, size, viewport, placement);
  assert.ok(p.left >= 8 && p.left + size.width <= viewport.width - 8);
  assert.ok(p.top >= 8 && p.top + size.height <= viewport.height - 8);
 }
});

test('cloth wave keeps the hoist still, swings the fly and travels from hoist to fly', () => {
 assert.ok(clothAmplitude(0) < .3 && clothAmplitude(FLAG_WIDTH) <= 2.6);
 for(let x = 1; x <= FLAG_WIDTH; x++) assert.ok(clothAmplitude(x) > clothAmplitude(x - 1), 'amplitude grows toward the fly');
 for(const t of [0, .4, 1.3, 2.7]) for(let x = 0; x <= FLAG_WIDTH; x += 3) {
  assert.ok(Math.abs(clothOffset(x, t)) <= clothAmplitude(x) + 1e-12);
  assert.ok(Math.abs(clothShade(x, t)) <= 1 + 1e-12);
 }
 // A crest at x moves to x + λ·dt/T after dt: the wave travels toward the fly.
 const dt = .3, shift = CLOTH_WAVELENGTH * dt / CLOTH_PERIOD;
 for(const x of [10, 30, 50]) {
  const before = clothOffset(x, 1) / clothAmplitude(x), after = clothOffset(x + shift, 1 + dt) / clothAmplitude(x + shift);
  assert.ok(Math.abs(before - after) < 1e-9);
 }
 // Periodic in time, so the animation loops without a jump.
 for(const x of [0, 45, 90]) assert.ok(Math.abs(clothOffset(x, .7) - clothOffset(x, .7 + CLOTH_PERIOD)) < 1e-9);
 // Neighbouring pixel columns move continuously: no strip seams.
 for(let x = 0; x < FLAG_WIDTH; x += .5) assert.ok(Math.abs(clothOffset(x + .5, 1.1) - clothOffset(x, 1.1)) < .2);
});

test('political ribbons mitre through shared vertices and extrapolate at open ends', () => {
 const p = (x, z) => ({x, z});
 const edges = [{a: p(0, 0), b: p(10, 0), atoms: [1, 2]}, {a: p(10, 0), b: p(10, 10), atoms: [1, 2]}];
 const geometry = politicalRibbonGeometry(edges);
 assert.equal(geometry.instanceCount, 2);
 assert.equal(geometry.index.count, 6);
 const previous = [...geometry.getAttribute('aPrevious').array], next = [...geometry.getAttribute('aNext').array];
 assert.deepEqual(previous.slice(0, 2), [-10, 0]);
 assert.deepEqual(next.slice(0, 2), [10, 10]);
 assert.deepEqual(previous.slice(2, 4), [0, 0]);
 assert.deepEqual(next.slice(2, 4), [10, 20]);
 assert.equal(politicalRibbonGeometry([]).instanceCount, 0);
});
