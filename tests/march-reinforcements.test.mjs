import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../src/game/engine.ts';
import {DT,UNITS} from '../src/game/content.ts';
import {MAP} from '../src/game/map.ts';
import {isRegionGarrison,regionGarrison,destinationRoom,regionReservations} from '../src/game/capacity.ts';
import {regionProductionRate,reconcileGrouping} from '../src/game/territoryEconomy.ts';
import {validateState,encodeSave,decodeSave} from '../src/game/save.ts';
import {encodeFrame,applyFrame} from '../src/platform/replication.ts';
import {garrisonFixture} from './helpers/garrison-fixture.mjs';

function trainNext(e,from){e.state.provinces[from].production=UNITS.infantry.train-DT*regionProductionRate(from)/2;}
function arrive(u,to){delete u.travel;delete u.transport;Object.assign(u,{...MAP[to].center,province:to,origin:to,target:null,destination:null,route:[]});}

test('a full order sends every available troop and records only the original contingent',()=>{
 const {e,from,to}=garrisonFixture({count:5}),ids=e.state.units.map(u=>u.id),positions=e.state.units.map(u=>({x:u.x,z:u.z}));
 assert.deepEqual(e.command(0,{type:'march',from,to,fraction:1}),{ok:true});
 assert.equal(regionGarrison(e.state,0,from),0);assert.equal(regionReservations(e.state,0,to),5);
 assert.deepEqual(e.state.units.map(u=>({x:u.x,z:u.z})),positions);
 assert.deepEqual(e.state.provinces[from].march,{to,unitIds:ids});assert.ok(validateState(e.state));
});

test('new production joins the same destination immediately without extending the original contingent',()=>{
 const {e,from,to}=garrisonFixture({count:2});e.command(0,{type:'march',from,to,fraction:1});
 const order=structuredClone(e.state.provinces[from].march),next=e.state.nextId;
 trainNext(e,from);e.step();
 const reinforcement=e.state.units.find(u=>u.id===next);assert.ok(reinforcement);
 assert.equal(reinforcement.origin,from);assert.equal(reinforcement.target,to);assert.ok(reinforcement.travel);
 assert.equal(regionGarrison(e.state,0,from),0);assert.deepEqual(e.state.provinces[from].march,order);assert.ok(validateState(e.state));
});

test('the original contingent ending stops follow-up even while a reinforcement is still moving',()=>{
 const {e,from,to}=garrisonFixture({count:1});e.command(0,{type:'march',from,to,fraction:1});
 const original=e.state.units[0];trainNext(e,from);e.step();const reinforcement=e.state.units.at(-1);
 arrive(original,to);trainNext(e,from);const next=e.state.nextId;e.step();
 assert.equal(e.state.provinces[from].march,undefined);assert.equal(reinforcement.target,to);
 assert.ok(isRegionGarrison(e.state.units.find(u=>u.id===next),0,from));assert.ok(validateState(e.state));
});

test('a hostile arrival continues reinforcing until its capture order ends',()=>{
 const {e,from,to}=garrisonFixture({count:1,targetOwner:1});e.command(0,{type:'march',from,to,fraction:1});
 const original=e.state.units[0];delete original.travel;Object.assign(original,{...MAP[to].center,province:to});
 trainNext(e,from);e.step();assert.equal(e.state.provinces[to].owner,1);
 assert.ok(e.state.provinces[from].march);assert.equal(e.state.units.at(-1).target,to);
});

test('losing all original troops ends the order and leaves later production at home',()=>{
 const {e,from,to}=garrisonFixture({count:1});e.command(0,{type:'march',from,to,fraction:1});
 e.state.units=[];trainNext(e,from);e.step();
 assert.equal(e.state.provinces[from].march,undefined);assert.equal(regionGarrison(e.state,0,from),1);
});

test('reinforcements never oversubscribe destination reservations and retry when room opens',()=>{
 const {e,from,to}=garrisonFixture({count:1}),template=structuredClone(e.state.units[0]);
 for(let i=0;i<11;i++)e.state.units.push({...structuredClone(template),id:e.state.nextId++,...MAP[to].center,province:to,origin:to});
 e.command(0,{type:'march',from,to,fraction:1});assert.equal(destinationRoom(e.state,0,to),0);
 trainNext(e,from);e.step();const waiting=e.state.units.at(-1);assert.ok(isRegionGarrison(waiting,0,from));
 e.state.units=e.state.units.filter(u=>u.id!==template.id+1);e.step();
 assert.equal(waiting.target,to);assert.equal(destinationRoom(e.state,0,to),0);assert.ok(validateState(e.state));
});

test('losing the source clears its order before the new owner can inherit it',()=>{
 const {e,from,to}=garrisonFixture({count:1});e.command(0,{type:'march',from,to,fraction:1});
 e.state.provinces[from].owner=1;e.state.grouping=reconcileGrouping(e.state);e.step();
 assert.equal(e.state.provinces[from].march,undefined);assert.ok(validateState(e.state));
});

test('saves and ordered LAN deltas preserve order creation, following and completion',()=>{
 const {e,from,to}=garrisonFixture({count:1});const first=encodeFrame(e.state,undefined,0),wire=x=>JSON.parse(JSON.stringify(x));
 const client=applyFrame(null,wire(first.frame));e.command(0,{type:'march',from,to,fraction:1});
 const update=encodeFrame(e.state,first.base,0),second=applyFrame(client,wire(update.frame));
 assert.deepEqual(second,e.state);assert.equal(client.provinces[from].march,undefined);
 const restored=new Engine(decodeSave(encodeSave(e.state,'Following production')).state);
 trainNext(e,from);trainNext(restored,from);e.step();restored.step();assert.deepEqual(restored.state,e.state);
 for(const id of e.state.provinces[from].march.unitIds)arrive(e.state.units.find(u=>u.id===id),to);
 e.step();const finish=encodeFrame(e.state,update.base,0),third=applyFrame(second,wire(finish.frame));
 assert.deepEqual(third,e.state);assert.equal(third.provinces[from].march,undefined);assert.ok(second.provinces[from].march);
});

test('legacy saves without reinforcement orders remain valid and malformed orders are rejected',()=>{
 const {e,from,to}=garrisonFixture({count:1});assert.ok(validateState(e.state));assert.deepEqual(decodeSave(encodeSave(e.state,'Legacy')).state,e.state);
 for(const march of [null,{}, {to:from,unitIds:[1]},{to:MAP.length,unitIds:[1]},{to,unitIds:[]},{to,unitIds:[1,1]},{to,unitIds:[e.state.nextId]}]){
  const s=structuredClone(e.state);s.provinces[from].march=march;assert.equal(validateState(s),false);
 }
});
