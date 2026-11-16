import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {repartitionFrenchRegions} from '../scripts/apply-france-administrative-regions.mjs';
import {consolidateStateRegions,applyCurrentStateMergers,applyAdministrativeGroupOverrides} from '../scripts/apply-state-region-consolidation.mjs';
import {MAP,MAP_METADATA,SOURCE_MAP,provinceByCode,provinceAt,searchProvinces} from '../src/game/map.ts';
import {createGame} from '../src/game/engine.ts';
import {RULES_ID,STATE_VERSION} from '../src/game/content.ts';
import {checksum,decodeSave,encodeSave,listSaves,SAVE_PREFIX,writeSave} from '../src/game/save.ts';
import {applyFrame} from '../src/platform/replication.ts';
import plan from '../data/france-administrative-regions.json' with {type:'json'};
import atlas from '../src/generated/world.js';
import decisions from '../data/state-region-consolidation.json' with {type:'json'};
import currentDecisions from '../data/state-region-1.15.1-overrides.json' with {type:'json'};
import overlapAudit from '../data/admin1-overlap-audit.json' with {type:'json'};
import adminOverrides from '../data/administrative-region-overrides.json' with {type:'json'};

import {isAnyLatestGrouping as isSeaBatch} from './southeast-asia-fixtures.mjs';

const rows=plan.regions;
const readGzip=name=>JSON.parse(gunzipSync(readFileSync(new URL('../data/'+name+'.json.gz',import.meta.url))));
const base=readGzip('natural-earth-admin1-base');
const prior=applyCurrentStateMergers(base,consolidateStateRegions(base,readGzip('gameplay-region-partition').groups,decisions),currentDecisions,overlapAudit);
const metro=new Set(rows.flatMap(row=>row.departments.map(d=>d.atomId)));
const byCode=id=>MAP[provinceByCode(id)];
const sourceByCode=new Map(SOURCE_MAP.map(p=>[p.code,p]));

test('modern metropolitan France has 13 bilingual locked regions and all 96 department centers resolve to their region',()=>{
  assert.equal(rows.length,13);
  assert.equal(metro.size,96);
  const expectedCounts={11:8,24:6,27:8,28:5,32:5,44:10,52:5,53:4,75:12,76:13,84:12,93:6,94:2};
  const seen=new Set();
  for(const row of rows){
    const members=row.departments.map(d=>d.atomId).sort();
    const region=byCode(members[0]);
    assert.equal(members.length,expectedCounts[row.code]);
    assert.equal(region.code,members[0]);
    assert.deepEqual(region.name,row.displayName);
    assert.deepEqual(region.sourceAtoms,members);
    assert.equal(region.playable,true);
    assert.equal(region.locked,true);
    assert.ok(!seen.has(region.id));
    seen.add(region.id);
    for(const id of members){
      const {x,z}=sourceByCode.get(id).center;
      assert.equal(provinceByCode(id),region.id);
      assert.equal(provinceAt(x,z),region.id);
    }
  }
  assert.equal(MAP.length,1042);
  assert.equal(MAP_METADATA.playableCount,1038);
  assert.equal(MAP_METADATA.sourceAtomCount,4596);
  assert.equal(MAP_METADATA.mapId,'earth-natural-earth-admin1-511-regions-v15');
});

test('the French repartition preserves original geometry and unrelated locked groups',()=>{
  const otherReviewedChanges=new Set(['CHN-1155','CHN-1811','CHN-1816','CHN-1818','CHN-1819']);
  const reviewed=id=>metro.has(id)||id.startsWith('GBR-')||id.startsWith('MDV-')||id.startsWith('CHE-')||id.startsWith('PHL-')||id.startsWith('THA-')||isSeaBatch(id)||otherReviewedChanges.has(id);
  const remaining=applyAdministrativeGroupOverrides(base,prior,{...adminOverrides,merges:[]}).filter(g=>!g.sourceIds.some(reviewed));
  assert.equal(prior.length-remaining.length,21+17+4+21+4+29+6+18+14+41);
  assert.deepEqual(atlas.gameplayGroups.filter(g=>!g.atomIds.some(reviewed)),
    remaining.map(({id,sourceIds,legacyHint,reason,displayName})=>({id,atomIds:sourceIds,legacyHint,reason,...(displayName?{displayName}:{})})));
  assert.deepEqual(atlas.provinces.map(({code,sourceId,...p})=>p),base.provinces);
  for(const id of ['FRA-1442','FRA-2000','FRA-4601','FRA-4602','FRA-4603']){
    assert.deepEqual(byCode(id).sourceAtoms,[id]);
    assert.ok(!metro.has(id));
  }
});

