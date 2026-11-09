import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {MAP,provinceByCode,STARTS,pointInProvince} from '../src/game/map.ts';
import {findRegionRoute,Navigator} from '../src/game/navigation.ts';
import {PROVINCE_CAP,UNITS,stats} from '../src/game/content.ts';
import {destinationRoom,regionTroops,regionReservations} from '../src/game/capacity.ts';
import {validateState,encodeSave,decodeSave,writeSave,listSaves,deleteSave,SAVE_PREFIX} from '../src/game/save.ts';
import {encodeFrame,applyFrame} from '../src/platform/replication.ts';
const setups=[{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'steward',loadout:['infantry']}];
const fresh=()=>new Engine(createGame(setups,21,'route-test'));
const id=provinceByCode;
function add(s,region,owner,n){
 for(let k=0;k<n;k++){const c=MAP[region].center;s.units.push({id:s.nextId++,owner,kind:'infantry',x:c.x,z:c.z,hp:stats(s.players[owner],'infantry').hp,province:region,origin:region,target:null,destination:null,route:[],cooldown:0});}
}
function empty(){const e=fresh();e.state.units=[];for(const p of e.state.provinces){p.owner=-1;p.production=0;}e.state.provinces[id('STATE_CALIFORNIA')].owner=1;return e;}
function invariant(s){const counts=new Map();for(const u of s.units){const key=`${u.owner}:${u.province}`;counts.set(key,(counts.get(key)??0)+1);assert.ok(counts.get(key)<=PROVINCE_CAP,key);assert.ok(pointInProvince(u.province,u.x,u.z));}}

