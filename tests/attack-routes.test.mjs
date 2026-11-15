import test from 'node:test';
import assert from 'node:assert/strict';
import {attackRoutes,AttackRouteTracker} from '../src/render/attackRoutes.ts';
const troop=(id,fields={})=>({id,owner:0,hp:10,origin:0,province:0,target:1,assault:1,...fields});
const fixture=()=>({provinces:[{id:0,owner:0,captor:-1,capture:0},{id:1,owner:1,captor:-1,capture:0}],units:[troop(1),troop(2)]});
test('an occupation retires its original arrows even if capture is later interrupted',()=>{
 const tracker=new AttackRouteTracker(),state={...fixture(),campaign:'attack',tick:1};
 assert.equal(tracker.read(state).length,1);
 state.tick++;state.provinces[1].captor=0;state.provinces[1].capture=.05;assert.deepEqual(tracker.read(state),[]);
 state.tick++;state.provinces[1].captor=-1;state.provinces[1].capture=0;assert.deepEqual(tracker.read(state),[]);
 state.units.push(troop(3));assert.equal(tracker.read(state)[0].units,1);
 state.campaign='new-attack';assert.equal(tracker.read(state)[0].units,3);
});
test('an attack route persists through travel and combat after arrival, merging its battalions',()=>{
 const state=fixture();assert.deepEqual(attackRoutes(state),[{owner:0,from:0,to:1,units:2}]);
 state.units[0].province=1;delete state.units[0].travel;
 assert.deepEqual(attackRoutes(state),[{owner:0,from:0,to:1,units:2}]);
});
test('new garrisons do not join arrows; surviving attacks and queued original battalions do',()=>{
 const state=fixture();state.units.push(troop(3,{target:null,assault:undefined}));
 state.provinces[0].march={to:1,owner:0,pendingIds:[3,999]};
 assert.equal(attackRoutes(state)[0].units,3);
 state.units.push(troop(4,{target:null,assault:undefined}));
 assert.equal(attackRoutes(state)[0].units,3);
 state.units=state.units.filter(u=>u.id===3||u.id===4);
 assert.equal(attackRoutes(state)[0].units,1);
 delete state.provinces[0].march;assert.deepEqual(attackRoutes(state),[]);
});
test('arrows end at capture start, friendly ownership, or the loss of every ordered battalion',()=>{
 for(const stop of [s=>{s.provinces[1].captor=0;s.provinces[1].capture=.05;},s=>{s.provinces[1].owner=0;},s=>{s.units.forEach(u=>u.hp=0);},s=>{s.units=[];}]){
  const state=fixture();stop(state);assert.deepEqual(attackRoutes(state),[]);
 }
 const other=fixture();other.provinces[1].captor=2;other.provinces[1].capture=1;
 assert.equal(attackRoutes(other).length,1);
});
test('friendly reinforcement, replaced orders and a lost source do not create attack arrows',()=>{
 const state=fixture();state.units=[];
 state.provinces[0].march={to:1,owner:0,pendingIds:[3],reserved:true};
 state.units.push(troop(3,{target:null,assault:undefined}));assert.deepEqual(attackRoutes(state),[]);
 delete state.provinces[0].march.reserved;state.provinces[0].owner=1;assert.deepEqual(attackRoutes(state),[]);
 state.provinces[0].owner=0;delete state.provinces[0].march;state.units[0].target=2;
 assert.deepEqual(attackRoutes(state),[]);
});
