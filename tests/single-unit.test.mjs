import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {KINDS,UNITS,stats,validateSetup} from '../src/game/content.ts';
import {MAP,STARTS} from '../src/game/map.ts';
import {validateState,encodeSave,decodeSave} from '../src/game/save.ts';
const setup=kind=>({name:'Commander',leader:'warden',loadout:[kind]});
test('new campaigns require exactly one supported unit, without mandatory infantry',()=>{
 for(const kind of KINDS)assert.equal(validateSetup(setup(kind)),true);
 for(const loadout of [[],['infantry','cavalry'],['cavalry','engineer'],['infantry','infantry'],['tank']]){
  assert.equal(validateSetup({...setup('infantry'),loadout}),false);
  assert.throws(()=>createGame([{...setup('infantry'),loadout},setup('infantry')]),/invalidSetup/);
 }
});
for(const kind of KINDS)test(kind+': starting army, production, upgrades, capture and save use the selected kind',()=>{
 const e=new Engine(createGame([setup(kind),setup('infantry')],42,'single-'+kind)),state=e.state;
 assert.ok(state.units.filter(u=>u.owner===0).every(u=>u.kind===kind));
 assert.ok(state.provinces.filter(p=>p.owner===0).every(p=>p.kind===kind));
 const before=state.units.filter(u=>u.owner===0).length;
 e.step(Math.ceil(UNITS[kind].train/0.05)+1);
 assert.ok(state.units.filter(u=>u.owner===0).length>before);
 assert.equal(e.command(0,{type:'upgrade',kind,stat:'attack'}).ok,true);
 const u=state.units.find(u=>u.owner===0);u.hp=stats(state.players[0],kind).hp/2;
 assert.equal(e.command(0,{type:'upgrade',kind,stat:'health'}).ok,true);
 assert.equal(u.hp/stats(state.players[0],kind).hp,0.5);
 const other=KINDS.find(k=>k!==kind);
 assert.equal(e.command(0,{type:'production',province:e.state.provinces.find(v=>v.owner===0).id,kind:other}).ok,false);
 assert.equal(e.command(0,{type:'upgrade',kind:other,stat:'attack'}).ok,false);
 // Place one valid battalion in an undefended adjacent region to isolate capture behavior.
 const target=MAP[state.provinces.find(v=>v.owner===0).id].neighbors.find(id=>state.provinces[id].owner===-1);
 assert.notEqual(target,undefined);
 state.units=state.units.filter(v=>v.province!==target);
 Object.assign(u,{x:MAP[target].center.x,z:MAP[target].center.z,province:target,origin:target,target:null,destination:null,route:[]});
 e.step(170);
 assert.equal(state.provinces[target].owner,0);
 assert.equal(state.provinces[target].kind,kind);
 assert.ok(validateState(state));
 assert.deepEqual(decodeSave(encodeSave(state,'Single')).state,state);
});
test('existing multi-unit v5 saves remain loadable without broadening new campaign rules',()=>{
 const state=createGame([setup('infantry'),setup('infantry')],1);
 state.players[0].loadout=['infantry','cavalry','artillery'];
 assert.ok(validateState(state));
 const restored=decodeSave(encodeSave(state,'Legacy')).state;
 const e=new Engine(restored);
 assert.equal(e.command(0,{type:'production',province:e.state.provinces.find(v=>v.owner===0).id,kind:'cavalry'}).ok,true);
 assert.equal(e.command(0,{type:'upgrade',kind:'cavalry',stat:'attack'}).ok,true);
 state.players[0].loadout=['cavalry','artillery'];
 assert.equal(validateState(state),false);
});
