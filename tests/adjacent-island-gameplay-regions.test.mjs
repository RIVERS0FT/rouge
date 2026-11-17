import {isReviewedOceanBatch,oceanScopeOf,finalRegionCount,finalPlayableCount} from './reviewed-ocean-fixtures.mjs';
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
import asiaArabia from '../data/asia-arabia-gameplay-regions.json' with {type:'json'};
import europe from '../data/europe-gameplay-regions.json' with {type:'json'};
import smallEurope from '../data/europe-small-gameplay-regions.json' with {type:'json'};
import globalIslands from '../data/global-island-gameplay-regions.json' with {type:'json'};
import selectedIslands from '../data/user-island-gameplay-regions.json' with {type:'json'};
import plan from '../data/adjacent-island-gameplay-regions.json' with {type:'json'};
import pacific from '../data/pacific-gameplay-regions.json' with {type:'json'};
import {applyPacificGameplayRegions} from '../scripts/apply-pacific-gameplay-regions.mjs';
import indian from '../data/indian-ocean-gameplay-regions.json' with {type:'json'};
import {applyReviewedStateIslands} from '../scripts/apply-reviewed-state-islands.mjs';
import atlantic from '../data/atlantic-gameplay-regions.json' with {type:'json'};
import africa from '../data/africa-gameplay-regions.json' with {type:'json'};
import southAmerica from '../data/south-america-gameplay-regions.json' with {type:'json'};
import {isAfricaBatch,isAtlanticBatch,isIndianOceanBatch,isNorthAmericaBatch,isSouthAmericaBatch} from './reviewed-ocean-fixtures.mjs';

import {isAdjacentIslandBatch} from './southeast-asia-fixtures.mjs';
import {repartitionAsiaArabia} from '../scripts/apply-asia-arabia-gameplay-regions.mjs';
import {applyEuropeSmallMergers} from '../scripts/apply-europe-small-gameplay-regions.mjs';
import {applyAdjacentIslandMergers} from '../scripts/apply-adjacent-island-gameplay-regions.mjs';
import {repartitionUserIslands} from '../scripts/apply-user-island-gameplay-regions.mjs';
import {repartitionGlobalIslands} from '../scripts/apply-global-island-gameplay-regions.mjs';
import {repartitionEurope} from '../scripts/apply-europe-gameplay-regions.mjs';
import {repartitionSoutheastAsia} from '../scripts/apply-southeast-asia-gameplay-regions.mjs';

const readGzip=name=>JSON.parse(gunzipSync(readFileSync(new URL('../data/'+name+'.json.gz',import.meta.url))));
const base=readGzip('natural-earth-admin1-base');
const historical=consolidateStateRegions(base,readGzip('gameplay-region-partition').groups,decisions);
const prior=repartitionUserIslands(base,repartitionGlobalIslands(base,applyEuropeSmallMergers(base,repartitionEurope(base,repartitionAsiaArabia(base,repartitionSoutheastAsia(base,repartitionThailand(base,repartitionPhilippines(base,repartitionSwissRegions(base,repartitionMaldives(base,applyAdministrativeGroupOverrides(base,repartitionUkRegions(base,repartitionFrenchRegions(base,
  applyCurrentStateMergers(base,historical,currentDecisions,overlapAudit),france),uk),adminOverrides),maldives),swiss),philippines),thailand),sea),asiaArabia),europe),smallEurope),globalIslands),selectedIslands);
const byCode=id=>MAP[provinceByCode(id)];
const sourceByCode=new Map(SOURCE_MAP.map(p=>[p.code,p]));

test('Macau and Hong Kong retain their original land and names under the Guangdong gameplay region',()=>{
 const r=byCode('CHN-1180'),macau=sourceByCode.get('MAC+00?');
 assert.deepEqual(r.name,['广东省','Guangdong']);assert.equal(r.sourceAtoms.length,20);
 assert.deepEqual(r.center,sourceByCode.get('CHN-1180').center);assert.ok(r.playable&&r.locked);
 assert.deepEqual(macau.name,['澳门','Macau']);assert.ok(r.sourceAtoms.includes(macau.code));
 assert.equal(provinceAt(macau.center.x,macau.center.z),r.id);
 for(const code of r.sourceAtoms)assert.equal(provinceByCode(code),r.id);
 assert.equal(atlas.provinces.filter(p=>p.country==='MAC').length,1);
 assert.equal(atlas.provinces.filter(p=>p.country==='HKG').length,18);
 for(const query of ['香港','Hong Kong','澳门','澳門','Macau','Macao']){
  assert.ok(searchProvinces(query).some(p=>p.id===r.id),query);
 }
 const raw=new Map(SOURCE_TOPOLOGY.atoms.map(a=>[a.id,a]));
 const grouping=new Map(PREPROCESSED_TOPOLOGY.atoms.map(a=>[a.id,a]));
 assert.deepEqual(raw.get('MAC+00?').neighbors,[]);
 assert.deepEqual(grouping.get('MAC+00?').neighbors,['CHN-1180']);
 assert.ok(grouping.get('CHN-1180').neighbors.includes('HKG-5153'));
 assert.ok(!raw.get('CHN-1180').neighbors.includes('HKG-5153'));
});

