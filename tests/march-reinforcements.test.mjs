import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Engine,MARCH_INTERVAL_TICKS} from '../src/game/engine.ts';
import {DT,UNITS} from '../src/game/content.ts';
import {MAP} from '../src/game/map.ts';
import {isRegionGarrison,regionGarrison,regionReservations} from '../src/game/capacity.ts';
import {regionCapacity,regionProductionRate,reconcileGrouping} from '../src/game/territoryEconomy.ts';
import {validateState,encodeSave,decodeSave} from '../src/game/save.ts';
import {encodeFrame,applyFrame} from '../src/platform/replication.ts';
import {garrisonFixture} from './helpers/garrison-fixture.mjs';

function trainNext(e,from){e.state.provinces[from].production=UNITS.infantry.train-DT*regionProductionRate(from)/2;}
function order(e,from,to,fraction=1){return e.command(0,{type:'march',from,to,fraction});}
function add(e,to,template,fields={}){const u={...structuredClone(template),id:e.state.nextId++,...MAP[to].center,province:to,origin:to,...fields};e.state.units.push(u);return u;}

test('dispatch starts exactly one now, and releases each subsequent battalion after .25 simulation seconds',()=>{
 const {e,from,to}=garrisonFixture({count:5}),ids=e.state.units.map(u=>u.id),positions=e.state.units.map(u=>({x:u.x,z:u.z}));
 assert.equal(MARCH_INTERVAL_TICKS*DT,.25);
 assert.deepEqual(order(e,from,to),{ok:true});
 assert.equal(regionGarrison(e.state,0,from),4);assert.equal(regionReservations(e.state,0,to),1);
 assert.deepEqual(e.state.units.map(u=>({x:u.x,z:u.z})),positions);
 assert.deepEqual(e.state.provinces[from].march.pendingIds,ids.slice(1));
 e.step(MARCH_INTERVAL_TICKS-1);assert.equal(regionGarrison(e.state,0,from),4);
 e.step();assert.equal(regionGarrison(e.state,0,from),3);
 e.step(3*MARCH_INTERVAL_TICKS);assert.equal(regionGarrison(e.state,0,from),0);
 assert.equal(e.state.provinces[from].march,undefined);
 assert.equal(e.state.units.filter(u=>u.target===to).length,5);assert.ok(validateState(e.state));
});

test('newly trained battalions join an active queue, but production immediately after its last departure stays home',()=>{
 const {e,from,to}=garrisonFixture({count:2});order(e,from,to);
 const next=e.state.nextId;trainNext(e,from);e.step();
 const reinforcement=e.state.units.find(u=>u.id===next);assert.ok(reinforcement);
 assert.ok(isRegionGarrison(reinforcement,0,from));
 assert.equal(e.state.provinces[from].march.pendingIds.at(-1),next);
 e.step(MARCH_INTERVAL_TICKS-1);assert.equal(reinforcement.target,null);
 e.step(MARCH_INTERVAL_TICKS);
 assert.equal(reinforcement.target,to);assert.equal(e.state.provinces[from].march,undefined);
 const later=e.state.nextId;trainNext(e,from);e.step();
 assert.ok(isRegionGarrison(e.state.units.find(u=>u.id===later),0,from));assert.ok(validateState(e.state));
});

test('a single immediate departure closes the order while its original battalion travels',()=>{
 const {e,from,to}=garrisonFixture({count:1});assert.ok(order(e,from,to).ok);
 assert.equal(e.state.provinces[from].march,undefined);
 trainNext(e,from);e.step(MARCH_INTERVAL_TICKS*2);
 assert.equal(regionGarrison(e.state,0,from),1);assert.equal(e.state.units[0].target,to);
});

test('replacing the order from the same source does not restart the departure cooldown',()=>{
 const {e,from,to}=garrisonFixture({count:3});assert.ok(order(e,from,to).ok);
 for(let i=0;i<4;i++)assert.ok(order(e,from,to).ok);
 assert.equal(regionGarrison(e.state,0,from),2);
 e.step(MARCH_INTERVAL_TICKS-1);assert.equal(regionGarrison(e.state,0,from),2);
 assert.ok(order(e,from,to).ok);
 e.step();assert.equal(regionGarrison(e.state,0,from),1);
});

for(const targetOwner of [-1,1])test(`target owner ${targetOwner}: attack bypasses even fully booked capacity and previously launched troops can arrive after capture`,()=>{
 const {e,from,to}=garrisonFixture({count:3,targetOwner}),template=structuredClone(e.state.units[0]),cap=regionCapacity(to);
 for(let i=0;i<cap;i++)add(e,to,template);
 assert.equal(regionGarrison(e.state,0,to),cap);assert.ok(order(e,from,to).ok);
 e.step(2*MARCH_INTERVAL_TICKS);
 assert.equal(regionGarrison(e.state,0,from),0);
 const attack=e.state.units.filter(u=>u.assault===to);assert.equal(attack.length,3);
 // Change allegiance after orders actually depart. Force the final segment
 // to test arrival past the full garrison independently of combat and path length.
 e.state.provinces[to].owner=0;e.state.grouping=reconcileGrouping(e.state);
 const originalLocations=new Map(attack.map(u=>[u.id,structuredClone(u)]));
 for(let i=0;i<20&&attack.some(u=>u.target!==null);i++){
   for(const u of attack){if(!u.travel)continue;u.travel.index=u.travel.points.length-1;Object.assign(u,MAP[to].center,{province:to});}
   e.step();
 }
 // This fixture puts many units in the same footprint: arrival can still be
 // delayed by physical steering, but capacity must not block over-cap arrival.
 assert.ok(regionGarrison(e.state,0,to)>cap);
 for(const u of attack)if(u.travel)Object.assign(u,originalLocations.get(u.id));
 assert.ok(validateState(e.state));
 assert.deepEqual(decodeSave(encodeSave(e.state,'Overflow')).state,e.state);
});

