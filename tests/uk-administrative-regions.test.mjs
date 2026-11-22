import {usePreClassAMapFixture} from './pre-class-a-map-fixture.mjs';
import {isPreClassAReviewedBatch as isReviewedOceanBatch,preClassARegionCount as finalRegionCount,preClassAPlayableCount as finalPlayableCount} from './reviewed-ocean-fixtures.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {repartitionUkRegions} from '../scripts/apply-uk-administrative-regions.mjs';
import swiss from '../data/swiss-gameplay-regions.json' with {type:'json'};
import {repartitionSwissRegions} from '../scripts/apply-swiss-gameplay-regions.mjs';
import {repartitionMaldives} from '../scripts/apply-maldives-gameplay-regions.mjs';
import {repartitionFrenchRegions} from '../scripts/apply-france-administrative-regions.mjs';
import {consolidateStateRegions,applyCurrentStateMergers,applyAdministrativeGroupOverrides} from '../scripts/apply-state-region-consolidation.mjs';
import plan from '../data/uk-administrative-regions.json' with {type:'json'};
import france from '../data/france-administrative-regions.json' with {type:'json'};
import decisions from '../data/state-region-consolidation.json' with {type:'json'};
import currentDecisions from '../data/state-region-1.15.1-overrides.json' with {type:'json'};
import overlapAudit from '../data/admin1-overlap-audit.json' with {type:'json'};
import maldives from '../data/maldives-gameplay-regions.json' with {type:'json'};
import adminOverrides from '../data/administrative-region-overrides.json' with {type:'json'};

import {isAnyLatestGrouping as isSeaBatch} from './southeast-asia-fixtures.mjs';

usePreClassAMapFixture();
const {MAP,MAP_METADATA,PREPROCESSED_TOPOLOGY,SOURCE_MAP,SOURCE_TOPOLOGY,provinceAt,provinceByCode,searchProvinces}=await import('../src/game/map.ts');
const {TerrainNavigator,terrainSegment,validateTravel}=await import('../src/game/terrain-navigation.ts');
const {createGame}=await import('../src/game/engine.ts');
const {RULES_ID,STATE_VERSION}=await import('../src/game/content.ts');
const {checksum,decodeSave,encodeSave,listSaves,SAVE_PREFIX,writeSave}=await import('../src/game/save.ts');
const {applyFrame}=await import('../src/platform/replication.ts');
const {default:atlas}=await import('../src/generated/world.js');

const readGzip=name=>JSON.parse(gunzipSync(readFileSync(new URL('../data/'+name+'.json.gz',import.meta.url))));
const base=readGzip('natural-earth-admin1-base');
const historical=consolidateStateRegions(base,readGzip('gameplay-region-partition').groups,decisions);
const prior=repartitionFrenchRegions(base,applyCurrentStateMergers(base,historical,currentDecisions,overlapAudit),france);
const isUk=id=>id.startsWith('GBR-');
const sourceByCode=new Map(SOURCE_MAP.map(p=>[p.code,p]));
const byCode=id=>MAP[provinceByCode(id)];

