import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {MAP,SOURCE_MAP,SOURCE_TOPOLOGY,PREPROCESSED_GROUPING,BOUNDS,provinceByCode,provinceAt,searchProvinces} from '../src/game/map.ts';
import {createTerritoryGrouping,applyTerritoryGrouping,validateTerritoryGrouping} from '../src/game/territoryGrouping.ts';
import {buildBorderEdges} from '../src/render/territoryBorders.ts';
import {createGame,Engine} from '../src/game/engine.ts';
import {regionCapacity,regionProductionRate,reconcileGrouping} from '../src/game/territoryEconomy.ts';
import {stats,DT,MAP_ID} from '../src/game/content.ts';
import {encodeSave,decodeSave,checksum,SAVE_PREFIX,writeSave,listSaves,deleteSave,validateState} from '../src/game/save.ts';
import {applyFrame,encodeFrame} from '../src/platform/replication.ts';
const members=['KAB+00?','KAZ-3197','KAZ-3203','KAZ-3251','KAZ-3252'];
const region=MAP[provinceByCode('KAZ-3203')],baikonur=SOURCE_MAP.find(p=>p.code==='KAB+00?');
const setups=[{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'steward',loadout:['infantry']}];
const partition=JSON.parse(gunzipSync(readFileSync(new URL('../data/gameplay-region-partition.json.gz',import.meta.url))));
const segmentKey=e=>[e.a,e.b].map(p=>`${p.x.toFixed(6)},${p.z.toFixed(6)}`).sort().join('|');
function game(owner=0){const s=createGame(setups,42);s.units=[];for(const p of s.provinces){p.owner=-1;p.production=0;}s.provinces[region.id].owner=owner;s.provinces[provinceByCode('CHN-1808')].owner=1-owner;s.grouping=reconcileGrouping(s);return s;}

test('explicit Baikonur merge changes only the two requested groups, preserving every other partition byte',()=>{
 assert.deepEqual(region.sourceAtoms,members);assert.deepEqual(region.name,['卡拉干达州','Qaraghandy']);
 const unchanged=partition.groups.filter(g=>g.id!=='group:KAB+00?');
 assert.equal(createHash('sha256').update(JSON.stringify(unchanged)).digest('hex'),'749c227b1517790d10957c23c3447bb7d4b75c267f5da6fb76afca770119e35d');
 assert.equal(partition.operations.filter(o=>o.type==='explicit-merge').length,1);
 assert.equal(partition.summary.explicitMerges,1);
 assert.deepEqual(baikonur.neighbors.map(id=>SOURCE_MAP[id].code),['KAZ-3197'],'Baikonur touches Qyzylorda, not the original Qaraghandy atom');
 const expectedNeighbors=new Set(members.flatMap(code=>SOURCE_MAP.find(p=>p.code===code).neighbors).map(id=>provinceByCode(SOURCE_MAP[id].code)));expectedNeighbors.delete(region.id);
 assert.deepEqual(region.neighbors,[...expectedNeighbors].sort((a,b)=>a-b));
 assert.ok(validateTerritoryGrouping(SOURCE_TOPOLOGY,PREPROCESSED_GROUPING));
 for(const code of members){const source=SOURCE_MAP.find(p=>p.code===code);assert.equal(provinceByCode(code),region.id);assert.equal(provinceAt(source.center.x,source.center.z),region.id);for(const part of source.parts)assert.ok(region.parts.includes(part));}
 for(const query of ['拜科努尔','Baykonur','KAB+00?','卡拉干达','Qaraghandy','KAZ-3203'])assert.deepEqual(searchProvinces(query).map(p=>p.id),[region.id]);
});

