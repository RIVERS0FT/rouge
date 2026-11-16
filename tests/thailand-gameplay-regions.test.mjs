import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {applyAdministrativeGroupOverrides,applyCurrentStateMergers,consolidateStateRegions} from '../scripts/apply-state-region-consolidation.mjs';
import {repartitionFrenchRegions} from '../scripts/apply-france-administrative-regions.mjs';
import {repartitionUkRegions} from '../scripts/apply-uk-administrative-regions.mjs';
import {repartitionMaldives} from '../scripts/apply-maldives-gameplay-regions.mjs';
import {repartitionSwissRegions} from '../scripts/apply-swiss-gameplay-regions.mjs';
import {repartitionPhilippines} from '../scripts/apply-philippines-gameplay-regions.mjs';
import {repartitionThailand} from '../scripts/apply-thailand-gameplay-regions.mjs';
import {MAP,MAP_METADATA,SOURCE_MAP,PREPROCESSED_TOPOLOGY,SOURCE_TOPOLOGY,provinceAt,provinceByCode,searchProvinces} from '../src/game/map.ts';
import {MAP_ID,RULES_ID,STATE_VERSION} from '../src/game/content.ts';
import {TerrainNavigator,terrainAt,terrainSegment,validateTravel} from '../src/game/terrain-navigation.ts';
import atlas from '../src/generated/world.js';
import decisions from '../data/state-region-consolidation.json' with {type:'json'};
import currentDecisions from '../data/state-region-1.15.1-overrides.json' with {type:'json'};
import overlapAudit from '../data/admin1-overlap-audit.json' with {type:'json'};
import adminOverrides from '../data/administrative-region-overrides.json' with {type:'json'};
import france from '../data/france-administrative-regions.json' with {type:'json'};
import uk from '../data/uk-administrative-regions.json' with {type:'json'};
import maldives from '../data/maldives-gameplay-regions.json' with {type:'json'};
import swiss from '../data/swiss-gameplay-regions.json' with {type:'json'};
import philippines from '../data/philippines-gameplay-regions.json' with {type:'json'};
import plan from '../data/thailand-gameplay-regions.json' with {type:'json'};

import {isSeaOrAsiaArabia as isSeaBatch} from './southeast-asia-fixtures.mjs';

const readGzip=name=>JSON.parse(gunzipSync(readFileSync(new URL('../data/'+name+'.json.gz',import.meta.url))));
const base=readGzip('natural-earth-admin1-base');
const historical=consolidateStateRegions(base,readGzip('gameplay-region-partition').groups,decisions);
const prior=repartitionPhilippines(base,repartitionSwissRegions(base,repartitionMaldives(base,applyAdministrativeGroupOverrides(base,repartitionUkRegions(base,repartitionFrenchRegions(base,
  applyCurrentStateMergers(base,historical,currentDecisions,overlapAudit),france),uk),adminOverrides),maldives),swiss),philippines);
const isThai=id=>id.startsWith('THA-'), byCode=id=>MAP[provinceByCode(id)];
const sourceByCode=new Map(SOURCE_MAP.map(p=>[p.code,p]));