test('management atlas has the nine Great Britain and four Ireland regions, without national subdivisions',()=>{
 const britain=['HOME_COUNTIES','LANCASHIRE','YORKSHIRE','MIDLANDS','EAST_ANGLIA','WEST_COUNTRY','WALES','HIGHLANDS','LOWLANDS'];
 const ireland=['ULSTER','MUNSTER','LEINSTER','CONNAUGHT'];
 for(const code of [...britain,...ireland])assert.ok(MAP[id('STATE_'+code)].playable);
 assert.equal(new Set([...britain,...ireland]).size,13);
 assert.equal(MAP.length,675);assert.ok(MAP.every(p=>!('country' in p)));
});
test('remote order retains a multi-leg route and marches without teleporting',()=>{
 const e=empty(),from=id('STATE_BRANDENBURG'),target=id('STATE_BAVARIA');
 e.state.provinces[from].owner=0;add(e.state,from,0,6);
 assert.ok(!MAP[from].neighbors.includes(target));
 const before=e.state.units.map(u=>({x:u.x,z:u.z}));
 assert.equal(e.command(0,{type:'march',from,to:target,fraction:1}).ok,true);
 assert.deepEqual(e.state.units.map(u=>({x:u.x,z:u.z})),before);
 const path=[from,e.state.units[0].target,...e.state.units[0].route];assert.ok(path.length>=4);
 assert.equal(path.at(-1),target);for(let i=1;i<path.length;i++)assert.ok(MAP[path[i-1]].neighbors.includes(path[i]));
 const restored=decodeSave(encodeSave(e.state,'Moving')).state;assert.deepEqual(restored,e.state);
 const fromSave=new Engine(restored);
 for(let i=0;i<200;i++){e.step(20);fromSave.step(20);invariant(e.state);}
 assert.deepEqual(e.state,fromSave.state);assert.equal(e.state.provinces[target].owner,0);
 const captures=e.state.events.filter(e=>e.key==='capture').map(e=>e.province);
 for(const middle of path.slice(1,-1))assert.ok(captures.includes(middle));
 assert.ok(e.state.units.some(u=>u.owner===0&&u.province===target&&u.target===null));assert.ok(validateState(e.state));
});
test('a remote march fights defenders and captures intermediate enemy regions before continuing',()=>{
 const e=empty(),from=id('STATE_BRANDENBURG'),target=id('STATE_BAVARIA'),middle=id('STATE_SAXONY');
 e.state.provinces[from].owner=0;e.state.provinces[middle].owner=1;add(e.state,from,0,10);add(e.state,middle,1,2);
 const defenderIDs=e.state.units.filter(u=>u.owner===1).map(u=>u.id);
 assert.equal(e.command(0,{type:'march',from,to:target,fraction:1}).ok,true);
 for(let n=0;n<250;n++){e.step(20);invariant(e.state);}
 assert.equal(e.state.provinces[middle].owner,0);assert.equal(e.state.provinces[target].owner,0);
 assert.ok(defenderIDs.every(id=>!e.state.units.some(u=>u.id===id)));assert.ok(e.state.players[0].xp>0||e.state.players[0].level>1);
});
test('islands remain disconnected by land; invalid IDs and forged ownership never mutate state',()=>{
 const e=fresh(),before=structuredClone(e.state),from=e.state.provinces.find(p=>p.owner===0).id;
 for(const to of [id('STATE_HOME_COUNTIES'),id('STATE_HAWAIIAN_ISLANDS')])assert.equal(e.navigation.route(e.state,0,from,to,false),null);
 for(const to of [-1,MAP.length,NaN])assert.equal(e.command(0,{type:'march',from,to,fraction:1}).ok,false);
 assert.equal(e.command(1,{type:'march',from,to:STARTS[1],fraction:1}).ok,false);
 assert.deepEqual(e.state,before);assert.equal(findRegionRoute(-1,0),null);
});
test('blocked local corridor replans to another land route instead of crossing sea',()=>{
 const from=id('STATE_BRANDENBURG'),to=id('STATE_BAVARIA'),original=findRegionRoute(from,to);assert.ok(original);
 const blocked=new Set([`${original[0]}:${original[1]}`]);const other=findRegionRoute(from,to,blocked);assert.ok(other);assert.notEqual(other[1],original[1]);
 for(let i=1;i<other.length;i++)assert.ok(MAP[other[i-1]].neighbors.includes(other[i]));
});
test('production can exceed both old 90-player and 360-global limits and saves retain every unit',()=>{
 const e=empty();
 for(let region=0;region<40;region++){e.state.provinces[region].owner=0;e.state.provinces[region].production=UNITS.infantry.train-.01;add(e.state,region,0,PROVINCE_CAP-1);}
 assert.equal(e.state.units.length,440);e.step();assert.equal(e.state.units.length,480);invariant(e.state);
 assert.equal(e.state.units.filter(u=>u.owner===0).length,480);assert.ok(validateState(e.state));
 assert.deepEqual(decodeSave(encodeSave(e.state,'Large army')).state,e.state);
 assert.deepEqual(applyFrame(null,encodeFrame(e.state,undefined,0).frame),e.state);
 e.step(300);assert.equal(e.state.units.filter(u=>u.owner===0).length,480);invariant(e.state);
 // Losing one local battalion permits exactly that region to refill; others are unaffected.
 const victim=e.state.units.find(u=>u.province===0);e.state.units=e.state.units.filter(u=>u!==victim);e.step(300);
 assert.equal(e.state.units.filter(u=>u.owner===0).length,480);assert.equal(regionTroops(e.state,0,0),PROVINCE_CAP);
});
test('reinforcement reserves destination slots, limits dispatch to room and blocks oversubscription',()=>{
 const e=empty(),from=id('STATE_BRANDENBURG'),to=id('STATE_BAVARIA');
 for(const r of findRegionRoute(from,to))e.state.provinces[r].owner=0;
 add(e.state,from,0,10);add(e.state,to,0,10);
 assert.equal(destinationRoom(e.state,0,to),2);
 assert.equal(e.command(0,{type:'march',from,to,fraction:1}).ok,true);
 assert.equal(e.state.units.filter(u=>u.destination===to).length,2);
 assert.equal(regionReservations(e.state,0,to),2);assert.equal(destinationRoom(e.state,0,to),0);
 assert.deepEqual(e.command(0,{type:'march',from,to,fraction:1}),{ok:false,error:'targetFull'});
 // Destination production is held while those two incoming slots are reserved.
 e.state.provinces[to].production=13.99;e.step();assert.equal(regionTroops(e.state,0,to),10);
 for(let i=0;i<180;i++){e.step(20);invariant(e.state);}
 assert.equal(regionTroops(e.state,0,to),12);assert.ok(validateState(e.state));
});
test('marching troops count toward local capacity until they physically leave, not at command time',()=>{
 const e=empty(),from=id('STATE_BRANDENBURG'),to=id('STATE_SAXONY');
 e.state.provinces[from].owner=0;add(e.state,from,0,PROVINCE_CAP);e.state.provinces[from].production=13.99;
 assert.equal(e.command(0,{type:'march',from,to,fraction:.5}).ok,true);e.step();
 assert.equal(regionTroops(e.state,0,from),PROVINCE_CAP);assert.equal(e.state.provinces[from].production,13.99);
});
test('full intermediate friendly regions queue incoming units at borders and resume after slots open',()=>{
 const e=empty(),from=id('STATE_BRANDENBURG'),to=id('STATE_BAVARIA'),path=findRegionRoute(from,to),middle=path[1];
 for(const r of path)e.state.provinces[r].owner=0;
 add(e.state,from,0,5);const travelers=e.state.units.map(u=>u.id);add(e.state,middle,0,PROVINCE_CAP);
 assert.equal(e.command(0,{type:'march',from,to,fraction:1}).ok,true);
 e.step(600);invariant(e.state);assert.ok(travelers.every(id=>e.state.units.find(u=>u.id===id).province===from));
 e.state.units=e.state.units.filter(u=>!(u.owner===0&&u.province===middle));
 for(let n=0;n<180;n++){e.step(20);invariant(e.state);}
 assert.ok(travelers.some(id=>e.state.units.find(u=>u.id===id)?.province===to));
});
test('save validation enforces local capacity and route continuity, not aggregate army size',()=>{
 const e=empty(),region=STARTS[0];e.state.provinces[region].owner=0;add(e.state,region,0,13);assert.equal(validateState(e.state),false);
 e.state.units.pop();assert.ok(validateState(e.state));
 e.command(0,{type:'march',from:region,to:STARTS[1],fraction:.5});const moving=e.state.units.find(u=>u.target!==null);assert.ok(moving);
 moving.route=[id('STATE_HAWAIIAN_ISLANDS'),STARTS[1]];assert.equal(validateState(e.state),false);
});
test('new save namespace never reads or deletes administrative-map saves',()=>{
 const map=new Map([['rouge.save.earth.miller.crop.v1.keep','old-campaign']]);
 const storage={get length(){return map.size},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 writeSave(storage,'keep',fresh().state,'New atlas');assert.equal(listSaves(storage).length,1);assert.ok(SAVE_PREFIX.includes('state-regions'));
 deleteSave(storage,'keep');assert.equal(map.get('rouge.save.earth.miller.crop.v1.keep'),'old-campaign');
});
