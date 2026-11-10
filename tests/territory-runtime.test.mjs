import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerritoryGrouping,territoryTotals} from '../src/game/territoryGrouping.ts';
import {allocateAtomBudgets,atomCapacity,atomProductionRate,runtimeLedger,commandGrouping,reconcileRuntimeGrouping,validateRuntimeGrouping} from '../src/game/territoryRuntime.ts';
const topology={mapId:'test-atoms-v1',atoms:Array.from({length:20},(_,i)=>({id:`a${String(i).padStart(2,'0')}`,neighbors:[...(i?[`a${String(i-1).padStart(2,'0')}`]:[]),...(i<19?[`a${String(i+1).padStart(2,'0')}`]:[])]}))};
const ids=topology.atoms.map(a=>a.id),parts=[ids.slice(0,15),ids.slice(15)],budgets=allocateAtomBudgets(topology,parts);
function state(){return{grouping:createTerritoryGrouping(topology,parts),provinces:ids.map((_,i)=>({owner:0,production:i/10})),units:[{province:0,owner:0},{province:1,owner:1},{province:2,owner:0,transport:{embarked:true}}]};}
test('each initial group receives exactly 12 total capacity and one production rate, not 12 per atom',()=>{
 for(const part of parts){assert.equal(part.reduce((sum,a)=>sum+atomCapacity(budgets,a),0),12);assert.equal(part.reduce((sum,a)=>sum+atomProductionRate(budgets,a),0),1);}
 assert.equal(ids.reduce((sum,a)=>sum+budgets[a].capacity,0),24);assert.equal(budgets.a14.capacity,0);
 assert.ok(Object.isFrozen(budgets)&&Object.isFrozen(budgets.a00));assert.equal(atomCapacity(budgets,'missing'),0);
});
test('budget distribution is independent of source ordering and rejects missing/duplicate/invalid allocations',()=>{
 assert.deepEqual(allocateAtomBudgets(topology,parts.map(p=>[...p].reverse()).reverse()),budgets);
 for(const p of [[ids.slice(1)],[ids,ids],[[]],[['unknown'],ids]])assert.throws(()=>allocateAtomBudgets(topology,p),/invalidBudget/);
 for(const cap of [-1,1.5,Infinity])assert.throws(()=>allocateAtomBudgets(topology,parts,cap),/invalidBudget/);
});
test('runtime ledger counts land armies but not embarked ships and preserves every atomic queue',()=>{
 const s=state(),ledger=runtimeLedger(topology,budgets,s);assert.equal(ledger.a00.troops,1);assert.equal(ledger.a01.troops,1);assert.equal(ledger.a02.troops,0);
 assert.equal(ledger.a07.production,.7);assert.equal(territoryTotals(topology,ledger).capacity,24);
});
test('merge/split cycles preserve budgets, troops, progress, owners and stale-revision rejection',()=>{
 const s=state(),original=structuredClone(s),totals=territoryTotals(topology,runtimeLedger(topology,budgets,s));
 for(let i=0;i<3;i++){
  const merged=commandGrouping(topology,budgets,s,0,{type:'merge',mapId:topology.mapId,expectedRevision:s.grouping.revision,groups:s.grouping.groups.map(g=>g.id)});assert.equal(merged.ok,true);assert.deepEqual(merged.totals,totals);s.grouping=merged.state;
  const split=commandGrouping(topology,budgets,s,0,{type:'split',mapId:topology.mapId,expectedRevision:s.grouping.revision,group:s.grouping.groups[0].id,atoms:parts[0]});assert.equal(split.ok,true);s.grouping=split.state;
 }
 assert.deepEqual(s.provinces,original.provinces);assert.deepEqual(s.units,original.units);assert.deepEqual(territoryTotals(topology,runtimeLedger(topology,budgets,s)),totals);
 assert.equal(commandGrouping(topology,budgets,s,0,{type:'merge',mapId:topology.mapId,expectedRevision:0,groups:s.grouping.groups.map(g=>g.id)}).error,'staleRevision');
});
test('captures reconcile owner components without reallocating any resources; mixed-owner saves reject',()=>{
 const s=state();assert.equal(validateRuntimeGrouping(topology,s),true);s.provinces[7].owner=1;assert.equal(validateRuntimeGrouping(topology,s),false);
 const before=structuredClone(s);s.grouping=reconcileRuntimeGrouping(topology,budgets,s);assert.equal(validateRuntimeGrouping(topology,s),true);assert.equal(s.grouping.groups.length,4);
 assert.deepEqual(s.units,before.units);assert.deepEqual(s.provinces,before.provinces);assert.equal(territoryTotals(topology,runtimeLedger(topology,budgets,s)).capacity,24);
 assert.equal(commandGrouping(topology,budgets,s,0,{type:'merge',mapId:topology.mapId,expectedRevision:s.grouping.revision,groups:s.grouping.groups.map(g=>g.id)}).error,'notOwner');
 const bad=structuredClone(s);delete bad.grouping.atomToGroup.a00;assert.equal(validateRuntimeGrouping(topology,bad),false);
});
test('configurable fixed minimum gives every playable atom room without reminting resources on split',()=>{
 const safe=allocateAtomBudgets(topology,parts,12,1,1);
 for(const id of ids)assert.ok(safe[id].capacity>=1);
 assert.equal(parts[0].reduce((sum,id)=>sum+safe[id].capacity,0),15);
 assert.equal(parts[1].reduce((sum,id)=>sum+safe[id].capacity,0),12);
 const s=state(),before=territoryTotals(topology,runtimeLedger(topology,safe,s));
 const split=commandGrouping(topology,safe,s,0,{type:'split',mapId:topology.mapId,expectedRevision:0,group:s.grouping.groups[0].id,atoms:['a00']});
 assert.equal(split.ok,true);s.grouping=split.state;assert.deepEqual(territoryTotals(topology,runtimeLedger(topology,safe,s)),before);
});
test('offscreen atoms receive neither production nor capacity and do not dilute playable budgets',()=>{
 const t={...topology,atoms:topology.atoms.map((a,i)=>({...a,playable:i<10}))},b=allocateAtomBudgets(t,parts,12,1,1);
 assert.equal(ids.slice(0,10).reduce((sum,id)=>sum+b[id].capacity,0),12);assert.equal(ids.slice(0,10).reduce((sum,id)=>sum+b[id].productionRate,0),1);
 for(const id of ids.slice(10))assert.deepEqual([b[id].capacity,b[id].productionRate],[0,0]);
});
