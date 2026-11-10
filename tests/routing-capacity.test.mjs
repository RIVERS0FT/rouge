import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {MAP,SOURCE_MAP,provinceByCode,pointInProvince} from '../src/game/map.ts';
import {findRegionRoute} from '../src/game/navigation.ts';
import {validateTravel} from '../src/game/terrain-navigation.ts';
import {UNITS,stats} from '../src/game/content.ts';
import {regionCapacity,regionProductionRate,reconcileGrouping} from '../src/game/territoryEconomy.ts';
import {destinationRoom,regionTroops,regionReservations} from '../src/game/capacity.ts';
import {validateState,encodeSave,decodeSave,writeSave,listSaves,deleteSave,SAVE_PREFIX} from '../src/game/save.ts';
import {encodeFrame,applyFrame} from '../src/platform/replication.ts';
const setups=[{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'steward',loadout:['infantry']}];
const fresh=()=>new Engine(createGame(setups,21,'route-test')),id=provinceByCode;
const from=id('DEU-3487'),target=id('DEU-1574');
function add(s,region,owner,n){for(let k=0;k<n;k++){const c=MAP[region].center;s.units.push({id:s.nextId++,owner,kind:'infantry',x:c.x,z:c.z,hp:stats(s.players[owner],'infantry').hp,province:region,origin:region,target:null,destination:null,route:[],cooldown:0});}}
function empty(){const e=fresh();e.state.units=[];for(const p of e.state.provinces){p.owner=-1;p.production=0;}e.state.provinces[id('USA-3521')].owner=1;return e;}
function ready(e){e.state.grouping=reconcileGrouping(e.state);return e;}
function invariant(s){const counts=new Map();for(const u of s.units){if(!u.travel){const key=`${u.owner}:${u.province}`;counts.set(key,(counts.get(key)??0)+1);assert.ok(counts.get(key)<=regionCapacity(u.province),key);}assert.ok(u.transport?.embarked||pointInProvince(u.province,u.x,u.z));}}
test('source atlas retains UK and Ireland detail while gameplay uses locked merged regions',()=>{
 for(const code of ['GBR-3409','GBR-2745','GBR-2764','CHN-1807','CHN-1808'])assert.ok(MAP[id(code)].playable);
 assert.equal(MAP.length,1162);assert.ok(SOURCE_MAP.filter(p=>p.code.startsWith('GBR-')).length>100);assert.ok(SOURCE_MAP.filter(p=>p.code.startsWith('IRL-')).length>=20);
});
test('remote terrain order saves actual waypoints, crosses boundaries without teleporting and restores deterministically',()=>{
 const e=empty();e.state.provinces[from].owner=0;add(e.state,from,0,regionCapacity(from));ready(e);
 assert.ok(findRegionRoute(from,target).length>=3);const before=e.state.units.map(u=>({x:u.x,z:u.z}));
 assert.equal(e.command(0,{type:'march',from,to:target,fraction:1}).ok,true);assert.deepEqual(e.state.units.map(u=>({x:u.x,z:u.z})),before);
 for(const u of e.state.units){assert.equal(u.destination,target);assert.deepEqual(u.route,[]);assert.ok(validateTravel(u.travel,u,MAP[target].center));}
 const restored=decodeSave(encodeSave(e.state,'Moving')).state;assert.deepEqual(restored,e.state);const other=new Engine(restored);
 for(let i=0;i<150;i++){e.step(20);other.step(20);invariant(e.state);}assert.deepEqual(e.state,other.state);
 assert.equal(e.state.provinces[target].owner,0);assert.ok(e.state.units.some(u=>u.owner===0&&u.province===target&&!u.travel));assert.ok(validateState(e.state));
});
test('remote order fights nearby defenders before proceeding to occupy its final destination',()=>{
 const e=empty();e.state.provinces[from].owner=0;add(e.state,from,0,regionCapacity(from));add(e.state,from,1,1);ready(e);
 const defender=e.state.units.find(u=>u.owner===1).id;assert.ok(e.command(0,{type:'march',from,to:target,fraction:1}).ok);
 e.step(3000);invariant(e.state);assert.equal(e.state.provinces[target].owner,0);assert.ok(!e.state.units.some(u=>u.id===defender));assert.ok(e.state.players[0].xp>0||e.state.players[0].level>1);
});
test('islands have no land adjacency; forged ownership and invalid IDs never mutate state',()=>{
 const e=fresh(),before=structuredClone(e.state),home=e.state.provinces.find(p=>p.owner===0).id;
 assert.equal(findRegionRoute(from,id('USA-3517')),null);assert.equal(findRegionRoute(from,id('GBR-3409')),null);
 for(const to of [-1,MAP.length,NaN])assert.equal(e.command(0,{type:'march',from:home,to,fraction:1}).ok,false);
 assert.equal(e.command(1,{type:'march',from:home,to:target,fraction:1}).ok,false);assert.deepEqual(e.state,before);
});
test('administrative adjacency helper can avoid a blocked edge without inventing sea bridges',()=>{
 const path=findRegionRoute(from,target);assert.ok(path);const other=findRegionRoute(from,target,new Set([`${path[0]}:${path[1]}`]));assert.ok(other);assert.notEqual(other[1],path[1]);for(let i=1;i<other.length;i++)assert.ok(MAP[other[i-1]].neighbors.includes(other[i]));
});
test('480 stationed battalions exceed removed global limits and survive production, saves and LAN',()=>{
 const e=empty(),regions=MAP.filter(p=>p.playable&&regionCapacity(p.id)===12&&p.code!=='USA-3521').slice(0,40).map(p=>p.id);assert.equal(regions.length,40);
 for(const r of regions){e.state.provinces[r].owner=0;e.state.provinces[r].production=UNITS.infantry.train-.025*regionProductionRate(r);add(e.state,r,0,11);}ready(e);
 assert.equal(e.state.units.length,440);e.step();assert.equal(e.state.units.filter(u=>u.owner===0).length,480);invariant(e.state);assert.ok(validateState(e.state));
 assert.deepEqual(decodeSave(encodeSave(e.state,'Large army')).state,e.state);assert.deepEqual(applyFrame(null,encodeFrame(e.state,undefined,0).frame),e.state);
 e.step(300);assert.equal(e.state.units.filter(u=>u.owner===0).length,480);const victim=e.state.units.find(u=>u.province===regions[0]);e.state.units=e.state.units.filter(u=>u!==victim);e.step(300);assert.equal(e.state.units.filter(u=>u.owner===0).length,480);assert.equal(regionTroops(e.state,0,regions[0]),12);
});
test('destination reservations cap dispatch and prevent oversubscription and competing production',()=>{
 const e=empty();e.state.provinces[from].owner=e.state.provinces[target].owner=0;add(e.state,from,0,regionCapacity(from));add(e.state,target,0,regionCapacity(target)-2);ready(e);
 assert.equal(destinationRoom(e.state,0,target),2);assert.ok(e.command(0,{type:'march',from,to:target,fraction:1}).ok);assert.equal(regionReservations(e.state,0,target),2);assert.equal(destinationRoom(e.state,0,target),0);
 assert.deepEqual(e.command(0,{type:'march',from,to:target,fraction:1}),{ok:false,error:'targetFull'});e.state.provinces[target].production=13.99;e.step();assert.equal(regionTroops(e.state,0,target),regionCapacity(target)-2);
 e.step(3000);assert.equal(regionTroops(e.state,0,target),regionCapacity(target));invariant(e.state);assert.ok(validateState(e.state));
});
test('dispatch never creates a free home production slot before troops physically leave',()=>{
 const e=empty();e.state.provinces[from].owner=0;add(e.state,from,0,regionCapacity(from));ready(e);e.state.provinces[from].production=13.99;
 assert.ok(e.command(0,{type:'march',from,to:target,fraction:.5}).ok);e.step();assert.equal(regionTroops(e.state,0,from),regionCapacity(from));assert.equal(e.state.provinces[from].production,13.99);
});
test('continuous terrain travel does not route through or require capture of intermediate administrative centers',()=>{
 const e=empty();e.state.provinces[from].owner=0;add(e.state,from,0,1);ready(e);assert.ok(e.command(0,{type:'march',from,to:target,fraction:1}).ok);
 const u=e.state.units[0];assert.deepEqual(u.route,[]);assert.equal(u.target,target);assert.ok(validateTravel(u.travel,u,MAP[target].center));
 const direct=Math.hypot(MAP[target].center.x-u.x,MAP[target].center.z-u.z),distance=u.travel.points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-u.travel.points[i].x,p.z-u.travel.points[i].z),0);assert.ok(distance>=direct-1e-6);
 e.step(3000);assert.equal(e.state.provinces[target].owner,0);invariant(e.state);
});
test('save rejects excess garrison and forged terrain waypoints, without limiting total army',()=>{
 const e=empty();e.state.provinces[from].owner=0;add(e.state,from,0,regionCapacity(from)+1);ready(e);assert.equal(validateState(e.state),false);e.state.units.pop();assert.ok(validateState(e.state));
 assert.ok(e.command(0,{type:'march',from,to:target,fraction:.5}).ok);const moving=e.state.units.find(u=>u.travel);assert.ok(moving);moving.travel.points.at(-1).x+=100;assert.equal(validateState(e.state),false);
});
test('new-map save namespace preserves old pixel-map saves',()=>{
 const map=new Map([['rouge.save.state-regions.v1.keep','old-campaign']]);const storage={get length(){return map.size},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 writeSave(storage,'keep',fresh().state,'New atlas');assert.equal(listSaves(storage).length,1);assert.ok(SAVE_PREFIX.includes('natural-earth-admin1'));deleteSave(storage,'keep');assert.equal(map.get('rouge.save.state-regions.v1.keep'),'old-campaign');
});
