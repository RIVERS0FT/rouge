import test from 'node:test';
import assert from 'node:assert/strict';
import {maximumMatching} from '../src/game/spawnMatching.ts';
import {chooseSpawnRegions,getSpawnCapacity,makeAISetups} from '../src/game/spawns.ts';
import {createGame,Engine} from '../src/game/engine.ts';
import {MAP} from '../src/game/map.ts';
import {TerrainNavigator} from '../src/game/terrain-navigation.ts';
import {regionCapacity,regionProductionRate} from '../src/game/territoryEconomy.ts';
import {validateState,encodeSave,decodeSave} from '../src/game/save.ts';
import sites from '../data/spawn-sites.json' with {type:'json'};
const human={name:'Human',leader:'warden',loadout:['infantry']};
function brute(graph,available=(1<<graph.length)-1){
 if(!available)return 0;let a=0;while(!(available&(1<<a)))a++;const rest=available&~(1<<a);let best=brute(graph,rest);
 for(const b of graph[a])if(rest&(1<<b))best=Math.max(best,1+brute(graph,rest&~(1<<b)));return best;
}
test('maximum matching handles odd blossoms and matches exhaustive capacity for small graphs',()=>{
 let seed=42;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 for(let n=2;n<=10;n++)for(let trial=0;trial<50;trial++){
  const graph=Array.from({length:n},()=>[]);for(let a=0;a<n;a++)for(let b=a+1;b<n;b++)if(random()<.35){graph[a].push(b);graph[b].push(a);}
  const pairs=maximumMatching(graph);assert.equal(pairs.filter(v=>v>=0).length/2,brute(graph));
  for(const[a,b]of pairs.entries())if(b>=0){assert.equal(pairs[b],a);assert.ok(graph[a].includes(b));}
 }
});
test('every eligible single start is offered once and has equal resources and a real land exit',()=>{
 const capacity=getSpawnCapacity();assert.equal(capacity,sites.regions.length);assert.ok(capacity>2*sites.pairs.length);
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
