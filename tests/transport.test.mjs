import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,createGame} from '../src/game/engine.ts';
import {MAP,pointInProvince} from '../src/game/map.ts';
import {seaRoute,onSeaSegment} from '../src/game/sea.ts';
import {regionTroops,regionReservations} from '../src/game/capacity.ts';
import {encodeSave,decodeSave,validateState} from '../src/game/save.ts';
import {Navigator} from '../src/game/navigation.ts';
const id=code=>MAP.find(p=>p.code===code).id;
const from=id('STATE_HOME_COUNTIES'),to=id('STATE_NORMANDY');
function fixture(){
 const e=new Engine(createGame([{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'warden',loadout:['infantry']}],42));
 e.state.provinces.forEach(p=>{p.owner=-1;p.production=0});e.state.provinces[from].owner=0;e.state.provinces[to].owner=1;
 const u=e.state.units[0];Object.assign(u,{owner:0,x:MAP[from].center.x,z:MAP[from].center.z,province:from,origin:from});e.state.units=[u];return e;
}
function launch(e){assert.deepEqual(e.command(0,{type:'march',from,to,fraction:1}),{ok:true});return e.state.units[0];}
function until(e,predicate,limit=2000){for(let i=0;i<limit;i++){if(predicate())return i;e.step();}assert.fail('simulation did not reach expected transport phase');}
test('cross-channel order walks to port, sails certified legs at sea speed, lands and captures',()=>{
 const e=fixture(),u=launch(e),before={x:u.x,z:u.z};assert.deepEqual(before,MAP[from].center);assert.ok(!u.transport.embarked);
 until(e,()=>u.transport?.embarked);assert.equal(regionTroops(e.state,0,from),0);assert.equal(regionReservations(e.state,0,to),1);
 const sea=seaRoute(from,to);let sailed=false;
 while(u.transport){const t={...u.transport},p={x:u.x,z:u.z};e.step();if(t.embarked){sailed=true;assert.ok(Math.hypot(p.x-u.x,p.z-u.z)<=3*.05+1e-8);if(u.transport)assert.ok(onSeaSegment(u,sea.waypoints[u.transport.index-1],sea.waypoints[u.transport.index],.001));}}
 assert.ok(sailed);assert.equal(u.province,to);assert.ok(pointInProvince(to,u.x,u.z));assert.equal(regionReservations(e.state,0,to),0);
 until(e,()=>e.state.provinces[to].owner===0);assert.equal(u.target,null);assert.ok(validateState(e.state));
});
test('save reload resumes exact mid-voyage state and rejects forged transport position or leg',()=>{
 const a=fixture(),u=launch(a);until(a,()=>u.transport?.embarked);a.step(30);
 const b=new Engine(decodeSave(encodeSave(a.state,'At sea')).state);a.step(400);b.step(400);assert.deepEqual(a.state,b.state);
 const c=fixture(),v=launch(c);until(c,()=>v.transport?.embarked);assert.ok(validateState(c.state));
 for(const mutate of [s=>s.units[0].x+=20,s=>s.units[0].transport.index=99999,s=>s.units[0].transport.to=from,s=>delete s.units[0].transport,s=>s.units[0].transport.embarked='yes']){const bad=structuredClone(c.state);mutate(bad);assert.equal(validateState(bad),false);}
});
test('full landing region queues transport offshore without deleting or overfilling troops',()=>{
 const e=fixture(),u=launch(e);until(e,()=>u.transport?.embarked);
 e.state.provinces[to].owner=0;e.state.provinces[id('STATE_BAVARIA')].owner=1;
 for(let i=0;i<12;i++){e.state.units.push({...structuredClone(u),id:e.state.nextId++,x:MAP[to].center.x,z:MAP[to].center.z,province:to,origin:to,target:null,destination:null,route:[],transport:undefined});}
 until(e,()=>u.transport?.index===seaRoute(from,to).waypoints.length-1);
 const p={x:u.x,z:u.z};e.step(40);assert.deepEqual({x:u.x,z:u.z},p);assert.equal(regionTroops(e.state,0,to),12);assert.ok(validateState(e.state));
 e.state.units.splice(e.state.units.findIndex(v=>v.id!==u.id&&v.province===to),1);e.step(2);assert.equal(u.transport,undefined);assert.equal(regionTroops(e.state,0,to),12);
});
test('embarked battalions neither attack each other nor capture or count as land garrison',()=>{
 const e=fixture(),u=launch(e);until(e,()=>u.transport?.embarked);
 const v={...structuredClone(u),id:e.state.nextId++,owner:1};e.state.units.push(v);const hp=u.hp;
 e.step(40);assert.equal(u.hp,hp);assert.equal(v.hp,hp);assert.equal(e.state.provinces[from].capture,0);assert.equal(regionTroops(e.state,0,from),0);
});
test('land corridor remains preferred and AI on an isolated coastal island orders transport',()=>{
 const e=fixture(),n=MAP[from].neighbors[0];assert.ok(n>=0);const nav=new Navigator();assert.deepEqual(nav.route(e.state,0,from,n),nav.route(e.state,0,from,n,false));
 const island=id('STATE_HAWAIIAN_ISLANDS'),u=e.state.units[0];e.state.provinces[from].owner=-1;e.state.provinces[island].owner=0;e.state.players[0].ai=true;
 Object.assign(u,{x:MAP[island].center.x,z:MAP[island].center.z,province:island,origin:island});
 for(let i=0;i<4;i++)e.state.units.push({...structuredClone(u),id:e.state.nextId++});
 e.step(80);assert.ok(e.state.units.some(v=>v.owner===0&&v.target!==null&&v.transport),'island AI must select and order a certified sea destination');
});