test('all 232 UK source areas resolve into 11 playable regions derived from the 12 ONS ITL1 regions',()=>{
  const counts={TLC:12,TLD:23,TLE:15,TLF:9,TLG:14,TLH:11,TLI:33,TLJ:19,TLK:16,TLL:22,TLM:32,TLN:26};
  const seen=new Set(), members=new Set();
  for(const row of plan.regions)assert.equal(row.atomIds.length,counts[row.code]);
  const {primary,annex,displayName}=plan.gameplayMerge;
  const merged=[...plan.regions.find(row=>row.code===primary).atomIds,...plan.regions.find(row=>row.code===annex).atomIds];
  assert.equal(merged.length,52);
  for(const row of [...plan.regions.filter(row=>row.code!==primary&&row.code!==annex),{atomIds:merged,displayName}]){
    const ids=[...row.atomIds].sort();
    const region=byCode(ids[0]);
    assert.equal(region.code,ids[0]);
    assert.ok(region.playable&&region.locked);
    assert.deepEqual(region.name,row.displayName);
    assert.deepEqual(region.sourceAtoms,ids);
    assert.ok(!seen.has(region.id));seen.add(region.id);
    for(const id of ids){
      assert.ok(!members.has(id));members.add(id);
      const {x,z}=sourceByCode.get(id).center;
      assert.equal(provinceByCode(id),region.id);
      assert.equal(provinceAt(x,z),region.id);
    }
  }
  assert.equal(seen.size,11);
  assert.deepEqual([...members].sort(),SOURCE_MAP.map(a=>a.code).filter(isUk).sort());
  assert.equal(members.size,232);
  assert.equal(MAP.filter(p=>isUk(p.code)).length,11);
  assert.equal(MAP_METADATA.count,finalRegionCount);
  assert.equal(MAP_METADATA.playableCount,finalPlayableCount);
  assert.equal(MAP_METADATA.sourceAtomCount,4596);
  for(const [code,query,name] of [['GBR-4809','Westminster','London and Surrounding Areas'],['GBR-3409','Kent','London and Surrounding Areas'],['GBR-2082','Belfast','Northern Ireland'],['GBR-2764','Nottinghamshire','East Midlands']]){
    const region=byCode(code);
    assert.equal(region.name[1],name);
    assert.ok(searchProvinces(query).some(p=>p.id===region.id),query);
  }
  const london=byCode('GBR-4809');
  assert.equal(london.id,byCode('GBR-3409').id);
  assert.equal(london.id,byCode('GBR-2758').id);
  assert.equal(london.sourceAtoms.length,52);
});

test('non-UK groups including modern France, Crown dependencies and overseas areas are unchanged',()=>{
  const afterOverrides=repartitionSwissRegions(base,repartitionMaldives(base,applyAdministrativeGroupOverrides(base,prior,adminOverrides),maldives),swiss);
  const remaining=afterOverrides.filter(g=>!g.sourceIds.some(id=>isUk(id)||id.startsWith('PHL-')||id.startsWith('THA-')||isSeaBatch(id)));
  assert.equal(afterOverrides.length-remaining.length,17+29+6+18+14+41+22+110+30+26);
  assert.deepEqual(atlas.gameplayGroups.filter(g=>!g.atomIds.some(id=>isReviewedOceanBatch(id)||isUk(id)||id.startsWith('PHL-')||id.startsWith('THA-')||isSeaBatch(id))),
    remaining.filter(g=>!g.sourceIds.some(isReviewedOceanBatch)).map(({id,sourceIds,legacyHint,reason,displayName,islandAttachments,anchorAtomId})=>({id,atomIds:sourceIds,legacyHint,reason,...(displayName?{displayName}:{}),...(islandAttachments?{islandAttachments}:{}),...(anchorAtomId?{anchorAtomId}:{})})));
  assert.deepEqual(atlas.provinces.map(({code,sourceId,...p})=>p),base.provinces);
  for(const id of ['GGY','JEY','IMN','GIB','FLK']){
    const original=atlas.provinces.filter(p=>p.country===id);
    assert.ok(original.length>0,id);
    assert.ok(original.every(p=>!isUk(byCode(p.id).code)),id);
  }
});