test('full friendly target accepts complete, concurrent orders from different sources',()=>{
 const {e,from,to}=garrisonFixture({count:3}),template=structuredClone(e.state.units[0]),cap=regionCapacity(to);
 for(let i=0;i<cap;i++)add(e,to,template);
 const other=MAP[to].neighbors.find(id=>id!==from&&e.state.provinces[id].owner<0&&e.navigation.plan(MAP[id].center,MAP[to].center));
 assert.notEqual(other,undefined);
 e.state.provinces[other].owner=0;e.state.grouping=reconcileGrouping(e.state);
 for(let i=0;i<2;i++)add(e,other,template);
 assert.deepEqual(order(e,from,to,.67),{ok:false,error:'invalidCommand'});
 assert.ok(order(e,from,to).ok);assert.ok(order(e,other,to).ok);
 assert.equal(e.state.provinces[from].march.pendingIds.length,2);
 assert.equal(e.state.provinces[other].march.pendingIds.length,1);
 assert.equal(regionGarrison(e.state,0,from),2);assert.equal(regionGarrison(e.state,0,other),1);
 e.step(2*MARCH_INTERVAL_TICKS);
 assert.equal(regionGarrison(e.state,0,from),0);assert.equal(regionGarrison(e.state,0,other),0);
 assert.equal(e.state.units.filter(u=>u.target===to).length,5);
 assert.equal(e.state.provinces[from].march,undefined);assert.equal(e.state.provinces[other].march,undefined);
 assert.ok(validateState(e.state));
});

test('queued attackers still depart when their destination becomes friendly and full',()=>{
 const {e,from,to}=garrisonFixture({count:3,targetOwner:-1}),template=structuredClone(e.state.units[0]);
 assert.ok(order(e,from,to).ok);assert.equal(e.state.provinces[from].march.reserved,undefined);
 e.state.provinces[to].owner=0;e.state.grouping=reconcileGrouping(e.state);
 for(let i=0;i<regionCapacity(to);i++)add(e,to,template);
 const restored=new Engine(decodeSave(encodeSave(e.state,'Queued after capture')).state);
 e.step(2*MARCH_INTERVAL_TICKS);restored.step(2*MARCH_INTERVAL_TICKS);
 assert.equal(regionGarrison(e.state,0,from),0);assert.equal(e.state.provinces[from].march,undefined);
 assert.equal(e.state.units.filter(u=>u.target===to).length,3);
 assert.deepEqual(restored.state,e.state);
});

test('losing the source clears its queue rather than dispatching the new owner',()=>{
 const {e,from,to}=garrisonFixture({count:2});order(e,from,to);
 e.state.provinces[from].owner=1;e.state.grouping=reconcileGrouping(e.state);
 const replacement=add(e,from,e.state.units[1],{owner:1});
 e.step(MARCH_INTERVAL_TICKS);assert.equal(e.state.provinces[from].march,undefined);
 assert.equal(replacement.target,null);assert.ok(validateState(e.state));
});

test('saves and ordered LAN deltas preserve queue creation, cooldown and completion',()=>{
 const {e,from,to}=garrisonFixture({count:2});const first=encodeFrame(e.state,undefined,0),wire=x=>JSON.parse(JSON.stringify(x));
 const client=applyFrame(null,wire(first.frame));order(e,from,to);
 const update=encodeFrame(e.state,first.base,0),second=applyFrame(client,wire(update.frame));
 assert.deepEqual(second,e.state);assert.equal(client.provinces[from].march,undefined);
 assert.equal(e.state.provinces[from].march.reserved,true);
 const restored=new Engine(decodeSave(encodeSave(e.state,'Queued')).state);
 assert.equal(restored.state.provinces[from].march.reserved,true);
 e.step(MARCH_INTERVAL_TICKS);restored.step(MARCH_INTERVAL_TICKS);assert.deepEqual(restored.state,e.state);
 const finish=encodeFrame(e.state,update.base,0),third=applyFrame(second,wire(finish.frame));
 assert.deepEqual(third,e.state);assert.equal(third.provinces[from].march,undefined);
 assert.equal(third.provinces[from].lastMarchTick,MARCH_INTERVAL_TICKS);
});

test('legacy follow records and malformed queues are rejected',()=>{
 const {e,from,to}=garrisonFixture({count:1}),id=e.state.units[0].id;
 e.state.provinces[from].march={to,unitIds:[id]};
 assert.equal(validateState(e.state),false);assert.throws(()=>encodeSave(e.state,'Legacy'),/invalidSave/);
 for(const march of [null,{}, {to:from,unitIds:[id]},{to:MAP.length,unitIds:[id]},{to,unitIds:[]},{to,unitIds:[id,id]},{to,owner:1,pendingIds:[id]},{to,owner:0,pendingIds:[e.state.nextId-1] ,reserved:false}]){
  const s=structuredClone(e.state);s.provinces[from].march=march;assert.equal(validateState(s),false);
 }
});
