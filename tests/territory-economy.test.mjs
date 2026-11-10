import test from 'node:test';
import assert from 'node:assert/strict';
import {MAP,TERRITORY_TOPOLOGY,INITIAL_TERRITORY_GROUPING} from '../src/game/map.ts';
import {ATOM_BUDGETS,regionCapacity,regionProductionRate,applyGroupingCommand,reconcileGrouping,validGroupingState,groupTotals} from '../src/game/territoryEconomy.ts';
const index=new Map(MAP.map(p=>[p.code,p.id]));
function state(){return{grouping:structuredClone(INITIAL_TERRITORY_GROUPING),provinces:MAP.map(p=>({owner:p.playable?0:-1,production:0})),units:[]};}
test('NE initial groups receive fixed max(12, playable atoms) capacity and exactly one production rate',()=>{
 assert.equal(TERRITORY_TOPOLOGY.mapId,'earth-natural-earth-admin1-511-regions-v2');assert.equal(MAP.length,1163);
 let expected=0;
 for(const group of INITIAL_TERRITORY_GROUPING.groups){
  const active=group.atoms.filter(a=>MAP[index.get(a)].playable),cap=active.length?Math.max(12,active.length):0;
  assert.equal(group.atoms.reduce((n,a)=>n+ATOM_BUDGETS[a].capacity,0),cap);
  assert.equal(group.atoms.reduce((n,a)=>n+ATOM_BUDGETS[a].productionRate,0),Number(active.length>0));expected+=cap;
 }
 assert.equal(MAP.reduce((n,p)=>n+regionCapacity(p.id),0),expected);
 assert.equal(expected,1159*12,'one fixed budget per locked gameplay region');
 for(const p of MAP)if(p.playable)assert.ok(regionCapacity(p.id)>=1);else assert.equal(regionCapacity(p.id)+regionProductionRate(p.id),0);
});
test('NE split, reunion and capture transfer no atomic capacity, production or troops',()=>{
 const s=state(),first=MAP.find(p=>p.playable&&p.neighbors.length),second=MAP[first.neighbors[0]];
 const joined=applyGroupingCommand(s,0,{type:'merge',mapId:TERRITORY_TOPOLOGY.mapId,expectedRevision:0,groups:[s.grouping.atomToGroup[first.code],s.grouping.atomToGroup[second.code]]});assert.equal(joined.ok,true);s.grouping=joined.state;
 const g=s.grouping.groups.find(g=>g.atoms.length>1);assert.ok(g);
 const a=index.get(g.atoms[0]);s.units=[{province:a,owner:0}];s.provinces[a].production=.5;
 const originalProvinces=structuredClone(s.provinces),originalUnits=structuredClone(s.units),before=groupTotals(s,g.id);
 const split=applyGroupingCommand(s,0,{type:'split',mapId:TERRITORY_TOPOLOGY.mapId,expectedRevision:s.grouping.revision,group:g.id,atoms:[g.atoms[0]]});assert.equal(split.ok,true);s.grouping=split.state;
 const parts=s.grouping.groups.filter(part=>part.atoms.some(atom=>g.atoms.includes(atom)));
 const merged=applyGroupingCommand(s,0,{type:'merge',mapId:TERRITORY_TOPOLOGY.mapId,expectedRevision:s.grouping.revision,groups:parts.map(p=>p.id)});assert.equal(merged.ok,true);s.grouping=merged.state;
 assert.deepEqual(groupTotals(s,g.id),before);assert.deepEqual(s.provinces,originalProvinces);assert.deepEqual(s.units,originalUnits);
 s.provinces[a].owner=1;const resources=MAP.map(p=>[regionCapacity(p.id),regionProductionRate(p.id)]);s.grouping=reconcileGrouping(s);
 assert.equal(validGroupingState(s),true);assert.deepEqual(MAP.map(p=>[regionCapacity(p.id),regionProductionRate(p.id)]),resources);assert.deepEqual(s.units,originalUnits);assert.equal(s.provinces[a].production,.5);
});
