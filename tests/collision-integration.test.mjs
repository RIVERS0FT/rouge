import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {MAP,provinceByCode,pointInProvince} from '../src/game/map.ts';
import {reconcileGrouping,regionCapacity} from '../src/game/territoryEconomy.ts';
import {terrainClearance,terrainSegment,validateTravel,distanceToTravelSegment} from '../src/game/terrain-navigation.ts';
import {UNIT_RADIUS} from '../src/game/collision.ts';
import {validateState,encodeSave,decodeSave} from '../src/game/save.ts';
import {encodeFrame,applyFrame} from '../src/platform/replication.ts';
const setups=[{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'steward',loadout:['infantry']}];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function fixture(count=4){
 const e=new Engine(createGame(setups,21)),s=e.state,from=provinceByCode('DEU-3487');s.units=[];
 for(const p of s.provinces){p.owner=-1;p.production=0;}
 s.provinces[from].owner=0;s.provinces[provinceByCode('USA-3521')].owner=1;s.grouping=reconcileGrouping(s);
 for(let i=0;i<count;i++)s.units.push({id:s.nextId++,owner:0,kind:'infantry',...MAP[from].center,hp:100,province:from,origin:from,target:null,destination:null,route:[],cooldown:0});
 return{e,s,from};
}
test('resting stack resolves on land without province drift and remains save/LAN compatible',()=>{
 const {e,s,from}=fixture();const rng=s.rng;e.step(30);
 assert.equal(s.rng,rng);assert.ok(s.units.every(u=>u.province===from&&pointInProvince(from,u.x,u.z)));
 for(const a of s.units)for(const b of s.units)if(a.id<b.id)assert.ok(distance(a,b)>=UNIT_RADIUS[a.kind]+UNIT_RADIUS[b.kind]-1e-4);
 assert.ok(validateState(s));assert.deepEqual(decodeSave(encodeSave(s,'separated')).state,s);
 const initial=encodeFrame(s,undefined,0),client=applyFrame(null,structuredClone(initial.frame));e.step();
 assert.deepEqual(applyFrame(client,structuredClone(encodeFrame(s,initial.base,0).frame)),s);
});
test('mid-route pushes retain bounded local corridors, shared navigation and deterministic save replay',()=>{
 const {e,s,from}=fixture(),to=provinceByCode('DEU-1574');assert.ok(e.command(0,{type:'march',from,to,fraction:1}).ok);
 const builds=e.navigation.builds,ids=s.units.filter(u=>u.travel).map(u=>u.id);e.step(3);
 assert.equal(e.navigation.builds,builds);assert.ok(s.units.some(u=>u.travel&&distanceToTravelSegment(u.travel,u)>1e-4));
 for(const u of s.units.filter(u=>ids.includes(u.id)&&u.travel))assert.ok(validateTravel(u.travel,u,MAP[to].center));
 assert.ok(validateState(s));const restored=new Engine(decodeSave(encodeSave(s,'crowded march')).state);
 e.step(40);restored.step(40);assert.deepEqual(e.state,restored.state);
 const forged=structuredClone(s),u=forged.units.find(u=>u.travel);u.x+=100;assert.equal(validateState(forged),false);
 const route=structuredClone(s);route.units.find(u=>u.travel).travel.points.at(-1).x+=1;assert.equal(validateState(route),false);
});
test('coastal separation preserves land segments and never worsens footprint clearance',()=>{
 const {e,s}=fixture(2),province=MAP.find(p=>p.playable&&regionCapacity(p.id)>=2&&terrainClearance(p.center,.46)<.4);
 assert.ok(province);for(const p of s.provinces)if(p.owner===0)p.owner=-1;s.provinces[province.id].owner=0;s.grouping=reconcileGrouping(s);
 for(const u of s.units)Object.assign(u,{...province.center,province:province.id,origin:province.id});
 const before=s.units.map(u=>({...u,clearance:terrainClearance(u,.46)}));e.step();
 s.units.forEach((u,i)=>{assert.ok(pointInProvince(u.province,u.x,u.z));assert.ok(terrainSegment(before[i],u,false));assert.ok(terrainClearance(u,.46)+1e-8>=before[i].clearance);});assert.ok(validateState(s));
});