test('all Thai source areas and city anchors select exactly four locked gameplay territories',()=>{
 const regions=plan.regions.map(row=>byCode(row.anchorAtomId));
 assert.equal(MAP.filter(p=>isThai(p.code)).length,4);
 assert.equal(new Set(regions.flatMap(g=>g.sourceAtoms)).size,77);
 assert.deepEqual(regions.map(p=>p.sourceAtoms.length),[12,22,28,15]);
 for(const [i,row] of plan.regions.entries()){
  const r=regions[i];
  assert.equal('group:'+r.code,row.primary);
  assert.ok(r.playable&&r.locked&&terrainAt(r.center,true)>=0);
  assert.deepEqual(r.center,sourceByCode.get(row.anchorAtomId).center);
  assert.deepEqual(r.name,row.displayName);
  assert.deepEqual(r.sourceAtoms,Object.values(row.members).flat().sort());
  for(const code of r.sourceAtoms){
   const {center,parts}=sourceByCode.get(code);
   assert.equal(byCode(code).id,r.id);
   assert.equal(provinceAt(center.x,center.z),r.id);
   for(const part of parts)assert.ok(r.parts.includes(part));
  }
  const expected=new Set(r.sourceAtoms.flatMap(code=>sourceByCode.get(code).neighbors.map(i=>byCode(SOURCE_MAP[i].code).id)));
  expected.delete(r.id);
  assert.deepEqual(r.neighbors,[...expected].sort((a,b)=>a-b));
 }
 for(const [i,aliases] of [['Chiang Mai','清迈'],['Bangkok Metropolis','曼谷','Kanchanaburi'],['Nong Khai','廊开府','呵叻'],['Phuket','普吉府','Surat Thani','泰南']].entries()){
  for(const alias of aliases)assert.ok(searchProvinces(alias).some(r=>r.id===regions[i].id),alias);
 }
 assert.equal(MAP_METADATA.count,1073);assert.equal(MAP_METADATA.playableCount,1069);assert.equal(MAP_METADATA.sourceAtomCount,4596);
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v14');assert.equal(STATE_VERSION,15);assert.equal(RULES_ID,'admin1-locked-game-regions-v27');
});

test('Phuket keeps its sea crossing while Nong Khai joins physically touching Northeast land',()=>{
 const island='THA-377',coast='THA-378';
 const physical=new Map(SOURCE_TOPOLOGY.atoms.map(a=>[a.id,a]));
 const grouped=new Map(PREPROCESSED_TOPOLOGY.atoms.map(a=>[a.id,a]));
 assert.deepEqual(physical.get(island).neighbors,[]);
 assert.deepEqual(grouped.get(island).neighbors,[coast]);
 assert.ok(grouped.get(coast).neighbors.includes(island));
 assert.ok(!physical.get(coast).neighbors.includes(island));
 const origin=sourceByCode.get(island).center,target=byCode(coast).center;
 assert.equal(terrainSegment(origin,target,false),false);
 const nav=new TerrainNavigator(),route=nav.plan(origin,target);
 assert.ok(route?.points.some(p=>p.sea));assert.ok(validateTravel(route,origin,target));
 const north='THA-446';
 assert.ok(physical.get(north).neighbors.some(id=>byCode(id).id===byCode('THA-409').id));
 assert.equal(byCode(north).id,byCode('THA-409').id);
});

test('the Thai merge leaves all other atlas memberships, original geometry and source topology exactly unchanged',()=>{
 const untouched=prior.filter(g=>!g.sourceIds.some(id=>isThai(id)||isSeaBatch(id)));
 assert.equal(prior.length-untouched.length,6+18+14);
 assert.deepEqual(atlas.gameplayGroups.filter(g=>!g.atomIds.some(id=>isThai(id)||isSeaBatch(id))),
  untouched.map(({id,sourceIds,legacyHint,reason,displayName,islandAttachments,anchorAtomId})=>({id,atomIds:sourceIds,legacyHint,reason,...(displayName?{displayName}:{}),...(islandAttachments?{islandAttachments}:{}),...(anchorAtomId?{anchorAtomId}:{})})));
 assert.deepEqual(atlas.provinces.map(({code,sourceId,...p})=>p),base.provinces);
});

test('invalid Thai source membership and forged Phuket land adjacency fail the preprocessing step',()=>{
 const move=structuredClone(plan);move.regions[3].members['group:THA-377']=['THA-446'];
 assert.throws(()=>repartitionThailand(base,prior,move),/Duplicate or changed Thai gameplay membership/);
 const forged={...base,provinces:base.provinces.map(p=>p.id==='THA-377'?{...p,neighbors:[base.provinces.findIndex(a=>a.id==='THA-375')]}:p)};
 assert.throws(()=>repartitionThailand(forged,prior,plan),/Unexpected Phuket land or grouping-only connectivity/);
});
