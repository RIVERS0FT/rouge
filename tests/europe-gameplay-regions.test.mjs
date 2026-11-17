import {usePreClassAMapFixture} from './pre-class-a-map-fixture.mjs';
import {isPreClassAReviewedBatch as isReviewedOceanBatch,preClassARegionCount as finalRegionCount,preClassAPlayableCount as finalPlayableCount} from './reviewed-ocean-fixtures.mjs';
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
import asiaArabia from '../data/asia-arabia-gameplay-regions.json' with {type:'json'};
import plan from '../data/europe-gameplay-regions.json' with {type:'json'};

import {isEuropeOrGlobalIslands,isSmallEuropeBatch} from './southeast-asia-fixtures.mjs';
import {repartitionAsiaArabia} from '../scripts/apply-asia-arabia-gameplay-regions.mjs';
import {repartitionEurope} from '../scripts/apply-europe-gameplay-regions.mjs';
import {repartitionSoutheastAsia} from '../scripts/apply-southeast-asia-gameplay-regions.mjs';

usePreClassAMapFixture();
const {MAP,MAP_METADATA,SOURCE_MAP,PREPROCESSED_TOPOLOGY,SOURCE_TOPOLOGY,provinceAt,provinceByCode,searchProvinces}=await import('../src/game/map.ts');
const {MAP_ID,RULES_ID,STATE_VERSION}=await import('../src/game/content.ts');
const {terrainAt}=await import('../src/game/terrain-navigation.ts');
const {default:atlas}=await import('../src/generated/world.js');

const readGzip=name=>JSON.parse(gunzipSync(readFileSync(new URL('../data/'+name+'.json.gz',import.meta.url))));
const base=readGzip('natural-earth-admin1-base');
const historical=consolidateStateRegions(base,readGzip('gameplay-region-partition').groups,decisions);
const prior=repartitionAsiaArabia(base,repartitionSoutheastAsia(base,repartitionThailand(base,repartitionPhilippines(base,repartitionSwissRegions(base,repartitionMaldives(base,applyAdministrativeGroupOverrides(base,repartitionUkRegions(base,repartitionFrenchRegions(base,
  applyCurrentStateMergers(base,historical,currentDecisions,overlapAudit),france),uk),adminOverrides),maldives),swiss),philippines),thailand),sea),asiaArabia);
const byCode=id=>MAP[provinceByCode(id)];
const sourceByCode=new Map(SOURCE_MAP.map(p=>[p.code,p]));

test('seven approved European areas use only their existing source geometry and exact gameplay memberships',()=>{
 assert.equal(MAP_METADATA.count,finalRegionCount);assert.equal(MAP_METADATA.playableCount,finalPlayableCount);assert.equal(MAP_METADATA.sourceAtomCount,4596);
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v27');assert.equal(STATE_VERSION,28);assert.equal(RULES_ID,'admin1-locked-game-regions-v41');
 for(const [country,count] of [['MLT',1],['ALD',1],['LVA',2],['EST',2],['AND',1],['LIE',1],['SVN',2]]){
  assert.equal(MAP.filter(r=>r.code.startsWith(country+'-')).length,count,country);
 }
 for(const row of plan.regions.filter(row=>!Object.values(row.groups).flat().some(isSmallEuropeBatch))){
  const r=byCode(row.id.slice(6));
  assert.deepEqual(r.name,row.displayName);
  assert.equal('group:'+r.code,row.id);assert.ok(r.playable&&r.locked&&terrainAt(r.center,true)>=0,row.id);
  if(row.anchorAtomId)assert.deepEqual(r.center,sourceByCode.get(row.anchorAtomId).center);
  assert.deepEqual(r.sourceAtoms,Object.values(row.groups).flat().sort());
  for(const code of r.sourceAtoms){
   const p=sourceByCode.get(code);
   assert.equal(provinceAt(p.center.x,p.center.z),r.id,code);
   assert.equal(byCode(code).id,r.id);
   assert.ok(p.parts.every(part=>r.parts.includes(part)));
  }
  const contact=new Set(r.sourceAtoms.flatMap(code=>sourceByCode.get(code).neighbors.map(i=>byCode(SOURCE_MAP[i].code).id)));
  contact.delete(r.id);
  assert.deepEqual(r.neighbors,[...contact].sort((a,b)=>a-b));
 }
 for(const [query,code] of [
  ['Valletta','MLT-5920'],['Marsaskala','MLT-5920'],['Mariehamn','ALD-4810'],['奥兰群岛','ALD-4810'],
  ['Jurmala','LVA-1068'],['Liepāja','LVA-1068'],['Saulkrastu','LVA-1063'],['里加','LVA-1063'],
  ['Hiiu','EST-1654'],['Saare','EST-1654'],['塔尔图','EST-1657'],['Ordino','AND-4876'],['Vaduz','LIE-4892'],
  ['Izola','SVN-1010'],['Podcetrtek','SVN-1000']
 ])assert.ok(searchProvinces(query).some(p=>p.id===byCode(code).id),query);
});

test('Malta, Åland and Estonian island connections are only virtual administrative links',()=>{
 const physical=new Map(SOURCE_TOPOLOGY.atoms.map(a=>[a.id,a]));
 const grouping=new Map(PREPROCESSED_TOPOLOGY.atoms.map(a=>[a.id,a]));
 const links=plan.regions.flatMap(row=>row.groupingLinks);
 assert.equal(links.length,12);
 for(const [a,b] of links){
  assert.ok(grouping.get(a).neighbors.includes(b)&&!physical.get(a).neighbors.includes(b));
  assert.ok(grouping.get(b).neighbors.includes(a)&&!physical.get(b).neighbors.includes(a));
 }
 assert.deepEqual(byCode('ALD-4810').neighbors,[]);
 assert.deepEqual(byCode('MLT-5920').neighbors,[]);
 assert.ok(!physical.get('EST-1660').neighbors.includes('EST-1661'));
});

test('every untouched country and all original country tags, shapes and real land edges are identical',()=>{
 const unaffected=prior.filter(g=>!g.sourceIds.some(isEuropeOrGlobalIslands));
 assert.equal(prior.length-unaffected.length,41+22+110+30+26);
 assert.deepEqual(atlas.gameplayGroups.filter(g=>!g.atomIds.some(id=>isReviewedOceanBatch(id)||isEuropeOrGlobalIslands(id))),unaffected.filter(g=>!g.sourceIds.some(isReviewedOceanBatch)).map(
  ({id,sourceIds,legacyHint,reason,displayName,islandAttachments,anchorAtomId,searchAliases})=>
  ({id,atomIds:sourceIds,legacyHint,reason,...(displayName?{displayName}:{}),...(islandAttachments?{islandAttachments}:{}),
    ...(anchorAtomId?{anchorAtomId}:{}),...(searchAliases?{searchAliases}:{})})));
 assert.deepEqual(atlas.provinces.map(({code,sourceId,...p})=>p),base.provinces);
});

test('unexpected European memberships and island links fail without changing the real map',()=>{
 const damaged=structuredClone(plan);
 damaged.regions[0].groupingLinks=[['MLT-5949','MLT-5933']];
 assert.throws(()=>repartitionEurope(base,prior,damaged),/Redundant European grouping-only link/);
 const altered=structuredClone(plan);
 altered.regions[0].groups['group:MLT-5925']=['MLT-5949'];
 assert.throws(()=>repartitionEurope(base,prior,altered),/Duplicate or changed European gameplay membership/);
});