test('modern administrative boundaries move Loire-Atlantique and Hautes-Alpes without merging Corsica to the mainland',()=>{
  assert.deepEqual(byCode('FRA-5316').name,['卢瓦尔河地区','Pays de la Loire']);
  assert.deepEqual(byCode('FRA-5283').name,['布列塔尼','Bretagne']);
  assert.deepEqual(byCode('FRA-5304').name,['普罗旺斯-阿尔卑斯-蓝色海岸',"Provence-Alpes-Côte d'Azur"]);
  const corsica=byCode('FRA-5281');
  assert.equal(corsica.name[0],'科西嘉');
  assert.deepEqual(corsica.sourceAtoms,['FRA-5281','FRA-5297']);
  assert.deepEqual(corsica.neighbors,[]);
  const mainland=MAP.filter(region=>region.id!==corsica.id&&metro.has(region.code));
  const visited=new Set([mainland[0].id]),allowed=new Set(mainland.map(r=>r.id));
  for(const id of visited)for(const next of MAP[id].neighbors)if(allowed.has(next))visited.add(next);
  assert.equal(visited.size,12);
  const paris=byCode('FRA-5333');
  for(const query of ['巴黎','Paris','塞纳-马恩省','法兰西岛','Île-de-France']){
    assert.ok(searchProvinces(query).some(region=>region.id===paris.id),query);
  }
});

test('French partition rejects duplicate, foreign, missing and disconnected department assignments',()=>{
  const duplicate=structuredClone(plan);
  duplicate.regions[0].departments.push(duplicate.regions[0].departments[0]);
  assert.throws(()=>repartitionFrenchRegions(base,prior,duplicate),/Duplicate or non-metropolitan/);
  const foreign=structuredClone(plan);
  foreign.regions[0].departments[0].atomId='FRA-2000';
  assert.throws(()=>repartitionFrenchRegions(base,prior,foreign),/Duplicate or non-metropolitan/);
  const absent=structuredClone(plan);
  absent.regions.at(-1).departments.pop();
  assert.throws(()=>repartitionFrenchRegions(base,prior,absent),/Missing metropolitan/);
  const split=structuredClone(plan);
  [split.regions[0].departments[0],split.regions.at(-1).departments[0]]=[split.regions.at(-1).departments[0],split.regions[0].departments[0]];
  assert.throws(()=>repartitionFrenchRegions(base,prior,split),/Disconnected French administrative region/);
});

test('the modern map rejects prior saves and LAN snapshots without overwriting old storage',()=>{
  const players=[{name:'Human',leader:'warden',loadout:['infantry']},{name:'Friend',leader:'steward',loadout:['infantry']}];
  const current=createGame(players,42,'france-admin-regions');
  assert.equal(STATE_VERSION,16);
  assert.equal(RULES_ID,'admin1-locked-game-regions-v28');
  assert.equal(SAVE_PREFIX,'rouge.save.natural-earth-admin1.regions.v16.');
  const currentSave=encodeSave(current,'New campaign');
  assert.deepEqual(decodeSave(currentSave).state,current);
  const old={...current,version:6,map:'earth-natural-earth-admin1-511-regions-v5'};
  const body=JSON.stringify(old),priorSave=JSON.stringify({...JSON.parse(currentSave),body,hash:checksum(body)});
  assert.throws(()=>decodeSave(priorSave),/incompatibleMap/);
  assert.throws(()=>applyFrame(null,{type:'state',state:old}),/incompatibleMap/);
  const oldKey='rouge.save.natural-earth-admin1.regions.v6.same';
  const records=new Map([[oldKey,priorSave],[oldKey+'.backup',priorSave]]);
  const storage={get length(){return records.size;},key:i=>[...records.keys()][i]??null,getItem:k=>records.get(k)??null,setItem:(k,v)=>records.set(k,v),removeItem:k=>records.delete(k)};
  assert.deepEqual(listSaves(storage),[]);
  writeSave(storage,'same',current,'New campaign');
  assert.equal(listSaves(storage).length,1);
  assert.equal(records.get(oldKey),priorSave);
  assert.equal(records.get(oldKey+'.backup'),priorSave);
});
