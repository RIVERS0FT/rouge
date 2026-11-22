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
import plan from '../data/user-island-gameplay-regions.json' with {type:'json'};

import {isUserIslands,isAdjacentIslandBatch} from './southeast-asia-fixtures.mjs';
import {repartitionAsiaArabia} from '../scripts/apply-asia-arabia-gameplay-regions.mjs';
import {applyEuropeSmallMergers} from '../scripts/apply-europe-small-gameplay-regions.mjs';
import {repartitionUserIslands} from '../scripts/apply-user-island-gameplay-regions.mjs';
import {repartitionGlobalIslands} from '../scripts/apply-global-island-gameplay-regions.mjs';
import {repartitionEurope} from '../scripts/apply-europe-gameplay-regions.mjs';
import {repartitionSoutheastAsia} from '../scripts/apply-southeast-asia-gameplay-regions.mjs';

const readGzip=name=>JSON.parse(gunzipSync(readFileSync(new URL('../data/'+name+'.json.gz',import.meta.url))));
const base=readGzip('natural-earth-admin1-base');
const historical=consolidateStateRegions(base,readGzip('gameplay-region-partition').groups,decisions);
const prior=repartitionGlobalIslands(base,applyEuropeSmallMergers(base,repartitionEurope(base,repartitionAsiaArabia(base,repartitionSoutheastAsia(base,repartitionThailand(base,repartitionPhilippines(base,repartitionSwissRegions(base,repartitionMaldives(base,applyAdministrativeGroupOverrides(base,repartitionUkRegions(base,repartitionFrenchRegions(base,
  applyCurrentStateMergers(base,historical,currentDecisions,overlapAudit),france),uk),adminOverrides),maldives),swiss),philippines),thailand),sea),asiaArabia),europe),smallEurope),globalIslands);
const byCode=id=>MAP[provinceByCode(id)];
const sourceByCode=new Map(SOURCE_MAP.map(p=>[p.code,p]));

test('83 original source areas select five playable groups with exact names, anchors and multilingual aliases',()=>{
 assert.equal(MAP_METADATA.count,finalRegionCount);assert.equal(MAP_METADATA.playableCount,finalPlayableCount);assert.equal(MAP_METADATA.sourceAtomCount,4596);
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v28');assert.equal(STATE_VERSION,30);assert.equal(RULES_ID,'admin1-locked-game-regions-v47');
 const selected=new Set();
 for(const {id,groups,displayName,anchorAtomId,searchAliases} of plan.regions){
  const r=byCode(id.slice(6));selected.add(r.id);
  const members=[...Object.values(groups).flat(),...(id==='group:CHN-1180'?['MAC+00?']:[])].sort(),pacific=oceanScopeOf(members[0]);
  assert.deepEqual(r.name,pacific?.displayName??displayName);assert.deepEqual(r.center,sourceByCode.get(pacific?.anchorAtomId??anchorAtomId).center);
  if(pacific)assert.ok(members.every(code=>r.sourceAtoms.includes(code)));
  else assert.deepEqual(r.sourceAtoms,members);
  assert.ok(r.playable&&r.locked&&terrainAt(r.center,true)>=0,id);
  for(const code of r.sourceAtoms){
   const s=sourceByCode.get(code);
   assert.equal(provinceAt(s.center.x,s.center.z),r.id,code);assert.equal(byCode(code).id,r.id);
   assert.ok(s.parts.every(part=>r.parts.includes(part)));
  }
  for(const query of [...displayName,...(searchAliases??[])])assert.ok(searchProvinces(query).some(p=>p.id===r.id),query);
 }
 assert.equal(selected.size,5);
 const caribbean=byCode('AIA+99?');
 for(const tag of ['AIA','GRD','LCA']){
  const ids=atlas.provinces.filter(p=>p.country===tag).map(p=>p.id);
  assert.ok(ids.every(code=>byCode(code).id===caribbean.id));
 }
 assert.deepEqual(caribbean.neighbors,[]);
 const guangdong=byCode('CHN-1180');
 assert.equal(guangdong.sourceAtoms.length,20);
 const hk=atlas.provinces.filter(p=>p.country==='HKG');
 assert.equal(hk.length,18);assert.ok(hk.every(p=>byCode(p.id).id===guangdong.id));
 const macau=atlas.provinces.filter(p=>p.country==='MAC');assert.ok(macau.length>0);
 assert.ok(macau.every(p=>byCode(p.id).id===guangdong.id));
});

