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
import decisions from '../data/state-region-consolidation.json' with {type:'json'};
import currentDecisions from '../data/state-region-1.15.1-overrides.json' with {type:'json'};
import overlapAudit from '../data/admin1-overlap-audit.json' with {type:'json'};
import adminOverrides from '../data/administrative-region-overrides.json' with {type:'json'};
import france from '../data/france-administrative-regions.json' with {type:'json'};
import uk from '../data/uk-administrative-regions.json' with {type:'json'};
import maldives from '../data/maldives-gameplay-regions.json' with {type:'json'};
import plan from '../data/swiss-gameplay-regions.json' with {type:'json'};
import spawns from '../data/spawn-sites.json' with {type:'json'};

import {isAnyLatestGrouping as isSeaBatch} from './southeast-asia-fixtures.mjs';

usePreClassAMapFixture();
const {MAP,MAP_METADATA,SOURCE_MAP,provinceAt,provinceByCode,searchProvinces}=await import('../src/game/map.ts');
const {MAP_ID,RULES_ID,STATE_VERSION}=await import('../src/game/content.ts');
const {terrainAt}=await import('../src/game/terrain-navigation.ts');
const {default:atlas}=await import('../src/generated/world.js');

const readGzip=name=>JSON.parse(gunzipSync(readFileSync(new URL('../data/'+name+'.json.gz',import.meta.url))));
const base=readGzip('natural-earth-admin1-base');
const historical=consolidateStateRegions(base,readGzip('gameplay-region-partition').groups,decisions);
const prior=repartitionMaldives(base,applyAdministrativeGroupOverrides(base,repartitionUkRegions(base,repartitionFrenchRegions(base,
  applyCurrentStateMergers(base,historical,currentDecisions,overlapAudit),france),uk),adminOverrides),maldives);
const isSwiss=id=>id.startsWith('CHE-'), byCode=id=>MAP[provinceByCode(id)];
const sourceByCode=new Map(SOURCE_MAP.map(p=>[p.code,p]));

test('all 26 cantons are retained exactly once in two locked playable Swiss territories',()=>{
 const swiss=MAP.filter(g=>isSwiss(g.code)), west=byCode('CHE-159'), east=byCode('CHE-162');
 assert.deepEqual(swiss,[west,east]);
 assert.deepEqual(west.name,['西瑞士','West Switzerland']);assert.deepEqual(east.name,['东瑞士','East Switzerland']);
 assert.deepEqual(swiss.map(g=>g.sourceAtoms.length),[7,19]);
 assert.equal(new Set(swiss.flatMap(g=>g.sourceAtoms)).size,26);
 for(const [{members},region] of plan.regions.map((p,i)=>[p,swiss[i]])){
  assert.deepEqual(region.sourceAtoms,Object.values(members).flat().sort());
  assert.ok(region.locked&&region.playable);assert.ok(terrainAt(region.center,true)>=0);
  for(const atom of region.sourceAtoms){
   const source=sourceByCode.get(atom);
   assert.equal(provinceByCode(atom),region.id);
   assert.equal(provinceAt(source.center.x,source.center.z),region.id);
   for(const part of source.parts)assert.ok(region.parts.includes(part));
  }
  const adjoining=new Set(region.sourceAtoms.flatMap(atom=>sourceByCode.get(atom).neighbors.map(index=>byCode(SOURCE_MAP[index].code).id)));
  adjoining.delete(region.id);
  assert.deepEqual(region.neighbors,[...adjoining].sort((a,b)=>a-b));
  assert.ok(spawns.regions.includes(region.id));
 }
 assert.ok(west.neighbors.includes(east.id)&&east.neighbors.includes(west.id));
 for(const [query,region] of [['日內瓦州',west],['Genève',west],['Bern',west],['西瑞士',west],['West Switzerland',west],['Schaffhausen',east],['巴塞尔城市州',east],['东瑞士',east],['East Switzerland',east]]){
  assert.ok(searchProvinces(query).some(g=>g.id===region.id),query);
 }
 assert.equal(byCode('CHE-171').id,east.id);assert.equal(byCode('CHE-3425').id,east.id);
 assert.equal(MAP_METADATA.count,finalRegionCount);assert.equal(MAP_METADATA.playableCount,finalPlayableCount);assert.equal(MAP_METADATA.sourceAtomCount,4596);
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v27');assert.equal(STATE_VERSION,28);
 assert.equal(RULES_ID,'admin1-locked-game-regions-v41');
});

test('Swiss merge does not change any other memberships, names, geometry or source topology',()=>{
 const untouched=prior.filter(g=>!g.sourceIds.some(id=>isSwiss(id)||id.startsWith('PHL-')||id.startsWith('THA-')||isSeaBatch(id)));
 assert.equal(prior.length-untouched.length,4+29+6+18+14+41+22+110+30+26);
 assert.deepEqual(atlas.gameplayGroups.filter(g=>!g.atomIds.some(id=>isReviewedOceanBatch(id)||isSwiss(id)||id.startsWith('PHL-')||id.startsWith('THA-')||isSeaBatch(id))),
  untouched.filter(g=>!g.sourceIds.some(isReviewedOceanBatch)).map(({id,sourceIds,legacyHint,reason,displayName,islandAttachments,anchorAtomId})=>({id,atomIds:sourceIds,legacyHint,reason,...(displayName?{displayName}:{}),...(islandAttachments?{islandAttachments}:{}),...(anchorAtomId?{anchorAtomId}:{})})));
 assert.deepEqual(atlas.provinces.map(({code,sourceId,...p})=>p),base.provinces);
});

test('Swiss grouping rejects invalid membership and any invented land connection',()=>{
 const duplicate=structuredClone(plan);
 duplicate.regions[0].members['group:CHE-171']=['CHE-171'];
 assert.throws(()=>repartitionSwissRegions(base,prior,duplicate),/Disconnected Swiss|Duplicate or changed Swiss/);
 const wrong=structuredClone(plan);wrong.regions[1].members['group:CHE-3425']=['CHE-171'];
 assert.throws(()=>repartitionSwissRegions(base,prior,wrong),/Duplicate or changed Swiss/);
 const detached={...base,provinces:base.provinces.map(p=>p.id==='CHE-171'?{...p,neighbors:[]}:p).map(p=>({...p,neighbors:p.neighbors.filter(i=>base.provinces[i].id!=='CHE-171')}))};
 assert.throws(()=>repartitionSwissRegions(detached,prior,plan),/Disconnected Swiss/);
});
