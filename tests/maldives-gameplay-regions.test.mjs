import {isReviewedOceanBatch,finalRegionCount,finalPlayableCount} from './reviewed-ocean-fixtures.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {applyAdministrativeGroupOverrides,applyCurrentStateMergers,consolidateStateRegions} from '../scripts/apply-state-region-consolidation.mjs';
import {repartitionFrenchRegions} from '../scripts/apply-france-administrative-regions.mjs';
import {repartitionUkRegions} from '../scripts/apply-uk-administrative-regions.mjs';
import swiss from '../data/swiss-gameplay-regions.json' with {type:'json'};
import {repartitionSwissRegions} from '../scripts/apply-swiss-gameplay-regions.mjs';
import {repartitionMaldives} from '../scripts/apply-maldives-gameplay-regions.mjs';
import {MAP,MAP_METADATA,PREPROCESSED_TOPOLOGY,SOURCE_MAP,SOURCE_TOPOLOGY,provinceAt,provinceByCode,searchProvinces} from '../src/game/map.ts';
import {TerrainNavigator,terrainAt,terrainSegment,validateTravel} from '../src/game/terrain-navigation.ts';
import {createGame} from '../src/game/engine.ts';
import {MAP_ID,RULES_ID,STATE_VERSION} from '../src/game/content.ts';
import {checksum,decodeSave,encodeSave,listSaves,SAVE_PREFIX,writeSave} from '../src/game/save.ts';
import {applyFrame} from '../src/platform/replication.ts';
import atlas from '../src/generated/world.js';
import decisions from '../data/state-region-consolidation.json' with {type:'json'};
import currentDecisions from '../data/state-region-1.15.1-overrides.json' with {type:'json'};
import overlapAudit from '../data/admin1-overlap-audit.json' with {type:'json'};
import adminOverrides from '../data/administrative-region-overrides.json' with {type:'json'};
import france from '../data/france-administrative-regions.json' with {type:'json'};
import uk from '../data/uk-administrative-regions.json' with {type:'json'};
import plan from '../data/maldives-gameplay-regions.json' with {type:'json'};
import spawns from '../data/spawn-sites.json' with {type:'json'};

import {isAnyLatestGrouping as isSeaBatch} from './southeast-asia-fixtures.mjs';

const readGzip=name=>JSON.parse(gunzipSync(readFileSync(new URL('../data/'+name+'.json.gz',import.meta.url))));
const base=readGzip('natural-earth-admin1-base');
const historical=consolidateStateRegions(base,readGzip('gameplay-region-partition').groups,decisions);
const prior=applyAdministrativeGroupOverrides(base,repartitionUkRegions(base,repartitionFrenchRegions(base,
  applyCurrentStateMergers(base,historical,currentDecisions,overlapAudit),france),uk),adminOverrides);
const isMdv=id=>id.startsWith('MDV-');
const sourceByCode=new Map(SOURCE_MAP.map(p=>[p.code,p]));
const byCode=id=>MAP[provinceByCode(id)];

test('all 21 Maldives source areas share Ceylon without losing their aliases',()=>{
 const ids=plan.atomIds,region=byCode('MDV-5223');
 assert.equal(ids.length,21);
 const previous=repartitionMaldives(base,prior,plan).find(g=>g.id==='group:MDV-5223');
 assert.deepEqual(previous.sourceIds,ids);
 assert.equal(previous.anchorAtomId,plan.anchorAtomId);
 assert.ok(ids.every(id=>region.sourceAtoms.includes(id)));
 assert.deepEqual(region.name,['锡兰','Ceylon']);
 assert.ok(region.playable&&region.locked);
 for(const id of ids){
  const {center,parts}=sourceByCode.get(id);
  assert.equal(provinceAt(center.x,center.z),region.id);
  assert.equal(provinceByCode(id),region.id);
  for(const part of parts)assert.ok(region.parts.includes(part));
 }
 assert.equal(MAP.filter(r=>r.sourceAtoms.some(isMdv)).length,1);
 assert.equal(MAP_METADATA.count,finalRegionCount);
 assert.equal(MAP_METADATA.playableCount,finalPlayableCount);
 assert.equal(MAP_METADATA.sourceAtomCount,4596);
 for(const q of ['Haa Alifu','马尔代夫','Malé','马累','Addu','阿杜环礁','Maldives']){
  assert.ok(searchProvinces(q).some(r=>r.id===region.id),q);
 }
});

