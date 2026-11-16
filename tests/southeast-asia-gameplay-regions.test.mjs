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
import plan from '../data/southeast-asia-gameplay-regions.json' with {type:'json'};

import {isAsiaArabia,isAnyLatestGrouping} from './southeast-asia-fixtures.mjs';
import {repartitionSoutheastAsia} from '../scripts/apply-southeast-asia-gameplay-regions.mjs';

const readGzip=name=>JSON.parse(gunzipSync(readFileSync(new URL('../data/'+name+'.json.gz',import.meta.url))));
const base=readGzip('natural-earth-admin1-base');
const historical=consolidateStateRegions(base,readGzip('gameplay-region-partition').groups,decisions);
const prior=repartitionThailand(base,repartitionPhilippines(base,repartitionSwissRegions(base,repartitionMaldives(base,applyAdministrativeGroupOverrides(base,repartitionUkRegions(base,repartitionFrenchRegions(base,
  applyCurrentStateMergers(base,historical,currentDecisions,overlapAudit),france),uk),adminOverrides),maldives),swiss),philippines),thailand);
const byCode=id=>MAP[provinceByCode(id)];
const sourceByCode=new Map(SOURCE_MAP.map(p=>[p.code,p]));

test('approved Southeast Asian gameplay groups preserve all original atoms, pick points, and search aliases',()=>{
 assert.equal(MAP_METADATA.count,927);assert.equal(MAP_METADATA.playableCount,923);assert.equal(MAP_METADATA.sourceAtomCount,4596);
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v17');assert.equal(STATE_VERSION,18);assert.equal(RULES_ID,'admin1-locked-game-regions-v30');
 const countries=['BRN','KHM','IDN','LAO','MYS','MMR','PHL','SGP','THA','TLS','VNM'];
 assert.equal(MAP.filter(r=>countries.includes(r.code.slice(0,3))).length,39);
 for(const [country,count] of [['SGP',0],['MYS',2],['VNM',3],['TLS',1],['IDN',15],['KHM',1]]){
  assert.equal(MAP.filter(r=>r.code.startsWith(country+'-')).length,count);
 }
 for(const row of plan.regions.filter(row=>!Object.values(row.groups).flat().some(isAsiaArabia))){
  const r=byCode(row.id.slice(6));
  assert.ok(r.playable&&r.locked&&terrainAt(r.center,true)>=0);
  assert.equal('group:'+r.code,row.id);
  assert.deepEqual(r.name,row.displayName);
  assert.deepEqual(r.sourceAtoms,Object.values(row.groups).flat().sort());
  if(row.anchorAtomId) assert.deepEqual(r.center,sourceByCode.get(row.anchorAtomId).center);
  for(const code of r.sourceAtoms){
   const {center,parts}=sourceByCode.get(code);
   assert.equal(byCode(code).id,r.id);assert.equal(provinceAt(center.x,center.z),r.id);
   assert.ok(parts.every(part=>r.parts.includes(part)));
  }
  const expected=new Set(r.sourceAtoms.flatMap(code=>sourceByCode.get(code).neighbors.map(i=>byCode(SOURCE_MAP[i].code).id)));
  expected.delete(r.id);
  assert.deepEqual(r.neighbors,[...expected].sort((a,b)=>a-b));
 }
 for(const [query,target] of [
  ['Singapore','MYS-1137'],['新加坡','MYS-1137'],['Johor','MYS-1137'],['Labuan','MYS-1186'],['Phnom Penh','KHM-1777'],
  ['Liquica','TLS-541'],['Otdar Mean Chey','KHM-1777'],['An Giang','VNM-444'],['Bình Phước','VNM-444'],['Maluku Utara','IDN-538'],
 ]){
  assert.ok(searchProvinces(query).some(p=>p.id===byCode(target).id),query);
 }
 assert.equal(byCode('TLS-543').id,byCode('TLS-541').id);
 const bali=atlas.provinces.find(p=>p.country==='IDN'&&p.name[1]==='Bali');
 assert.notEqual(byCode(bali.id).id,byCode('IDN-1235').id);
});

test('four reviewed island links are grouping-only, including Singapore; no route can traverse the water as land',()=>{
 const real=new Map(SOURCE_TOPOLOGY.atoms.map(a=>[a.id,a])),locked=new Map(PREPROCESSED_TOPOLOGY.atoms.map(a=>[a.id,a]));
 const nav=new TerrainNavigator(),edges=plan.regions.flatMap(r=>r.islandAttachments);
 assert.equal(edges.length,4);
 for(const [a,b] of edges){
  assert.ok(!real.get(a).neighbors.includes(b)&&!real.get(b).neighbors.includes(a));
  assert.ok(locked.get(a).neighbors.includes(b)&&locked.get(b).neighbors.includes(a));
  const from=sourceByCode.get(a).center,to=sourceByCode.get(b).center;
  assert.equal(terrainSegment(from,to,false),false);
  const route=nav.plan(from,to);
  assert.ok(route?.points.some(p=>p.sea),a+' to '+b);assert.ok(validateTravel(route,from,to));
 }
 const sgp=atlas.provinces.filter(p=>p.country==='SGP');
 assert.equal(sgp.length,5);assert.ok(sgp.every(p=>byCode(p.id).id===byCode('MYS-1137').id));
});

test('the batch changes no other group, raw country, geometry, or neighbor data',()=>{
 const original=prior.filter(g=>!g.sourceIds.some(isAnyLatestGrouping));
 assert.equal(prior.length-original.length,18+14+41+22+110);
 assert.deepEqual(atlas.gameplayGroups.filter(g=>!g.atomIds.some(isAnyLatestGrouping)),
  original.map(({id,sourceIds,legacyHint,reason,displayName,islandAttachments,anchorAtomId})=>({id,atomIds:sourceIds,legacyHint,reason,...(displayName?{displayName}:{}),...(islandAttachments?{islandAttachments}:{}),...(anchorAtomId?{anchorAtomId}:{})})));
 assert.deepEqual(atlas.provinces.map(({code,sourceId,...p})=>p),base.provinces);
});

test('cross-country exception only applies to the five pinned Singapore members and rejected disconnected plans do not fabricate land',()=>{
 const missing=structuredClone(plan);missing.regions.find(g=>g.id==='group:MYS-1137').islandAttachments=[];
 assert.throws(()=>repartitionSoutheastAsia(base,prior,missing),/Unreviewed disconnected/);
 const bad=structuredClone(plan);const changed=bad.regions.find(g=>g.id==='group:IDN-538');
 const foreign=prior.find(g=>g.id==='group:TLS-543');
 changed.groups[foreign.id]=foreign.sourceIds;
 assert.throws(()=>repartitionSoutheastAsia(base,prior,bad),/Unexpected Southeast Asia cross-country grouping/);
});
