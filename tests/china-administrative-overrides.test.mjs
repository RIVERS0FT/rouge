import {isReviewedOceanBatch,finalRegionCount,finalPlayableCount} from './reviewed-ocean-fixtures.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {applyAdministrativeGroupOverrides,applyCurrentStateMergers,consolidateStateRegions} from '../scripts/apply-state-region-consolidation.mjs';
import swiss from '../data/swiss-gameplay-regions.json' with {type:'json'};
import {repartitionSwissRegions} from '../scripts/apply-swiss-gameplay-regions.mjs';
import {repartitionMaldives} from '../scripts/apply-maldives-gameplay-regions.mjs';
import {repartitionFrenchRegions} from '../scripts/apply-france-administrative-regions.mjs';
import {repartitionUkRegions} from '../scripts/apply-uk-administrative-regions.mjs';
import {BOUNDS,MAP,MAP_METADATA,SOURCE_MAP,provinceAt,provinceByCode,searchProvinces} from '../src/game/map.ts';
import {buildBorderEdges} from '../src/render/territoryBorders.ts';
import {createGame} from '../src/game/engine.ts';
import {regionCapacity,regionProductionRate} from '../src/game/territoryEconomy.ts';
import {MAP_ID,RULES_ID,STATE_VERSION} from '../src/game/content.ts';
import {checksum,decodeSave,encodeSave,listSaves,SAVE_PREFIX,writeSave} from '../src/game/save.ts';
import {applyFrame} from '../src/platform/replication.ts';
import atlas from '../src/generated/world.js';
import overrides from '../data/administrative-region-overrides.json' with {type:'json'};
import france from '../data/france-administrative-regions.json' with {type:'json'};
import uk from '../data/uk-administrative-regions.json' with {type:'json'};
import decisions from '../data/state-region-consolidation.json' with {type:'json'};
import currentDecisions from '../data/state-region-1.15.1-overrides.json' with {type:'json'};
import overlapAudit from '../data/admin1-overlap-audit.json' with {type:'json'};
import maldives from '../data/maldives-gameplay-regions.json' with {type:'json'};

import {isAnyLatestGrouping as isSeaBatch} from './southeast-asia-fixtures.mjs';

const readGzip=name=>JSON.parse(gunzipSync(readFileSync(new URL('../data/'+name+'.json.gz',import.meta.url))));
const base=readGzip('natural-earth-admin1-base');
const historical=consolidateStateRegions(base,readGzip('gameplay-region-partition').groups,decisions);
const prior=repartitionUkRegions(base,repartitionFrenchRegions(base,applyCurrentStateMergers(base,historical,currentDecisions,overlapAudit),france),uk);
const sourceByCode=new Map(SOURCE_MAP.map(p=>[p.code,p]));
const byCode=id=>MAP[provinceByCode(id)];
const stableChanges=[
 {code:'CHN-1155',members:['CHN-1155','CHN-1811','CHN-1816'],name:['河北省','Hebei'],aliases:['北京','Beijing','天津','Tianjin','河北','Hebei']},
 {code:'CHN-1818',members:['CHN-1818','CHN-1819'],name:['江苏省','Jiangsu'],aliases:['上海','Shanghai','江苏','Jiangsu']},
];
const cases=()=>stableChanges.map(row=>({...row,region:byCode(row.code)}));
const changedSourceIds=new Set(stableChanges.flatMap(r=>r.members));
const segmentKey=e=>[e.a,e.b].map(p=>`${p.x.toFixed(6)},${p.z.toFixed(6)}`).sort().join('|');

test('Beijing and Tianjin resolve to Hebei, and Shanghai resolves to Jiangsu',()=>{
 const previousIds=prior.filter(g=>g.sourceIds.some(a=>changedSourceIds.has(a)));
 assert.deepEqual(previousIds.map(g=>g.sourceIds),[['CHN-1155','CHN-1811'],['CHN-1816'],['CHN-1818'],['CHN-1819']]);
 const expectedRegionIds=new Set();
 for(const {code,members,name,aliases,region} of cases()){
  assert.deepEqual(region.name,name);
  assert.deepEqual(region.sourceAtoms,members);
  assert.equal(region.code,code);
  assert.ok(region.playable&&region.locked&&!expectedRegionIds.has(region.id));expectedRegionIds.add(region.id);
  assert.equal(regionCapacity(region.id),12);
  assert.equal(regionProductionRate(region.id),1);
  for(const id of members){
   const {center,parts}=sourceByCode.get(id);
   assert.equal(provinceByCode(id),region.id);
   assert.equal(provinceAt(center.x,center.z),region.id);
   for(const part of parts)assert.ok(region.parts.includes(part));
  }
  for(const query of aliases)assert.ok(searchProvinces(query).some(p=>p.id===region.id),query);
 }
 assert.equal(MAP_METADATA.count,finalRegionCount);
 assert.equal(MAP_METADATA.playableCount,finalPlayableCount);
 assert.equal(MAP_METADATA.sourceAtomCount,4596);
 const chinaAtoms=new Set(atlas.provinces.filter(p=>p.country==='CHN').map(p=>p.id));
 assert.equal(MAP.filter(p=>p.sourceAtoms.some(id=>chinaAtoms.has(id))).length,29);
 assert.equal(MAP.filter(p=>p.code.startsWith('CHN-')).length,28);
});

