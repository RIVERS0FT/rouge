import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine,isEliminated} from '../src/game/engine.ts';
import {MAP} from '../src/game/map.ts';
import {encodeSave,decodeSave,validateState} from '../src/game/save.ts';
const setup=()=>createGame(['A','B','C'].map(name=>({name,leader:'warden',loadout:['infantry']})),42);
function oneRegionEach(s){for(const actor of [0,1,2]){const owned=s.provinces.filter(p=>p.owner===actor),keep=owned.find(p=>s.units.some(u=>u.owner===actor&&u.province===p.id));assert.ok(keep||!owned.length);for(const p of owned)if(p!==keep)p.owner=-1;}s.units=s.units.filter(u=>u.owner>=0&&s.provinces[u.province].owner===u.owner);}
function occupy(s,attacker,target){const u=s.units.find(u=>u.owner===attacker);assert.ok(u);Object.assign(u,{province:target.id,origin:target.id,x:MAP[target.id].center.x,z:MAP[target.id].center.z,target:null,destination:null,route:[],cooldown:0});target.captor=attacker;target.capture=7.99;return u;}
test('last territory loss clears every defeated army and capture, rejects commands, while other players continue',()=>{
 const s=setup();oneRegionEach(s);const home=s.provinces.find(p=>p.owner===0),remote=s.provinces.find(p=>p.owner===1);
 const invader=occupy(s,1,home),remnant=occupy(s,0,remote);remote.capture=1;
 s.units=[invader,remnant];const e=new Engine(s);e.step();
 assert.equal(isEliminated(e.state,0),true);assert.equal(e.state.units.some(u=>u.owner===0),false);assert.equal(e.state.provinces[remote.id].captor,-1);assert.equal(e.state.provinces[remote.id].capture,0);assert.equal(e.state.winner,null);
 for(const command of [{type:'upgrade',kind:'infantry',stat:'attack'},{type:'production',province:home.id,kind:'infantry'},{type:'march',from:home.id,to:remote.id,fraction:1},{type:'talent',id:'industry'},{type:'reroll'}])assert.deepEqual(e.command(0,command),{ok:false,error:'eliminated'});
 assert.equal(e.command(2,{type:'upgrade',kind:'infantry',stat:'attack'}).ok,true);const tick=e.state.tick;e.step(2);assert.equal(e.state.tick,tick+2);
});
test('simultaneous exchange of last regions does not prematurely eliminate either side',()=>{
 const s=setup();oneRegionEach(s);const a=s.provinces.find(p=>p.owner===0),b=s.provinces.find(p=>p.owner===1);
 s.units=[occupy(s,0,b),occupy(s,1,a)];const e=new Engine(s);e.step();assert.equal(e.state.provinces[a.id].owner,1);assert.equal(e.state.provinces[b.id].owner,0);
 assert.equal(isEliminated(e.state,0),false);assert.equal(isEliminated(e.state,1),false);assert.ok(e.state.units.some(u=>u.owner===0));assert.ok(e.state.units.some(u=>u.owner===1));assert.equal(e.state.winner,null);
});
test('legacy v5 saves with zero-territory remnants normalize on decode and Engine construction',()=>{
 const s=setup();for(const p of s.provinces)if(p.owner===0)p.owner=-1;
 assert.ok(s.units.some(u=>u.owner===0));assert.equal(validateState(s),true);
 const migrated=decodeSave(encodeSave(s,'legacy')).state;assert.equal(validateState(migrated),true);assert.equal(migrated.units.some(u=>u.owner===0),false);assert.equal(isEliminated(migrated,0),true);
 assert.equal(new Engine(s).state.units.some(u=>u.owner===0),false);assert.equal(s.units.some(u=>u.owner===0),true);
 assert.deepEqual(new Engine(migrated).state,migrated);
});
test('last surviving faction wins under existing victory rule after defeated armies clear',()=>{
 const s=setup();for(const p of s.provinces)if(p.owner===2)p.owner=1;oneRegionEach(s);const home=s.provinces.find(p=>p.owner===0),other=s.provinces.find(p=>p.owner===1);
 s.units=[occupy(s,1,home),occupy(s,0,other)];other.capture=0;const e=new Engine(s);e.step();assert.equal(e.state.winner,1);assert.equal(e.state.units.some(u=>u.owner===0),false);
});
test('authoritative snapshots and local simulations remain deterministic through elimination',()=>{
 const s=setup();oneRegionEach(s);const home=s.provinces.find(p=>p.owner===0);s.units=[occupy(s,1,home)];const local=new Engine(s),server=new Engine(structuredClone(s));local.step(3);server.step(3);assert.deepEqual(server.state,local.state);assert.equal(isEliminated(server.state,0),true);assert.equal(server.state.winner,null);assert.equal(validateState(server.state),true);
});
