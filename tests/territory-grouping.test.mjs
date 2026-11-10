import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerritoryGrouping,validateTerritoryGrouping,applyTerritoryGrouping,territoryTotals,reconcileTerritoryOwners} from '../src/game/territoryGrouping.ts';
const topology={mapId:'earth-natural-earth-admin1-511-v1',atoms:[{id:'A',neighbors:['B']},{id:'B',neighbors:['A','C']},{id:'C',neighbors:['B','D']},{id:'D',neighbors:['C']},{id:'ISLAND',neighbors:[]}]};
const ledger=()=>Object.fromEntries(topology.atoms.map((a,i)=>[a.id,{owner:0,troops:i+1,production:i+.25,productionRate:i+.5,capacity:(i+1)*10}]));
const merge=(state,groups)=>({type:'merge',mapId:state.mapId,expectedRevision:state.revision,groups});
const split=(state,group,atoms)=>({type:'split',mapId:state.mapId,expectedRevision:state.revision,group,atoms});
test('stable complete-atom partition round trips JSON; malformed, missing, duplicate and disconnected atoms reject',()=>{
 const state=createTerritoryGrouping(topology,[['B','A'],['C','D'],['ISLAND']]);assert.equal(state.atomToGroup.B,'group:A');assert.equal(validateTerritoryGrouping(topology,JSON.parse(JSON.stringify(state))),true);
 for(const parts of [[['A','B'],['B','C','D'],['ISLAND']],[['A','C'],['B','D'],['ISLAND']],[['A','B','C','D']],[['A','B','C','D','ISLAND']],[]])assert.throws(()=>createTerritoryGrouping(topology,parts),/invalidGrouping/);
 const bad=structuredClone(state);bad.atomToGroup.A='forged';assert.equal(validateTerritoryGrouping(topology,bad),false);
 assert.throws(()=>createTerritoryGrouping({...topology,atoms:[{id:'A',neighbors:['B']},{id:'B',neighbors:[]}]}),/invalidGrouping/);
});
test('merge conserves immutable atomic armies, progress, production rate and capacity, deterministically',()=>{
 const state=createTerritoryGrouping(topology),book=ledger(),before=structuredClone({state,book});
 const result=applyTerritoryGrouping(topology,state,book,0,merge(state,['group:B','group:A']));assert.equal(result.ok,true);assert.deepEqual(result.state.groups[0],{id:'group:A',atoms:['A','B']});assert.equal(result.state.revision,1);
 assert.deepEqual(result.totals,territoryTotals(topology,book));assert.deepEqual({state,book},before);
 assert.deepEqual(result,applyTerritoryGrouping(topology,state,book,0,merge(state,['group:A','group:B'])));
 assert.deepEqual(territoryTotals(topology,book,['A','B']),{troops:3,production:1.5,productionRate:2,capacity:30});
});
test('only authenticated current owner can merge/split; stale commands and old map refuse',()=>{
 const state=createTerritoryGrouping(topology),book=ledger(),command=merge(state,['group:A','group:B']);
 assert.equal(applyTerritoryGrouping(topology,state,book,1,{...command,actor:0}).error,'notOwner');
 const merged=applyTerritoryGrouping(topology,state,book,0,command).state;assert.equal(applyTerritoryGrouping(topology,merged,book,0,command).error,'staleRevision');
 assert.equal(applyTerritoryGrouping(topology,state,book,0,{...command,mapId:'earth-state-regions-1137-v1'}).error,'wrongMap');
 book.B.owner=1;assert.equal(applyTerritoryGrouping(topology,state,book,0,command).error,'notOwner');assert.equal(applyTerritoryGrouping(topology,merged,book,0,split(merged,'group:A',['A'])).error,'notOwner');
 assert.equal(validateTerritoryGrouping({...topology,mapId:'old'},state),false);
});
test('adjacency requires real graph links, never sea distance/corner identity; offscreen atoms cannot be edited',()=>{
 const state=createTerritoryGrouping(topology),book=ledger();assert.equal(applyTerritoryGrouping(topology,state,book,0,merge(state,['group:A','group:ISLAND'])).error,'notConnected');
 const hidden={...topology,atoms:topology.atoms.map(a=>({...a,playable:a.id!=='B'}))};assert.equal(applyTerritoryGrouping(hidden,state,book,0,merge(state,['group:A','group:B'])).error,'notPlayable');
});
test('splitting whole atom selection decomposes both selected and remainder into connected groups',()=>{
 const state=createTerritoryGrouping(topology,[['A','B','C','D'],['ISLAND']]),book=ledger();
 const result=applyTerritoryGrouping(topology,state,book,0,split(state,'group:A',['B']));assert.equal(result.ok,true);assert.deepEqual(result.state.groups.map(g=>g.atoms),[['A'],['B'],['C','D'],['ISLAND']]);
 assert.equal(validateTerritoryGrouping(topology,result.state),true);assert.deepEqual(result.totals,territoryTotals(topology,book));
 const cut=applyTerritoryGrouping(topology,state,book,0,split(state,'group:A',['A','C']));assert.equal(cut.state.groups.length,5);assert.equal(new Set(cut.state.groups.map(g=>g.id)).size,5);
 assert.equal(applyTerritoryGrouping(topology,state,book,0,split(state,'group:A',['A','B','C','D'])).error,'noChange');
 for(const atoms of [[],['half-A'],['A','A'],['ISLAND']])assert.equal(applyTerritoryGrouping(topology,state,book,0,split(state,'group:A',atoms)).error,'invalidCommand');
});
test('capture reconciliation splits ownership after a whole capture batch and invalidates queued revisions',()=>{
 const state=createTerritoryGrouping(topology,[['A','B','C','D'],['ISLAND']]),book=ledger();assert.equal(reconcileTerritoryOwners(topology,state,book),state);
 book.B.owner=1;book.C.owner=1;const next=reconcileTerritoryOwners(topology,state,book);assert.equal(next.revision,1);assert.deepEqual(next.groups.map(g=>g.atoms),[['A'],['B','C'],['D'],['ISLAND']]);
 assert.equal(applyTerritoryGrouping(topology,next,book,0,split(state,'group:A',['A'])).error,'staleRevision');assert.equal(reconcileTerritoryOwners(topology,next,book),next);
});
test('hostile command and ledger values fail without mutation or silent conservation loss',()=>{
 const state=createTerritoryGrouping(topology),book=ledger(),before=JSON.stringify(state);
 for(const command of [null,{},[],{type:'merge',mapId:state.mapId,expectedRevision:0,groups:['group:A','group:A']},{...merge(state,['group:A','group:B']),expectedRevision:NaN}])assert.equal(applyTerritoryGrouping(topology,state,book,0,command).ok,false);
 for(const bad of [{troops:-1},{troops:1.5},{production:Infinity},{capacity:NaN},{owner:-2},{productionRate:-1}]){const values=structuredClone(book);Object.assign(values.A,bad);assert.equal(applyTerritoryGrouping(topology,state,values,0,merge(state,['group:A','group:B'])).error,'invalidLedger');}
 assert.equal(JSON.stringify(state),before);
});
test('4596 atom grouping stays deterministic and can merge/split without quadratic pair geometry',()=>{
 const atoms=Array.from({length:4596},(_,i)=>({id:`ADM-${String(i).padStart(4,'0')}`,neighbors:[i-1,i+1].filter(n=>n>=0&&n<4596).map(n=>`ADM-${String(n).padStart(4,'0')}`)})),map={mapId:topology.mapId,atoms};
 const book=Object.fromEntries(atoms.map(a=>[a.id,{owner:0,troops:2,production:.25,productionRate:.5,capacity:10}]));const state=createTerritoryGrouping(map),start=performance.now();
 const result=applyTerritoryGrouping(map,state,book,0,merge(state,state.groups.map(g=>g.id)));assert.equal(result.ok,true);assert.equal(result.state.groups.length,1);assert.equal(result.totals.troops,9192);assert.equal(validateTerritoryGrouping(map,result.state),true);
 console.log(`4596-atom merge ${Math.round(performance.now()-start)}ms`);assert.ok(performance.now()-start<5000);
});