test('all reviewed attachments are grouping-only and all original terrain data and unrelated groups are unchanged',()=>{
 const raw=new Map(SOURCE_TOPOLOGY.atoms.map(a=>[a.id,a]));
 const grouping=new Map(PREPROCESSED_TOPOLOGY.atoms.map(a=>[a.id,a]));
 for(const [a,b] of plan.regions.flatMap(row=>row.addedGroupingLinks)){
  assert.ok(grouping.get(a).neighbors.includes(b)&&!raw.get(a).neighbors.includes(b));
  assert.ok(grouping.get(b).neighbors.includes(a)&&!raw.get(b).neighbors.includes(a));
 }
 const serialize=({id,sourceIds,legacyHint,reason,displayName,islandAttachments,anchorAtomId,searchAliases})=>
  ({id,atomIds:sourceIds,legacyHint,reason,...(displayName?{displayName}:{}),...(islandAttachments?{islandAttachments}:{}),
    ...(anchorAtomId?{anchorAtomId}:{}),...(searchAliases?{searchAliases}:{})});
 assert.deepEqual(atlas.gameplayGroups.filter(g=>!g.atomIds.some(id=>isReviewedOceanBatch(id)||isAdjacentIslandBatch(id))),
   prior.filter(g=>!g.sourceIds.some(isAdjacentIslandBatch)&&!g.sourceIds.some(isReviewedOceanBatch)).map(serialize));
 assert.deepEqual(atlas.provinces.map(({code,sourceId,...p})=>p),base.provinces);
 const beforePacific=applyAdjacentIslandMergers(base,prior,plan).filter(g=>!g.sourceIds.some(isReviewedOceanBatch));
 assert.deepEqual(atlas.gameplayGroups.filter(g=>!g.atomIds.some(isReviewedOceanBatch)),beforePacific.map(serialize));
 const beforeIndian=applyPacificGameplayRegions(base,applyAdjacentIslandMergers(base,prior,plan),pacific,readGzip('state-regions-1.13.7'));
 const mergedAfterPacific=id=>isIndianOceanBatch(id)||isAtlanticBatch(id)||isAfricaBatch(id)||isSouthAmericaBatch(id)||isNorthAmericaBatch(id);
 assert.deepEqual(atlas.gameplayGroups.filter(g=>!g.atomIds.some(mergedAfterPacific)),
  beforeIndian.filter(g=>!g.sourceIds.some(mergedAfterPacific)).map(serialize));
 const beforeAtlantic=applyReviewedStateIslands(base,beforeIndian,indian,readGzip('state-regions-1.13.7'),
  {label:'Indian Ocean',reason:'victoria-3-reviewed-indian-ocean-region'});
 const mergedAfterIndian=id=>isAtlanticBatch(id)||isAfricaBatch(id)||isSouthAmericaBatch(id)||isNorthAmericaBatch(id);
 assert.deepEqual(atlas.gameplayGroups.filter(g=>!g.atomIds.some(mergedAfterIndian)),
  beforeAtlantic.filter(g=>!g.sourceIds.some(mergedAfterIndian)).map(serialize));
 const beforeAfrica=applyReviewedStateIslands(base,beforeAtlantic,atlantic,readGzip('state-regions-1.13.7'),
  {label:'Atlantic',reason:'victoria-3-reviewed-atlantic-region'});
 const mergedAfterAtlantic=id=>isAfricaBatch(id)||isSouthAmericaBatch(id)||isNorthAmericaBatch(id);
 assert.deepEqual(atlas.gameplayGroups.filter(g=>!g.atomIds.some(mergedAfterAtlantic)),
  beforeAfrica.filter(g=>!g.sourceIds.some(mergedAfterAtlantic)).map(serialize));
 const beforeSouthAmerica=applyReviewedStateIslands(base,beforeAfrica,africa,readGzip('state-regions-1.13.7'),
  {label:'Africa',reason:'victoria-3-reviewed-africa-region',allowNewAttachments:false});
 const mergedAfterAfrica=id=>isSouthAmericaBatch(id)||isNorthAmericaBatch(id);
 assert.deepEqual(atlas.gameplayGroups.filter(g=>!g.atomIds.some(mergedAfterAfrica)),
  beforeSouthAmerica.filter(g=>!g.sourceIds.some(mergedAfterAfrica)).map(serialize));
 const beforeNorthAmerica=applyReviewedStateIslands(base,beforeSouthAmerica,southAmerica,readGzip('state-regions-1.13.7'),
  {label:'South America',reason:'victoria-3-reviewed-south-america-region',allowNewAttachments:false});
 assert.deepEqual(atlas.gameplayGroups.filter(g=>!g.atomIds.some(isNorthAmericaBatch)),
  beforeNorthAmerica.filter(g=>!g.sourceIds.some(isNorthAmericaBatch)).map(serialize));
});