test('Baikonur border disappears as an internal source seam without editing the retained enclave and surrounding hole',()=>{
 const sourceEdges=buildBorderEdges(SOURCE_MAP,BOUNDS).filter(e=>e.atoms.includes(baikonur.id));
 assert.ok(sourceEdges.length>0);assert.ok(sourceEdges.every(e=>e.atoms.length===2&&e.atoms.some(id=>SOURCE_MAP[id].code==='KAZ-3197')));
 const runtimeKeys=new Set(buildBorderEdges(MAP,BOUNDS).map(segmentKey));
 for(const edge of sourceEdges)assert.equal(runtimeKeys.has(segmentKey(edge)),false,'No leftover coastline, country or selection seam at the enclave');
 assert.equal(MAP.reduce((n,p)=>n+p.parts.length,0),SOURCE_MAP.reduce((n,p)=>n+p.parts.length,0));
 // A future explicit unlock can still separate this entire original atom.
 const unlocked=createTerritoryGrouping(SOURCE_TOPOLOGY,PREPROCESSED_GROUPING.groups.map(g=>g.atoms));
 const ledger=Object.fromEntries(SOURCE_MAP.map(p=>[p.code,{owner:0,troops:0,production:0,productionRate:1,capacity:12}]));
 const result=applyTerritoryGrouping(SOURCE_TOPOLOGY,unlocked,ledger,0,{type:'split',mapId:unlocked.mapId,expectedRevision:0,group:unlocked.atomToGroup['KAB+00?'],atoms:['KAB+00?']});
 assert.equal(result.ok,true);assert.equal(result.state.groups.length,MAP.length+1);assert.deepEqual(result.state.groups.find(g=>g.atoms.includes('KAB+00?')).atoms,['KAB+00?']);
});

test('Baikonur and Karaganda have one queue, garrison, capture, ownership count and saved/networked record',()=>{
 const s=game();const e=new Engine(s);assert.equal(s.provinces.filter(p=>p.owner===0).length,1);assert.equal(regionCapacity(region.id),12);assert.equal(regionProductionRate(region.id),1);
 for(const code of members)assert.equal(e.command(0,{type:'production',province:provinceByCode(code),kind:'infantry'}).ok,true);
 e.state.provinces[region.id].production=14-DT/2;e.step();assert.equal(e.state.units.filter(u=>u.owner===0&&u.province===region.id).length,1);
 const group=e.state.grouping.groups.find(g=>g.atoms.includes(region.code));
 assert.equal(e.command(0,{type:'splitGroup',group:group.id,atoms:['KAZ-3203'],expectedRevision:e.state.grouping.revision}).ok,false);
 assert.ok(validateState(e.state));assert.deepEqual(decodeSave(encodeSave(e.state,'Karaganda')).state,e.state);assert.deepEqual(applyFrame(null,encodeFrame(e.state,undefined,0).frame),e.state);
 const capture=game(1);capture.units.push({id:capture.nextId++,owner:0,kind:'infantry',...region.center,hp:stats(capture.players[0],'infantry').hp,province:region.id,origin:region.id,target:null,destination:null,route:[],cooldown:0});
 const battle=new Engine(capture);battle.step(161);assert.equal(battle.state.provinces[region.id].owner,0);assert.equal(battle.state.events.filter(e=>e.key==='capture').length,1);
 for(const code of members)assert.equal(battle.state.provinces[provinceByCode(code)].owner,0);
});

test('pre-merge v2 saves and LAN snapshots reject explicitly and old storage remains untouched',()=>{
 const s=game(),old={...s,map:'earth-natural-earth-admin1-511-regions-v2'},body=JSON.stringify(old),raw=JSON.stringify({version:1,name:'Before merge',savedAt:new Date().toISOString(),hash:checksum(body),body});
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v3');assert.equal(SAVE_PREFIX,'rouge.save.natural-earth-admin1.regions.v3.');
 assert.throws(()=>decodeSave(raw),/incompatibleMap/);assert.throws(()=>applyFrame(null,{type:'state',state:old}),/incompatibleMap/);
 const oldKey='rouge.save.natural-earth-admin1.regions.v2.same',records=new Map([[oldKey,raw]]),storage={get length(){return records.size},key:i=>[...records.keys()][i]??null,getItem:k=>records.get(k)??null,setItem:(k,v)=>records.set(k,v),removeItem:k=>records.delete(k)};
 writeSave(storage,'same',s,'After merge');assert.equal(listSaves(storage).length,1);deleteSave(storage,'same');assert.equal(records.get(oldKey),raw);
});
