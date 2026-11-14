import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseSpawnRegions,getSpawnCapacity,makeAISetups} from '../src/game/spawns.ts';
import {createGame,Engine} from '../src/game/engine.ts';
import {MAP} from '../src/game/map.ts';
import {TerrainNavigator} from '../src/game/terrain-navigation.ts';
import {regionCapacity,regionProductionRate} from '../src/game/territoryEconomy.ts';
import {validateState,encodeSave,decodeSave} from '../src/game/save.ts';
import sites from '../data/spawn-sites.json' with {type:'json'};
const human={name:'Human',leader:'warden',loadout:['infantry']};
test('every eligible single start is offered once and has equal resources and a real land exit',()=>{
 const capacity=getSpawnCapacity();assert.equal(capacity,sites.regions.length);assert.ok(capacity>500);
 const regions=chooseSpawnRegions(42,capacity),nav=new TerrainNavigator();
 assert.deepEqual([...regions].sort((a,b)=>a-b),sites.regions);
 for(const id of regions){
  assert.ok(MAP[id].playable&&MAP[id].locked);
  assert.equal(regionCapacity(id),12);assert.equal(regionProductionRate(id),1);
  assert.ok(MAP[id].neighbors.some(n=>MAP[n].playable&&[nav.plan(MAP[id].center,MAP[n].center),nav.plan(MAP[n].center,MAP[id].center)].every(r=>r&&r.points.every(p=>!p.sea))));
 }
 for(const seed of [0,1234,0xffffffff]){assert.equal(chooseSpawnRegions(seed,capacity).length,capacity);assert.deepEqual(chooseSpawnRegions(seed,5),chooseSpawnRegions(seed,capacity).slice(0,5));}
 assert.throws(()=>chooseSpawnRegions(42,capacity+1),/invalidSetup/);assert.throws(()=>makeAISetups(capacity),/invalidAI/);
});
test('full map faction capacity starts, saves and simulates without actor truncation',()=>{
 const n=getSpawnCapacity(),setups=[human,...makeAISetups(n-1)].map(p=>({...p,ai:false}));
 const start=performance.now(),state=createGame(setups,42,'full-map-capacity');
 assert.equal(state.players.length,n);assert.equal(state.units.filter(u=>u.owner>=0).length,n*5);assert.equal(state.provinces.filter(p=>p.owner>=0).length,n);assert.ok(validateState(state));
 const decoded=decodeSave(encodeSave(state,'Full map'));assert.equal(decoded.state.players.length,n);assert.deepEqual(decoded.state.provinces,state.provinces);
 const engine=new Engine(state);engine.step(2);assert.equal(engine.state.winner,null);assert.ok(engine.state.units.some(u=>u.owner===n-1));
 console.log(`Full ${n}-faction create/save/2-tick smoke: ${Math.round(performance.now()-start)}ms, ${state.units.length} units`);
 assert.throws(()=>createGame([...setups,human],42),/invalidSetup/);
 assert.equal(validateState({...state,players:[...state.players,{...state.players[0],id:n}],domination:[...state.domination,0]}),false);
});