test('reviewed islands share administrative accounts but never become physical land edges',()=>{
  const attachments=atlas.gameplayGroups.filter(g=>g.atomIds.some(isUk)).flatMap(g=>g.islandAttachments??[]);
  const expected={'GBR-2128':'Wales','GBR-2744':'Scotland','GBR-2747':'Scotland','GBR-2758':'London and Surrounding Areas','GBR-2772':'Scotland','GBR-5988':'South West England'};
  assert.deepEqual(attachments.map(([id])=>id).sort(),Object.keys(expected).sort());
  const physical=new Map(SOURCE_TOPOLOGY.atoms.map(a=>[a.id,a]));
  const grouping=new Map(PREPROCESSED_TOPOLOGY.atoms.map(a=>[a.id,a]));
  for(const [island,mainland] of attachments){
    assert.deepEqual(sourceByCode.get(island).neighbors,[]);
    assert.deepEqual(physical.get(island).neighbors,[]);
    assert.deepEqual(grouping.get(island).neighbors,[mainland]);
    assert.ok(grouping.get(mainland).neighbors.includes(island));
    assert.ok(!physical.get(mainland).neighbors.includes(island));
    assert.equal(provinceByCode(island),provinceByCode(mainland));
    assert.equal(byCode(island).name[1],expected[island]);
  }
  for(const region of MAP.filter(r=>isUk(r.code))){
    // Reconstruct its outward edges solely from actual source contacts.
    const physicalNeighbors=new Set(region.sourceAtoms.flatMap(code=>sourceByCode.get(code).neighbors
      .map(id=>provinceByCode(SOURCE_MAP[id].code))).filter(id=>id!==region.id));
    assert.deepEqual(region.neighbors,[...physicalNeighbors].sort((a,b)=>a-b));
  }
  const orkney=sourceByCode.get('GBR-2744').center,highland=sourceByCode.get('GBR-2745').center;
  assert.equal(terrainSegment(orkney,highland,false),false);
  const route=new TerrainNavigator().plan(orkney,highland);
  assert.ok(route?.points.some(p=>p.sea));
  assert.ok(validateTravel(route,orkney,highland));
});

test('UK preprocessing rejects missing island reviews and duplicate or foreign membership',()=>{
  const notReviewed=structuredClone(plan);
  notReviewed.regions.find(row=>row.code==='TLM').islandComponents.pop();
  assert.throws(()=>repartitionUkRegions(base,prior,notReviewed),/Unreviewed disconnected/);
  const duplicate=structuredClone(plan);
  const row=duplicate.regions[0];row.atomIds.push(row.atomIds[0]);
  assert.throws(()=>repartitionUkRegions(base,prior,duplicate),/Duplicate or non-UK/);
  const wrongMerge=structuredClone(plan);wrongMerge.gameplayMerge.annex='TLK';
  assert.throws(()=>repartitionUkRegions(base,prior,wrongMerge),/reviewed London and South East England gameplay merger/);
  const foreign=structuredClone(plan);
  foreign.regions[0].atomIds[0]='FRA-5333';
  assert.throws(()=>repartitionUkRegions(base,prior,foreign),/Duplicate or non-UK/);
});

test('the UK map rejects v6 saves and LAN snapshots without overwriting v7 storage',()=>{
  const players=[{name:'Human',leader:'warden',loadout:['infantry']},{name:'Friend',leader:'steward',loadout:['infantry']}];
  const current=createGame(players,42,'uk-admin-regions');
  assert.equal(STATE_VERSION,30);
  assert.equal(RULES_ID,'admin1-locked-game-regions-v47');
  assert.equal(SAVE_PREFIX,'rouge.save.natural-earth-admin1.regions.v30.');
  const currentSave=encodeSave(current,'New campaign');
  assert.deepEqual(decodeSave(currentSave).state,current);
  const old={...current,version:7,map:'earth-natural-earth-admin1-511-regions-v6'};
  const body=JSON.stringify(old),priorSave=JSON.stringify({...JSON.parse(currentSave),body,hash:checksum(body)});
  assert.throws(()=>decodeSave(priorSave),/incompatibleMap/);
  assert.throws(()=>applyFrame(null,{type:'state',state:old}),/incompatibleMap/);
  const oldKey='rouge.save.natural-earth-admin1.regions.v7.same';
  const records=new Map([[oldKey,priorSave],[oldKey+'.backup',priorSave]]);
  const storage={get length(){return records.size;},key:i=>[...records.keys()][i]??null,getItem:k=>records.get(k)??null,setItem:(k,v)=>records.set(k,v),removeItem:k=>records.delete(k)};
  assert.deepEqual(listSaves(storage),[]);
  writeSave(storage,'same',current,'New campaign');
  assert.equal(listSaves(storage).length,1);
  assert.equal(records.get(oldKey),priorSave);
  assert.equal(records.get(oldKey+'.backup'),priorSave);
});
