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
import thailand from '../data/thailand-gameplay-regions.json' with {type:'json'};
import sea from '../data/southeast-asia-gameplay-regions.json' with {type:'json'};
import plan from '../data/asia-arabia-gameplay-regions.json' with {type:'json'};

import {isAsiaArabia,isEuropeOrGlobalIslands} from './southeast-asia-fixtures.mjs';
import {repartitionAsiaArabia} from '../scripts/apply-asia-arabia-gameplay-regions.mjs';
import {repartitionSoutheastAsia} from '../scripts/apply-southeast-asia-gameplay-regions.mjs';

const readGzip=name=>JSON.parse(gunzipSync(readFileSync(new URL('../data/'+name+'.json.gz',import.meta.url))));
const base=readGzip('natural-earth-admin1-base');
const historical=consolidateStateRegions(base,readGzip('gameplay-region-partition').groups,decisions);
const prior=repartitionSoutheastAsia(base,repartitionThailand(base,repartitionPhilippines(base,repartitionSwissRegions(base,repartitionMaldives(base,applyAdministrativeGroupOverrides(base,repartitionUkRegions(base,repartitionFrenchRegions(base,
  applyCurrentStateMergers(base,historical,currentDecisions,overlapAudit),france),uk),adminOverrides),maldives),swiss),philippines),thailand),sea);
const byCode=id=>MAP[provinceByCode(id)];
const sourceByCode=new Map(SOURCE_MAP.map(p=>[p.code,p]));

test('the approved Asia and Arabia membership, names and anchor locations are playable',()=>{
 assert.equal(MAP_METADATA.count,927);assert.equal(MAP_METADATA.playableCount,923);assert.equal(MAP_METADATA.sourceAtomCount,4596);
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v17');assert.equal(STATE_VERSION,18);assert.equal(RULES_ID,'admin1-locked-game-regions-v30');
 assert.equal(MAP.filter(r=>/^(SAU|OMN|YEM|ARE|QAT|KWT|BHR)-/.test(r.code)).length,10);
 assert.equal(MAP.filter(r=>/^(BRN|KHM|IDN|LAO|MYS|MMR|PHL|SGP|THA|TLS|VNM)-/.test(r.code)).length,39);
 for(const row of plan.regions){
  const r=byCode(row.id.slice(6));
  assert.deepEqual(r.name,row.displayName);
  assert.equal('group:'+r.code,row.id);assert.ok(r.playable&&r.locked&&terrainAt(r.center,true)>=0);
  if(row.anchorAtomId)assert.deepEqual(r.center,sourceByCode.get(row.anchorAtomId).center);
  assert.deepEqual(r.sourceAtoms,Object.values(row.groups).flat().sort());
  for(const code of r.sourceAtoms){
   const p=sourceByCode.get(code);
   assert.equal(provinceAt(p.center.x,p.center.z),r.id);
   assert.equal(byCode(code).id,r.id);
   assert.ok(p.parts.every(part=>r.parts.includes(part)));
  }
  const physical=new Set(r.sourceAtoms.flatMap(code=>sourceByCode.get(code).neighbors.map(i=>byCode(SOURCE_MAP[i].code).id)));
  physical.delete(r.id);
  assert.deepEqual(r.neighbors,[...physical].sort((a,b)=>a-b));
 }
 for(const [query,code] of [
  ['Singapore','MYS-1137'],['新加坡','MYS-1137'],['Perlis','MYS-1137'],['Kedah','MYS-1137'],['Labuan','MYS-1186'],
  ['Ambeno','TLS-541'],['Dili','TLS-541'],['Hawalli','KWT-1663'],['Al Muḩarraq','BHR-4926'],
  ['内志','SAU-1096'],['汉志','SAU-845'],['哈伊勒','SAU-846'],['阿曼本土','OMN-2404'],
 ])assert.ok(searchProvinces(query).some(p=>p.id===byCode(code).id),query);
 assert.notEqual(byCode('MYS-1137').id,byCode('MYS-1186').id);
 assert.notEqual(byCode('OMN-2425').id,byCode('OMN-2404').id);
 assert.deepEqual(byCode('OMN-2425').sourceAtoms,['OMN-2425']);
});

test('Bahrain and the Timor-Leste exclave keep false land edges out and real sea movement possible',()=>{
 const physical=new Map(SOURCE_TOPOLOGY.atoms.map(a=>[a.id,a]));
 const grouping=new Map(PREPROCESSED_TOPOLOGY.atoms.map(a=>[a.id,a]));
 const nav=new TerrainNavigator();
 for(const [a,b] of [['TLS-543','TLS-542'],['BHR-4930','BHR-4929'],['SGP-4871','MYS-1143']]){
  assert.ok(grouping.get(a).neighbors.includes(b)&&!physical.get(a).neighbors.includes(b));
  assert.ok(grouping.get(b).neighbors.includes(a)&&!physical.get(b).neighbors.includes(a));
  const from=sourceByCode.get(a).center,to=sourceByCode.get(b).center;
  // The exclave can use existing Indonesian land or sea, not a manufactured
  // direct land edge. Bahrain and Singapore physically require sea crossings.
  if(a==='TLS-543')continue;
  assert.equal(terrainSegment(from,to,false),false);
  const route=nav.plan(from,to);
  assert.ok(route?.points.some(p=>p.sea),a);assert.ok(validateTravel(route,from,to));
 }
 assert.ok(!physical.get('TLS-543').neighbors.some(id=>id.startsWith('TLS-')));
});

test('all unrelated records including raw country and physical topology are unchanged',()=>{
 const unaffected=prior.filter(g=>!g.sourceIds.some(id=>isAsiaArabia(id)||isEuropeOrGlobalIslands(id)));
 assert.equal(prior.length-unaffected.length,16+41+22+110);
 assert.deepEqual(atlas.gameplayGroups.filter(g=>!g.atomIds.some(id=>isAsiaArabia(id)||isEuropeOrGlobalIslands(id))),unaffected.map(
  ({id,sourceIds,legacyHint,reason,displayName,islandAttachments,anchorAtomId,searchAliases})=>
  ({id,atomIds:sourceIds,legacyHint,reason,...(displayName?{displayName}:{}),...(islandAttachments?{islandAttachments}:{}),
    ...(anchorAtomId?{anchorAtomId}:{}),...(searchAliases?{searchAliases}:{})})));
 assert.deepEqual(atlas.provinces.map(({code,sourceId,...p})=>p),base.provinces);
});

test('unreviewed merged memberships and changes to group-only edges are rejected',()=>{
 const changed=structuredClone(plan);
 changed.regions[0].groups['group:IDN-1235']=['IDN-1235'];
 assert.throws(()=>repartitionAsiaArabia(base,prior,changed),/Unexpected Asia and Arabia region/);
 const missing=structuredClone(plan);
 missing.regions[0].addedGroupingLinks=[];
 assert.throws(()=>repartitionAsiaArabia(base,prior,missing),/Unexpected Asia and Arabia grouping-only linkage/);
});
