import {UNITS} from '../src/game/content.ts';
import {test} from 'node:test';
import {MARCH_INTERVAL_TICKS} from '../src/game/engine.ts';
import assert from 'node:assert/strict';
import {MAP} from '../src/game/map.ts';
import {isRegionGarrison,regionGarrison,regionTroops,regionReservations,trainingSlots} from '../src/game/capacity.ts';
import {validateState,encodeSave,decodeSave} from '../src/game/save.ts';
import {encodeFrame,applyFrame} from '../src/platform/replication.ts';
import {garrisonFixture} from './helpers/garrison-fixture.mjs';
import {mapUnitVisible} from '../src/render/unitPresentation.ts';
const almostTrained=UNITS.infantry.train-0.01;

// Keep these single-unit arrival fixtures free of unrelated reinforcements.
function stepWithoutProduction(e){for(const p of e.state.provinces)p.production=0;e.step();}

test('reserved troops leave available garrison counts while waiting troops still occupy home capacity',()=>{
 const {e,from,to}=garrisonFixture(),before=e.state.units.map(u=>({x:u.x,z:u.z}));
 assert.equal(regionGarrison(e.state,0,from),12);
 assert.ok(e.command(0,{type:'march',from,to,fraction:1}).ok);
 assert.deepEqual(e.state.units.map(u=>({x:u.x,z:u.z})),before);
 assert.equal(regionGarrison(e.state,0,from),0);assert.equal(regionTroops(e.state,0,from),12);
 assert.equal(regionReservations(e.state,0,to),0);
 e.step(5*MARCH_INTERVAL_TICKS+1);
 assert.equal(regionGarrison(e.state,0,from),0);assert.equal(regionReservations(e.state,0,to),6);
 assert.ok(validateState(e.state));
 for(const restored of [decodeSave(encodeSave(e.state,'Dispatched')).state,applyFrame(null,encodeFrame(e.state,undefined,0).frame)]){
  assert.equal(regionGarrison(restored,0,from),0);assert.equal(regionReservations(restored,0,to),6);assert.equal(restored.units.length,12);
  const slots=trainingSlots(restored);assert.equal(slots.stationed[from],6);assert.equal(slots.reserved[to],12);
 }
});

test('the first battalion leaving town opens a training slot while still inside the source region',()=>{
 const {e,from,to}=garrisonFixture();e.state.provinces[from].production=almostTrained;
 assert.ok(e.command(0,{type:'march',from,to,fraction:1}).ok);
 assert.equal(trainingSlots(e.state).stationed[from],12);
 e.step();
 assert.equal(e.state.units.find(u=>u.armyStatus==='formed').province,from);
 assert.equal(e.state.provinces[from].march.pendingIds.length,11);
 assert.equal(regionGarrison(e.state,0,from),1);assert.equal(regionTroops(e.state,0,from),12);
 assert.ok(e.state.provinces[from].production<1);assert.equal(e.state.units.length,13);
});

test('a friendly arrival becomes garrison only after its order ends, once, with no duplicate reservation',()=>{
 const {e,from,to}=garrisonFixture({count:1});assert.ok(e.command(0,{type:'march',from,to,fraction:1}).ok);
 const unit=e.state.units[0];let sawDestinationTransit=false;
 for(let i=0;i<4000&&unit.army!==undefined;i++){
  stepWithoutProduction(e);
  if(unit.target!==null){assert.equal(regionGarrison(e.state,0,unit.province),0);if(unit.province===to)sawDestinationTransit=true;}
  assert.ok(regionTroops(e.state,0,to)+regionReservations(e.state,0,to)<=1);
 }
 assert.equal(sawDestinationTransit,true);assert.equal(unit.target,null);assert.equal(unit.province,to);
 assert.equal(regionGarrison(e.state,0,from),0);assert.equal(regionGarrison(e.state,0,to),1);assert.equal(regionReservations(e.state,0,to),0);
 for(let i=0;i<20;i++)stepWithoutProduction(e);
 assert.equal(regionGarrison(e.state,0,to),1);assert.equal(e.state.units.length,1);assert.ok(validateState(e.state));
 assert.ok(e.command(0,{type:'march',from:to,to:from,fraction:1}).ok);assert.equal(regionGarrison(e.state,0,to),0);
});

test('troops occupying a hostile destination are not idle garrison until capture settles the order',()=>{
 const {e,from,to}=garrisonFixture({count:1,targetOwner:1});assert.ok(e.command(0,{type:'march',from,to,fraction:1}).ok);
 const unit=e.state.units[0];let sawCapture=false;
 for(let i=0;i<4000&&unit.army!==undefined;i++){
  stepWithoutProduction(e);
  if(unit.armyStatus==='inside'){sawCapture=true;assert.equal(unit.province,to);assert.equal(mapUnitVisible(unit),false);assert.equal(regionGarrison(e.state,0,to),0);assert.equal(regionTroops(e.state,0,to),1);assert.equal(regionReservations(e.state,0,to),0);}
 }
 assert.equal(sawCapture,true);assert.equal(e.state.provinces[to].owner,0);assert.equal(unit.target,null);assert.equal(regionGarrison(e.state,0,to),1);
});

test('fighting during departure stays excluded; casualties release reservations without negative garrison',()=>{
 const {e,from,to}=garrisonFixture({count:1}),unit=e.state.units[0];
 e.state.units.push({...structuredClone(unit),id:e.state.nextId++,owner:1});unit.hp=1;
 assert.ok(e.command(0,{type:'march',from,to,fraction:1}).ok);
 assert.equal(regionGarrison(e.state,0,from),0);assert.equal(regionGarrison(e.state,1,from),1);
 e.step();assert.ok(!e.state.units.some(u=>u.id===unit.id));
 assert.equal(regionGarrison(e.state,0,from),0);assert.equal(regionReservations(e.state,0,to),0);
});

test('embarked troops are neither source nor destination garrison and remain reserved through save and LAN',()=>{
 const {e,from,to}=garrisonFixture({count:1,fromCode:'GBR-3409',toCode:'FRA-5275'});
 assert.ok(e.command(0,{type:'march',from,to,fraction:1}).ok);
 const unit=e.state.units[0];for(let i=0;i<1000&&!unit.transport?.embarked;i++)e.step();
 assert.ok(unit.transport?.embarked);
 assert.ok(validateState(e.state));
 for(const state of [e.state,decodeSave(encodeSave(e.state,'At sea')).state,applyFrame(null,encodeFrame(e.state,undefined,0).frame)]){
  assert.equal(regionGarrison(state,0,from),0);assert.equal(regionGarrison(state,0,to),0);assert.equal(regionReservations(state,0,to),1);assert.equal(state.units.length,1);
 }
});

test('the count is a nonnegative selection, not subtraction, and separates owners and active orders',()=>{
 const {e,from,to}=garrisonFixture({count:1}),base=e.state.units[0];
 e.state.units.push({...base,id:e.state.nextId++,owner:-1},{...base,id:e.state.nextId++,owner:1},{...base,id:e.state.nextId++,province:to});
 assert.equal(regionGarrison(e.state,0,from),1);assert.equal(regionGarrison(e.state,-1,from),1);assert.equal(regionGarrison(e.state,1,from),1);assert.equal(regionGarrison(e.state,0,to),1);
 for(const fields of [{target:to},{transport:{from,to,index:1,embarked:true}},{travel:{index:1,points:[MAP[from].center,MAP[to].center]}}])assert.equal(isRegionGarrison({...base,...fields},0,from),false);
 e.state.units=[];assert.equal(regionGarrison(e.state,0,from),0);
});
