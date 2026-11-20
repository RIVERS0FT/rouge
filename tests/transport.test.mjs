import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {MAP,provinceByCode} from '../src/game/map.ts';
import {stats} from '../src/game/content.ts';
import {terrainSegment,travelCorridorPoint,withinSeaCorridor} from '../src/game/terrain-navigation.ts';
import {reconcileGrouping,regionCapacity} from '../src/game/territoryEconomy.ts';
import {validateState,encodeSave,decodeSave} from '../src/game/save.ts';
import {mapUnitsWithShips} from '../src/render/unitPresentation.ts';
import {garrisonFixture} from './helpers/garrison-fixture.mjs';
const setups=[{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'steward',loadout:['infantry']}];
function fixture(){const s=createGame(setups,21,'terrain-test');s.units=[];for(const p of s.provinces){p.owner=-1;p.production=0;}const from=provinceByCode('GBR-3409'),to=provinceByCode('FRA-5275');s.provinces[from].owner=0;s.provinces[to].owner=1;s.grouping=reconcileGrouping(s);const c=MAP[from].center;s.units.push({id:s.nextId++,owner:0,kind:'infantry',...c,hp:stats(s.players[0],'infantry').hp,province:from,origin:from,target:null,destination:null,route:[],cooldown:0});return{e:new Engine(s),from,to};}
test('army keeps one coordinate route through land and water and saves deterministically',()=>{
 const {e,from,to}=fixture();assert.equal(e.command(0,{type:'march',from,to,fraction:1}).ok,true);const u=e.state.units[0];assert.equal(u.army,e.state.armies[0].id);assert.deepEqual(u.route,[]);assert.equal(u.travel,undefined);assert.ok(e.state.armies[0].formation.route.points.some(p=>p.sea));assert.ok(validateState(e.state));
 const restored=new Engine(decodeSave(encodeSave(e.state,'moving')).state);e.step(25);restored.step(25);assert.deepEqual(e.state,restored.state);assert.ok(validateState(e.state));
});
test('water movement is continuous and remains saveable after embark and reload',()=>{
 const {e,from,to}=fixture();assert.ok(e.command(0,{type:'march',from,to,fraction:1}).ok);const u=e.state.units[0];
 for(let i=0;i<700&&!u.transport?.embarked;i++)e.step();
 assert.equal(e.state.armies[0].formation.phase,'sea');assert.ok(u.transport?.embarked);assert.ok(validateState(e.state));
 u.cooldown=.075;
 const before={x:u.x,z:u.z},v=stats(e.state.players[0],u.kind).seaSpeed;e.step();assert.ok(Math.hypot(u.x-before.x,u.z-before.z)<=v*.05+1e-6);assert.ok(validateState(e.state));
 assert.equal(u.cooldown,.075-.05);
 const restored=new Engine(decodeSave(encodeSave(e.state,'sea')).state);e.step(10);restored.step(10);assert.equal(u.cooldown,0);assert.deepEqual(e.state,restored.state);
});
test('embarkation reserves the berth and pre-existing overlapped ships can sail apart',()=>{
 const {e,from,to}=fixture();assert.ok(e.command(0,{type:'march',from,to,fraction:1}).ok);
 let land;
 for(let tick=0;tick<1000&&e.state.armies[0].formation.phase!=='sea';tick++){
  const army=e.state.armies[0],unit=e.state.units.find(u=>u.army===army.id);
  land={army:structuredClone(army),unit:structuredClone(unit)};e.step();
 }
 const ship=e.state.armies[0];assert.equal(ship.formation.phase,'sea');
 const copy=(state,army,unit)=>{
  const id=state.nextArmy++;state.armies.push({...structuredClone(army),id});
  state.units.push({...structuredClone(unit),army:id,id:state.nextId++});return id;
 };
 const overlap=new Engine(e.state);
 const twin=copy(overlap.state,ship,e.state.units.find(u=>u.army===ship.id));
 const other=overlap.state.armies.find(a=>a.id===twin);
 overlap.step(20);
 assert.ok(Math.hypot(other.formation.position.x-overlap.state.armies[0].formation.position.x,other.formation.position.z-overlap.state.armies[0].formation.position.z)>1.2);
 assert.ok(validateState(overlap.state));
 const queued=copy(e.state,land.army,land.unit);
 e.step();
 assert.equal(e.state.armies.find(a=>a.id===queued).formation.phase,'march');
 for(let i=0;i<120&&e.state.armies.find(a=>a.id===queued).formation.phase==='march';i++)e.step();
 assert.equal(e.state.armies.find(a=>a.id===queued).formation.phase,'sea');assert.ok(validateState(e.state));
});
test('the whole formation shares a single displayed vessel and lands at its destination',()=>{
 const {e,from,to}=fixture(),template=e.state.units[0];
 e.state.provinces[to].owner=0;e.state.provinces[provinceByCode('USA-3521')].owner=1;e.state.grouping=reconcileGrouping(e.state);
 for(let i=0;i<4;i++)e.state.units.push({...template,id:e.state.nextId++});
 assert.ok(e.command(0,{type:'march',from,to,fraction:1}).ok);
 const army=e.state.armies[0];
 for(let i=0;i<1500&&army.formation.phase!=='sea';i++)e.step();
 assert.equal(army.formation.phase,'sea');
 const aboard=e.state.units.filter(u=>u.army===army.id);
 assert.equal(aboard.length,5);assert.ok(aboard.every(u=>u.armyStatus==='sea'&&u.x===aboard[0].x&&u.z===aboard[0].z));
 assert.equal(mapUnitsWithShips(aboard).length,1);
 for(let i=0;i<1500&&e.state.armies.length;i++)e.step();
 assert.equal(e.state.armies.length,0);assert.ok(aboard.every(u=>u.province===to&&u.target===null));
});
test('an island with no room for the square stages the army directly on the water',()=>{
 const {e,from,to}=garrisonFixture({count:12,fromCode:'FSM-4941',toCode:'FRA-5275'});
 for(const u of e.state.units)u.assault=from;
 assert.ok(e.command(0,{type:'march',from,to,fraction:1}).ok);
 const f=e.state.armies[0].formation;
 assert.equal(f.phase,'sea');assert.equal(e.state.provinces[from].march,undefined);
 assert.ok(e.state.units.every(u=>u.assault===undefined));
 assert.ok(Math.hypot(f.position.x-MAP[from].center.x,f.position.z-MAP[from].center.z)<=8.000001);
 assert.equal(mapUnitsWithShips(e.state.units).length,1);
 assert.deepEqual(decodeSave(encodeSave(e.state,'Offshore staging')).state,e.state);
 const next=provinceByCode('FRA-5276');
 assert.ok(e.command(0,{type:'armyMarch',army:e.state.armies[0].id,to:next}).ok);
 assert.ok(e.state.units.every(u=>u.target===next&&u.armyStatus==='sea'));
 assert.ok(validateState(e.state));
});
test('a fleet beside a coastal bend can connect to a nearby part of the sea leg',()=>{
 const position={x:-897.0071165260007,z:-229.9080185937115};
 const route={index:1,points:[{x:-977.3202470599992,z:-240.7908796154382,sea:false},{x:-896.7141404649993,z:-228.68658941680056,sea:true}]};
 assert.equal(terrainSegment(position,travelCorridorPoint(route,position),true),false);
 assert.equal(withinSeaCorridor(route,position),true);
 assert.equal(withinSeaCorridor(route,{x:position.x,z:position.z-8}),false);
});
test('forged water or arbitrary off-route save positions are rejected',()=>{
 const {e,from,to}=fixture();assert.ok(e.command(0,{type:'march',from,to,fraction:1}).ok);const s=structuredClone(e.state);s.units[0].x+=100;assert.equal(validateState(s),false);
});
test('a distant order can cross other factions and use water without administrative waypoints',()=>{
 const {e}=fixture(),s=e.state,from=provinceByCode('CHN-1808'),to=provinceByCode('FRA-5275');
 for(const p of s.provinces)if(MAP[p.id].playable){p.owner=1;p.kind='infantry';}s.provinces[from].owner=0;
 const u=s.units[0];Object.assign(u,{...MAP[from].center,province:from,origin:from});s.grouping=reconcileGrouping(s);
 assert.ok(e.command(0,{type:'march',from,to,fraction:1}).ok);assert.equal(s.armies[0].to,to);assert.deepEqual(u.route,[]);
 const f=s.armies[0].formation;
 assert.ok(f.route.points.some(p=>p.sea));assert.ok(validateState(s));
 assert.deepEqual(f.route.points.at(-1),{...MAP[to].center,sea:false});
});
