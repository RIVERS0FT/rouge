import test from 'node:test';import assert from 'node:assert/strict';
import {MAP,SOURCE_MAP,SOURCE_TO_REGION,SOURCE_TOPOLOGY,PREPROCESSED_GROUPING,PLAYABLE_COUNT,provinceAt,provinceByCode,pointInProvince,searchProvinces} from '../src/game/map.ts';
import {createGame,Engine} from '../src/game/engine.ts';
import {regionCapacity,regionProductionRate,reconcileGrouping} from '../src/game/territoryEconomy.ts';
import {stats,DT,MAP_ID} from '../src/game/content.ts';
import {validateState,encodeSave,decodeSave,checksum,SAVE_PREFIX,writeSave,listSaves,deleteSave} from '../src/game/save.ts';
import {applyFrame,encodeFrame} from '../src/platform/replication.ts';
import {validateTerritoryGrouping} from '../src/game/territoryGrouping.ts';
const setups=[{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'steward',loadout:['infantry']}];
test('actual gameplay map retains every source geometry and stable member while reducing operational records',()=>{
 assert.throws(()=>provinceByCode('constructor'),/Unknown province/);assert.throws(()=>provinceByCode('__proto__'),/Unknown province/);
 assert.equal(SOURCE_MAP.length,4596);assert.equal(MAP.length,1162);assert.equal(PLAYABLE_COUNT,1158);
 assert.equal(validateTerritoryGrouping(SOURCE_TOPOLOGY,PREPROCESSED_GROUPING),true);
 assert.equal(PREPROCESSED_GROUPING.lockedParts.length,MAP.length);
 const seen=new Set();for(const region of MAP){assert.equal(region.locked,true);for(const code of region.sourceAtoms){assert.equal(seen.has(code),false);seen.add(code);const source=SOURCE_MAP.find(p=>p.code===code);assert.equal(SOURCE_TO_REGION[code],region.id);assert.equal(provinceByCode(code),region.id);for(const part of source.parts)assert.ok(region.parts.includes(part),'source ring topology is retained, not destructively dissolved');if(source.playable)assert.equal(provinceAt(source.center.x,source.center.z),region.id,code);}}
 assert.equal(seen.size,SOURCE_MAP.length);assert.ok(MAP.some(p=>p.sourceAtoms.length>20));
});
test('source administrative searches resolve to the same selectable production and garrison account',()=>{
 const region=MAP.find(p=>p.playable&&p.sourceAtoms.length>=3),codes=region.sourceAtoms;
 for(const code of codes)assert.equal(searchProvinces(code)[0].id,region.id);
 const s=createGame(setups,42);s.units=[];for(const p of s.provinces){p.owner=-1;p.production=0;}s.provinces[region.id].owner=0;s.provinces[MAP.find(p=>p.playable&&p.id!==region.id).id].owner=1;s.grouping=reconcileGrouping(s);
 const e=new Engine(s);assert.equal(e.state.provinces.length,1162);assert.equal(regionCapacity(region.id),12);assert.equal(regionProductionRate(region.id),1);
 for(const code of codes)assert.equal(e.command(0,{type:'production',province:provinceByCode(code),kind:'infantry'}).ok,true);
 const queue=e.state.provinces[region.id];queue.production=14-DT/2;e.step();
 assert.equal(e.state.units.filter(u=>u.owner===0&&u.province===region.id).length,1,'all original members share one training queue');
 assert.ok(validateState(e.state));
 const group=e.state.grouping.groups.find(g=>g.atoms.includes(region.code));
 assert.equal(e.command(0,{type:'splitGroup',group:group.id,atoms:[codes.find(code=>code!==region.code)],expectedRevision:e.state.grouping.revision}).ok,false);
});
test('capture changes the entire locked preprocessed region and saves/sync preserve its granularity',()=>{
 const region=MAP.find(p=>p.playable&&p.sourceAtoms.length>=3),s=createGame(setups,42);s.units=[];
 for(const p of s.provinces){p.owner=-1;p.production=0;}s.provinces[region.id].owner=1;const home=MAP.find(p=>p.playable&&p.id!==region.id);s.provinces[home.id].owner=0;s.grouping=reconcileGrouping(s);
 const c=region.center;s.units.push({id:s.nextId++,owner:0,kind:'infantry',...c,hp:stats(s.players[0],'infantry').hp,province:region.id,origin:region.id,target:null,destination:null,route:[],cooldown:0});
 const e=new Engine(s);e.step(161);assert.equal(e.state.provinces[region.id].owner,0);
 for(const code of region.sourceAtoms){const raw=SOURCE_MAP.find(p=>p.code===code);if(raw.playable)assert.equal(e.state.provinces[provinceAt(raw.center.x,raw.center.z)].owner,0);}
 assert.equal(e.state.events.filter(ev=>ev.key==='capture').length,1);
 assert.ok(validateState(e.state));assert.deepEqual(decodeSave(encodeSave(e.state,'Whole region')).state,e.state);assert.deepEqual(applyFrame(null,encodeFrame(e.state,undefined,0).frame),e.state);
});
test('pre-contraction saves reject explicitly, while their stored bytes are never overwritten',()=>{
 const s=createGame(setups,42),old={...s,map:'earth-natural-earth-admin1-511-v1'},body=JSON.stringify(old),raw=JSON.stringify({version:1,name:'old',savedAt:new Date().toISOString(),hash:checksum(body),body});
 assert.throws(()=>decodeSave(raw),/incompatibleMap/);assert.throws(()=>applyFrame(null,{type:'state',state:old}),/incompatibleMap/);
 const legacyKey='rouge.save.natural-earth-admin1.v1.same',m=new Map([[legacyKey,raw]]),storage={get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};
 writeSave(storage,'same',s,'new');assert.notEqual(SAVE_PREFIX,'rouge.save.natural-earth-admin1.v1.');assert.equal(listSaves(storage).length,1);deleteSave(storage,'same');assert.equal(m.get(legacyKey),raw);assert.equal(s.map,MAP_ID);
});