test('unreviewed Guangdong additions or missing administrative links are rejected',()=>{
 const invalid=structuredClone(plan);invalid.regions[0].members['group:CHN-1152']=['CHN-1152'];
 assert.throws(()=>applyAdjacentIslandMergers(base,prior,invalid),/Invalid reviewed adjacent island destination|Only the reviewed Macau|Duplicate or changed island membership/);
 const missing=structuredClone(plan);missing.regions[0].addedGroupingLinks=[];
 assert.throws(()=>applyAdjacentIslandMergers(base,prior,missing),/Only the reviewed Macau/);
});

test('all nine approved scopes are single playable regions and representative routes remain seaborne',()=>{
 assert.equal(MAP_METADATA.count,finalRegionCount);assert.equal(MAP_METADATA.playableCount,finalPlayableCount);assert.equal(MAP_METADATA.sourceAtomCount,4596);
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v25');assert.equal(STATE_VERSION,26);assert.equal(RULES_ID,'admin1-locked-game-regions-v39');
 assert.equal(plan.regions.length,9);
 const targets=new Set(),nav=new TerrainNavigator();
 for(const row of plan.regions.slice(1)){
  const target=byCode(row.primary.slice(6));targets.add(target.id);
  const members=Object.values(row.members).flat().sort(),pacific=oceanScopeOf(members[0]);
  assert.deepEqual(target.name,pacific?.displayName??row.displayName);
  assert.deepEqual(target.center,sourceByCode.get(pacific?.anchorAtomId??row.anchorAtomId).center);
  assert.ok(target.playable&&target.locked&&terrainAt(target.center,true)>=0);
  if(pacific){
   assert.ok(members.every(id=>target.sourceAtoms.includes(id)));
   for(const q of row.displayName)assert.ok(searchProvinces(q,MAP.length).some(g=>g.id===target.id),q);
  }else assert.deepEqual(target.sourceAtoms,members);
  for(const id of target.sourceAtoms){
   const s=sourceByCode.get(id);
   assert.equal(provinceAt(s.center.x,s.center.z),target.id,id);
   assert.equal(byCode(id).id,target.id);
   assert.ok(s.parts.every(p=>target.parts.includes(p)));
  }
 }
 assert.equal(targets.size,new Set(plan.regions.slice(1).map(row=>oceanScopeOf(row.primary.slice(6))?.stateCode??row.primary)).size);
 for(const [island,mainland] of [
  ['MNP-4938','MNP-4939'],['TON-4949','TON-4945'],['NLD-5147','NLD-5148'],['SPM-4866','SPM-4867'],
  ['VIR-4869','VIR-4868'],['VCT-5064','VCT-5063'],['ATG-5092','ATG-5093'],['COM-4934','COM-4935'],
 ]){
  const from=sourceByCode.get(island).center,to=sourceByCode.get(mainland).center;
  assert.equal(terrainSegment(from,to,false),false,island);
  const route=nav.plan(from,to);
  assert.ok(route?.points.some(p=>p.sea),island);assert.ok(validateTravel(route,from,to));
 }
 for(const [query,code] of [
  ['Tinian','MNP-4939'],['Eua','TON-4945'],['Saba','NLD-5148'],['Saint-Pierre','SPM-4867'],
  ['Saint John','VIR-4868'],['Grenadines','VCT-5063'],['Redonda','ATG-5093'],
  ['Bonaire','NLD-5148'],['Northern Islands','MNP-4939'],['Saint Croix','VIR-4868'],['Barbuda','ATG-5093'],['Anjouan','COM-4935']
 ])assert.ok(searchProvinces(query,40).some(r=>r.id===byCode(code).id),query);
 const unaffected=prior.filter(g=>!g.sourceIds.some(isAdjacentIslandBatch));
 assert.equal(prior.length-unaffected.length,27);
});
