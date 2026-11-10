import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {MAP,provinceByCode} from '../src/game/map.ts';
import {stats} from '../src/game/content.ts';
import {reconcileGrouping,regionCapacity} from '../src/game/territoryEconomy.ts';
import {validateState,encodeSave,decodeSave} from '../src/game/save.ts';
const setups=[{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'steward',loadout:['infantry']}];
function fixture(){const s=createGame(setups,21,'terrain-test');s.units=[];for(const p of s.provinces){p.owner=-1;p.production=0;}const from=provinceByCode('GBR-3409'),to=provinceByCode('FRA-5275');s.provinces[from].owner=0;s.provinces[to].owner=1;s.grouping=reconcileGrouping(s);const c=MAP[from].center;s.units.push({id:s.nextId++,owner:0,kind:'infantry',...c,hp:stats(s.players[0],'infantry').hp,province:from,origin:from,target:null,destination:null,route:[],cooldown:0});return{e:new Engine(s),from,to};}
test('march stores coordinate travel, no intermediate administrative route, and saves deterministically',()=>{
 const {e,from,to}=fixture();assert.equal(e.command(0,{type:'march',from,to,fraction:1}).ok,true);const u=e.state.units[0];assert.equal(u.target,to);assert.deepEqual(u.route,[]);assert.ok(u.travel.points.some(p=>p.sea));assert.ok(validateState(e.state));
 const restored=new Engine(decodeSave(encodeSave(e.state,'moving')).state);e.step(25);restored.step(25);assert.deepEqual(e.state,restored.state);assert.ok(validateState(e.state));
});
test('water movement is continuous and remains saveable after embark and reload',()=>{
 const {e,from,to}=fixture();assert.ok(e.command(0,{type:'march',from,to,fraction:1}).ok);const u=e.state.units[0],points=u.travel.points,index=points.findIndex((p,i)=>i>0&&p.sea);assert.ok(index>0);
 // Put the fixture at the exact beginning of a certified sea segment, not teleport in runtime.
 const a=points[index-1];u.x=a.x;u.z=a.z;u.travel.index=index;u.transport={from,to,index,embarked:true};assert.ok(validateState(e.state));
 const before={x:u.x,z:u.z},v=stats(e.state.players[0],u.kind).seaSpeed;e.step();assert.ok(Math.hypot(u.x-before.x,u.z-before.z)<=v*.05+1e-6);assert.ok(validateState(e.state));
 const restored=new Engine(decodeSave(encodeSave(e.state,'sea')).state);e.step(10);restored.step(10);assert.deepEqual(e.state,restored.state);
});
test('forged water or arbitrary off-route save positions are rejected',()=>{
 const {e,from,to}=fixture();assert.ok(e.command(0,{type:'march',from,to,fraction:1}).ok);const s=structuredClone(e.state);s.units[0].x+=100;assert.equal(validateState(s),false);
});
test('a distant land order may cross other factions without administrative waypoints',()=>{
 const {e}=fixture(),s=e.state,from=provinceByCode('CHN-1808'),to=provinceByCode('FRA-5275');
 for(const p of s.provinces)if(MAP[p.id].playable){p.owner=1;p.kind='infantry';}s.provinces[from].owner=0;
 const u=s.units[0];Object.assign(u,{...MAP[from].center,province:from,origin:from});s.grouping=reconcileGrouping(s);
 assert.ok(e.command(0,{type:'march',from,to,fraction:1}).ok);assert.equal(u.target,to);assert.deepEqual(u.route,[]);assert.ok(u.travel.points.every(p=>!p.sea));assert.ok(validateState(s));
});