test('gameplay-only overrides keep all unrelated groups, geometry, and real external adjacency',()=>{
 const untouched=repartitionSwissRegions(base,repartitionMaldives(base,applyAdministrativeGroupOverrides(base,prior,{...overrides,merges:[]}),maldives),swiss).filter(g=>!g.sourceIds.some(a=>changedSourceIds.has(a)||a.startsWith('PHL-')||a.startsWith('THA-')||isSeaBatch(a)));
 assert.deepEqual(atlas.gameplayGroups.filter(g=>!g.atomIds.some(a=>isReviewedOceanBatch(a)||changedSourceIds.has(a)||a.startsWith('PHL-')||a.startsWith('THA-')||isSeaBatch(a))),
  untouched.filter(g=>!g.sourceIds.some(isReviewedOceanBatch)).map(({id,sourceIds,legacyHint,reason,displayName,islandAttachments,anchorAtomId})=>({id,atomIds:sourceIds,legacyHint,reason,...(displayName?{displayName}:{}),...(islandAttachments?{islandAttachments}:{}),...(anchorAtomId?{anchorAtomId}:{})})));
 assert.deepEqual(atlas.provinces.map(({code,sourceId,...p})=>p),base.provinces);
 const runtimeKeys=new Set(buildBorderEdges(MAP,BOUNDS).map(segmentKey));
 const allSourceEdges=buildBorderEdges(SOURCE_MAP,BOUNDS);
 for(const {members,region} of cases()){
  const atoms=members.map(code=>sourceByCode.get(code));
  const expectedNeighbors=new Set(atoms.flatMap(a=>a.neighbors.map(id=>provinceByCode(SOURCE_MAP[id].code))));
  expectedNeighbors.delete(region.id);
  assert.deepEqual(region.neighbors,[...expectedNeighbors].sort((a,b)=>a-b));
  const internal=allSourceEdges.filter(edge=>edge.atoms.length>=2&&edge.atoms.every(id=>members.includes(SOURCE_MAP[id].code)));
  assert.ok(internal.length>0);
  for(const edge of internal)assert.equal(runtimeKeys.has(segmentKey(edge)),false,'No interior source border survives');
 }
});

test('gameplay-only overrides refuse stale memberships and detached or cross-country merges',()=>{
 const drift=structuredClone(overrides);drift.merges[0].primarySourceIds.pop();
 assert.throws(()=>applyAdministrativeGroupOverrides(base,prior,drift),/invalid primary, fragment, or state/);
 const noContact={...base,provinces:base.provinces.map(p=>p.id==='CHN-1816'?{...p,neighbors:[]}:p)};
 assert.throws(()=>applyAdministrativeGroupOverrides(noContact,prior,overrides),/touching same-country land/);
 const wrongCountry=structuredClone(overrides);wrongCountry.merges[0].country='GBR';
 assert.throws(()=>applyAdministrativeGroupOverrides(base,prior,wrongCountry),/invalid primary, fragment, or state/);
});

test('current map and save catalogue reject the prior map and LAN snapshot and leave prior slots untouched',()=>{
 const players=[{name:'Human',leader:'warden',loadout:['infantry']},{name:'Friend',leader:'steward',loadout:['infantry']}];
 const current=createGame(players,42,'china-administrative-overrides');
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v28');
 assert.equal(STATE_VERSION,30);
 assert.equal(RULES_ID,'admin1-locked-game-regions-v45');
 assert.equal(SAVE_PREFIX,'rouge.save.natural-earth-admin1.regions.v30.');
 const currentSave=encodeSave(current,'Current campaign');
 assert.deepEqual(decodeSave(currentSave).state,current);
 const old={...current,version:8,map:'earth-natural-earth-admin1-511-regions-v7'};
 const body=JSON.stringify(old),previousSave=JSON.stringify({...JSON.parse(currentSave),body,hash:checksum(body)});
 assert.throws(()=>decodeSave(previousSave),/incompatibleMap/);
 assert.throws(()=>applyFrame(null,{type:'state',state:old}),/incompatibleMap/);
 const oldKey='rouge.save.natural-earth-admin1.regions.v8.same';
 const records=new Map([[oldKey,previousSave],[oldKey+'.backup',previousSave]]);
 const storage={get length(){return records.size;},key:i=>[...records.keys()][i]??null,getItem:k=>records.get(k)??null,setItem:(k,v)=>records.set(k,v),removeItem:k=>records.delete(k)};
 assert.deepEqual(listSaves(storage),[]);
 writeSave(storage,'same',current,'Current campaign');
 assert.equal(listSaves(storage).length,1);
 assert.equal(records.get(oldKey),previousSave);
 assert.equal(records.get(oldKey+'.backup'),previousSave);
});
