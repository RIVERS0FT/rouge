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
import plan from '../data/philippines-gameplay-regions.json' with {type:'json'};
import spawns from '../data/spawn-sites.json' with {type:'json'};

import {isAnyLatestGrouping as isSeaBatch} from './southeast-asia-fixtures.mjs';

const readGzip=name=>JSON.parse(gunzipSync(readFileSync(new URL('../data/'+name+'.json.gz',import.meta.url))));
const base=readGzip('natural-earth-admin1-base');
const historical=consolidateStateRegions(base,readGzip('gameplay-region-partition').groups,decisions);
const prior=repartitionSwissRegions(base,repartitionMaldives(base,applyAdministrativeGroupOverrides(base,repartitionUkRegions(base,repartitionFrenchRegions(base,
  applyCurrentStateMergers(base,historical,currentDecisions,overlapAudit),france),uk),adminOverrides),maldives),swiss);
const isPhilippines=id=>id.startsWith('PHL-'), byCode=id=>MAP[provinceByCode(id)];
const sourceByCode=new Map(SOURCE_MAP.map(p=>[p.code,p]));

test('118 Philippines source areas all resolve to three locked playable territories and their real city anchors',()=>{
 const regions=[];
 for(const [i,row] of plan.regions.entries()){
  const region=byCode(row.anchorAtomId);
  regions.push(region);
  assert.deepEqual(region.name,row.displayName);
  assert.ok(region.playable&&region.locked&&terrainAt(region.center,true)>=0);
  assert.deepEqual(region.center,sourceByCode.get(row.anchorAtomId).center);
  assert.equal(region.sourceAtoms.length,[61,25,32][i]);
  assert.deepEqual(region.sourceAtoms,row.components.flat().sort());
  for(const code of region.sourceAtoms){
   const {center,parts}=sourceByCode.get(code);
   assert.equal(provinceByCode(code),region.id);
   assert.equal(provinceAt(center.x,center.z),region.id);
   for(const part of parts)assert.ok(region.parts.includes(part));
  }
  assert.deepEqual(region.neighbors,[]);
  assert.ok(!spawns.regions.includes(region.id));
  for(const query of row.displayName){assert.ok(searchProvinces(query).some(g=>g.id===region.id),query);}
 }
 assert.equal(MAP.filter(g=>isPhilippines(g.code)).length,3);
 assert.equal(new Set(regions.flatMap(g=>g.sourceAtoms)).size,118);
 assert.equal(MAP_METADATA.count,902);assert.equal(MAP_METADATA.playableCount,898);assert.equal(MAP_METADATA.sourceAtomCount,4596);
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v18');assert.equal(STATE_VERSION,19);
 assert.equal(RULES_ID,'admin1-locked-game-regions-v31');
 for(const [queries,region] of [
  [['Manila','Batanes','Las Pinas','Palawan','达古潘'],regions[0]],
  [['Cebu','Lapu-Lapu','Bacolod','保和省'],regions[1]],
  [['Davao','Tawi-Tawi','Cotabato','卡米金'],regions[2]],
 ]){
  for(const query of queries)assert.ok(searchProvinces(query).some(g=>g.id===region.id),query);
 }
});

test('administrative grouping links only allow grouping and do not replace any land or water routes',()=>{
 const raw=new Map(SOURCE_TOPOLOGY.atoms.map(a=>[a.id,a])),pre=new Map(PREPROCESSED_TOPOLOGY.atoms.map(a=>[a.id,a]));
 const groups=atlas.gameplayGroups.filter(g=>g.atomIds.some(isPhilippines));
 const attachments=groups.flatMap(g=>g.islandAttachments);
 assert.equal(attachments.length,20);
 for(const [island,anchor] of attachments){
  assert.ok(pre.get(island).neighbors.includes(anchor)&&pre.get(anchor).neighbors.includes(island));
  assert.ok(!raw.get(island).neighbors.includes(anchor)&&!raw.get(anchor).neighbors.includes(island));
 }
 const nav=new TerrainNavigator();
 for(const [from,to] of [[0,1],[1,2],[0,2]]){
  const a=byCode(plan.regions[from].anchorAtomId).center,b=byCode(plan.regions[to].anchorAtomId).center;
  assert.equal(terrainSegment(a,b,false),false);
  const route=nav.plan(a,b);
  assert.ok(route?.points.some(point=>point.sea));
  assert.ok(validateTravel(route,a,b));
 }
});

test('all other memberships, names, original geometry and source topology stay exactly the same',()=>{
 const untouched=prior.filter(g=>!g.sourceIds.some(id=>isPhilippines(id)||id.startsWith('THA-')||isSeaBatch(id)));
 assert.equal(prior.length-untouched.length,29+6+18+14+41+22+110+30);
 assert.deepEqual(atlas.gameplayGroups.filter(g=>!g.atomIds.some(id=>isPhilippines(id)||id.startsWith('THA-')||isSeaBatch(id))),
  untouched.map(({id,sourceIds,legacyHint,reason,displayName,islandAttachments,anchorAtomId})=>({id,atomIds:sourceIds,legacyHint,reason,...(displayName?{displayName}:{}),...(islandAttachments?{islandAttachments}:{}),...(anchorAtomId?{anchorAtomId}:{})})));
 assert.deepEqual(atlas.provinces.map(({code,sourceId,...p})=>p),base.provinces);
});

test('unknown memberships and stale reviewed island components fail the atlas build',()=>{
 const duplicated=structuredClone(plan);
 duplicated.regions[0].currentGroups[0]=duplicated.regions[0].currentGroups[1];
 assert.throws(()=>repartitionPhilippines(base,prior,duplicated),/Duplicate or unknown Philippines input group/);
 const wrongAnchor=structuredClone(plan);wrongAnchor.regions[0].anchorAtomId='CHE-159';
 assert.throws(()=>repartitionPhilippines(base,prior,wrongAnchor),/Invalid Philippines membership or anchor/);
 const changedComponent=structuredClone(plan);
 changedComponent.regions[0].components[1]=changedComponent.regions[0].components[2];
 assert.throws(()=>repartitionPhilippines(base,prior,changedComponent),/Unreviewed physical Philippines components/);
});