test('administrative links to Malé do not create land bridges or land-linked spawn sites',()=>{
 const physical=new Map(SOURCE_TOPOLOGY.atoms.map(a=>[a.id,a]));
 const grouped=new Map(PREPROCESSED_TOPOLOGY.atoms.map(a=>[a.id,a]));
 const hub=plan.anchorAtomId, region=byCode(hub);
 assert.deepEqual(region.neighbors,[]);
 assert.ok(!spawns.regions.includes(region.id));
 for(const id of plan.atomIds){
  assert.deepEqual(sourceByCode.get(id).neighbors,[]);
  assert.deepEqual(physical.get(id).neighbors,[]);
  if(id===hub)assert.ok(plan.atomIds.filter(x=>x!==hub).every(atom=>grouped.get(id).neighbors.includes(atom)));
  else assert.ok(grouped.get(id).neighbors.includes(hub));
 }
 const male=sourceByCode.get(hub).center;
 assert.deepEqual(region.center,sourceByCode.get('LKA-2470').center);
 assert.ok(terrainAt(region.center,true)>=0);
 assert.equal(provinceAt(male.x,male.z),region.id);
 // Coordinate-level terrain routes remain seaborne even when both endpoints
 // are managed under the same gameplay ID; no new order targets are created.
 const nav=new TerrainNavigator();
 for(const source of ['MDV-5223','MDV-5228','MDV-5238','MDV-5243']){
  const origin=sourceByCode.get(source).center;
  assert.equal(terrainSegment(origin,male,false),false);
  const route=nav.plan(origin,male);
  assert.ok(route?.points.some(p=>p.sea),source);
  assert.ok(validateTravel(route,origin,male));
 }
});

test('Maldives grouping changes no unrelated groups or original geometry',()=>{
 const unaffected=prior.filter(g=>!g.sourceIds.some(isMdv));
 const expected=repartitionSwissRegions(base,repartitionMaldives(base,prior,plan),swiss).filter(g=>!g.sourceIds.some(id=>isMdv(id)||id.startsWith('PHL-')||id.startsWith('THA-')||isSeaBatch(id)));
 assert.equal(prior.length-unaffected.length,21);
 assert.deepEqual(atlas.gameplayGroups.filter(g=>!g.atomIds.some(id=>isReviewedOceanBatch(id)||isMdv(id)||id.startsWith('PHL-')||id.startsWith('THA-')||isSeaBatch(id))),
  expected.filter(g=>!g.sourceIds.some(isReviewedOceanBatch)).map(({id,sourceIds,legacyHint,reason,displayName,islandAttachments})=>({id,atomIds:sourceIds,legacyHint,reason,...(displayName?{displayName}:{}),...(islandAttachments?{islandAttachments}:{})})));
 assert.deepEqual(atlas.provinces.map(({code,sourceId,...p})=>p),base.provinces);
});

test('Maldives grouping rejects duplicated or noneligible members and a wrong anchor',()=>{
 const duplicate=structuredClone(plan);duplicate.atomIds[0]=duplicate.atomIds[1];
 assert.throws(()=>repartitionMaldives(base,prior,duplicate),/Unexpected Maldives island/);
 const foreign=structuredClone(plan);foreign.atomIds[0]='GBR-2744';
 assert.throws(()=>repartitionMaldives(base,prior,foreign),/Unexpected Maldives island/);
 const wrongAnchor=structuredClone(plan);wrongAnchor.anchorAtomId='MDV-5230';
 assert.throws(()=>repartitionMaldives(base,prior,wrongAnchor),/Expected one reviewed Maldives/);
});

test('map v27 and save v28 reject the previous map and LAN data without changing old slots',()=>{
 const players=[{name:'Human',leader:'warden',loadout:['infantry']},{name:'Friend',leader:'steward',loadout:['infantry']}];
 const current=createGame(players,42,'maldives-gameplay-regions');
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v27');
 assert.equal(STATE_VERSION,28);
 assert.equal(RULES_ID,'admin1-locked-game-regions-v42');
 assert.equal(SAVE_PREFIX,'rouge.save.natural-earth-admin1.regions.v28.');
 const currentSave=encodeSave(current,'Current campaign');
 assert.deepEqual(decodeSave(currentSave).state,current);
 const old={...current,version:27,map:'earth-natural-earth-admin1-511-regions-v26'};
 const body=JSON.stringify(old),previousSave=JSON.stringify({...JSON.parse(currentSave),body,hash:checksum(body)});
 assert.throws(()=>decodeSave(previousSave),/incompatibleMap/);
 assert.throws(()=>applyFrame(null,{type:'state',state:old}),/incompatibleMap/);
 const oldKey='rouge.save.natural-earth-admin1.regions.v27.same';
 const records=new Map([[oldKey,previousSave],[oldKey+'.backup',previousSave]]);
 const storage={get length(){return records.size;},key:i=>[...records.keys()][i]??null,getItem:k=>records.get(k)??null,setItem:(k,v)=>records.set(k,v),removeItem:k=>records.delete(k)};
 assert.deepEqual(listSaves(storage),[]);
 writeSave(storage,'same',current,'Current campaign');
 assert.equal(listSaves(storage).length,1);
 assert.equal(records.get(oldKey),previousSave);
 assert.equal(records.get(oldKey+'.backup'),previousSave);
});