test('all reviewed disconnected components stay outside the original physical graph and real sea routes still work',()=>{
 const raw=new Map(SOURCE_TOPOLOGY.atoms.map(a=>[a.id,a])),grouping=new Map(PREPROCESSED_TOPOLOGY.atoms.map(a=>[a.id,a]));
 const links=repartitionUserIslands(base,prior,plan).filter(g=>g.sourceIds.some(isUserIslands)).flatMap(g=>g.islandAttachments??[]);
 links.push(['MAC+00?','CHN-1180']);
 assert.equal(links.length,16);
 for(const [a,b] of links){
  assert.ok(grouping.get(a).neighbors.includes(b)&&!raw.get(a).neighbors.includes(b));
  assert.ok(grouping.get(b).neighbors.includes(a)&&!raw.get(b).neighbors.includes(a));
 }
 const nav=new TerrainNavigator();
 for(const [a,b] of [['GRD-5069','GRD-5070'],['TWN-3414','TWN-1156'],['TCA-5007','TCA-5005']]){
  const from=sourceByCode.get(a).center,to=sourceByCode.get(b).center;
  assert.equal(terrainSegment(from,to,false),false);
  const route=nav.plan(from,to);
  assert.ok(route?.points.some(p=>p.sea),a);assert.ok(validateTravel(route,from,to));
 }
 const g=byCode('CHN-1180');
 const contact=new Set(g.sourceAtoms.flatMap(code=>sourceByCode.get(code).neighbors.map(i=>byCode(SOURCE_MAP[i].code).id)));
 contact.delete(g.id);
 assert.deepEqual(g.neighbors,[...contact].sort((a,b)=>a-b));
});

test('outside the reviewed scope all game groups, raw country fields, source geometry and land edges are exact',()=>{
 const unaffected=prior.filter(g=>!g.sourceIds.some(id=>isUserIslands(id)||isAdjacentIslandBatch(id)));
 assert.equal(prior.length-unaffected.length,30+26);
 const serialize=({id,sourceIds,legacyHint,reason,displayName,islandAttachments,anchorAtomId,searchAliases})=>
  ({id,atomIds:sourceIds,legacyHint,reason,...(displayName?{displayName}:{}),...(islandAttachments?{islandAttachments}:{}),
   ...(anchorAtomId?{anchorAtomId}:{}),...(searchAliases?{searchAliases}:{})});
 assert.deepEqual(atlas.gameplayGroups.filter(g=>!g.atomIds.some(id=>isReviewedOceanBatch(id)||isUserIslands(id)||isAdjacentIslandBatch(id))),unaffected.filter(g=>!g.sourceIds.some(isReviewedOceanBatch)).map(serialize));
 assert.deepEqual(atlas.provinces.map(({code,sourceId,...p})=>p),base.provinces);
});

test('changing the source sets or charted physical components is rejected',()=>{
 const wrong=structuredClone(plan);wrong.regions[0].groups['group:AIA+99?']=['AIA-5114'];
 assert.throws(()=>repartitionUserIslands(base,prior,wrong),/Duplicate, foreign or changed source membership/);
 const components=structuredClone(plan);components.regions[1].components[0]=components.regions[1].components[1];
 assert.throws(()=>repartitionUserIslands(base,prior,components),/Changed real island components/);
});
