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
import {terrainAt} from '../src/game/terrain-navigation.ts';
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
import plan from '../data/europe-small-gameplay-regions.json' with {type:'json'};

import {isSmallEuropeBatch,isAllIslands} from './southeast-asia-fixtures.mjs';
import {repartitionAsiaArabia} from '../scripts/apply-asia-arabia-gameplay-regions.mjs';
import {applyEuropeSmallMergers} from '../scripts/apply-europe-small-gameplay-regions.mjs';
import {repartitionEurope} from '../scripts/apply-europe-gameplay-regions.mjs';
import {repartitionSoutheastAsia} from '../scripts/apply-southeast-asia-gameplay-regions.mjs';

const readGzip=name=>JSON.parse(gunzipSync(readFileSync(new URL('../data/'+name+'.json.gz',import.meta.url))));
const base=readGzip('natural-earth-admin1-base');
const historical=consolidateStateRegions(base,readGzip('gameplay-region-partition').groups,decisions);
const prior=repartitionEurope(base,repartitionAsiaArabia(base,repartitionSoutheastAsia(base,repartitionThailand(base,repartitionPhilippines(base,repartitionSwissRegions(base,repartitionMaldives(base,applyAdministrativeGroupOverrides(base,repartitionUkRegions(base,repartitionFrenchRegions(base,
  applyCurrentStateMergers(base,historical,currentDecisions,overlapAudit),france),uk),adminOverrides),maldives),swiss),philippines),thailand),sea),asiaArabia),europe);
const byCode=id=>MAP[provinceByCode(id)];
const sourceByCode=new Map(SOURCE_MAP.map(p=>[p.code,p]));

test('fourteen fragments merge into nine named destinations while old lookup and anchor coordinates remain exact',()=>{
 assert.equal(MAP_METADATA.count,902);assert.equal(MAP_METADATA.playableCount,898);assert.equal(MAP_METADATA.sourceAtomCount,4596);
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v18');assert.equal(STATE_VERSION,19);assert.equal(RULES_ID,'admin1-locked-game-regions-v31');
 assert.equal(MAP.filter(p=>p.code.startsWith('SVN-')).length,2);
 for(const {primary,members,displayName,anchorAtomId} of plan.regions){
  const r=byCode(primary.slice(6));
  assert.ok(r.playable&&r.locked&&terrainAt(r.center,true)>=0,primary);
  const ids=Object.values(members).flat().sort();
  assert.deepEqual(r.center,sourceByCode.get(anchorAtomId).center);
  assert.deepEqual(r.sourceAtoms,ids);assert.equal(r.code,ids[0]);assert.deepEqual(r.name,displayName);
  const target=new Set(members[primary]);
  for(const [old,membership] of Object.entries(members)){
   if(old!==primary)assert.ok(membership.some(atom=>sourceByCode.get(atom).neighbors.some(i=>target.has(SOURCE_MAP[i].code))),old);
   for(const code of membership){
    const s=sourceByCode.get(code);
    assert.equal(provinceAt(s.center.x,s.center.z),r.id,code);assert.equal(byCode(code).id,r.id);
    assert.ok(s.parts.every(part=>r.parts.includes(part)));
   }
  }
  const neighbors=new Set(ids.flatMap(code=>sourceByCode.get(code).neighbors.map(i=>byCode(SOURCE_MAP[i].code).id)));
  neighbors.delete(r.id);
  assert.deepEqual(r.neighbors,[...neighbors].sort((a,b)=>a-b));
 }
 for(const [query,primary] of [['Bremen','DEU-1576'],['Hamburg','DEU-1579'],['Camenca','MDA-1628']]){
  assert.ok(searchProvinces(query).some(r=>r.id===byCode(primary).id),query);
 }
 assert.deepEqual(byCode('BIH-3153').sourceAtoms.filter(id=>plan.regions.find(g=>g.primary==='group:BIH-2224').members['group:BIH-3153'].includes(id)),
  plan.regions.find(g=>g.primary==='group:BIH-2224').members['group:BIH-3153']);
});

test('real source edges and grouping-only topology are unchanged; all unrelated gameplay regions are exact',()=>{
 const untouched=prior.filter(g=>!g.sourceIds.some(id=>isSmallEuropeBatch(id)||isAllIslands(id)));
 assert.equal(prior.length-untouched.length,23+110+30);
 const serialize=({id,sourceIds,legacyHint,reason,displayName,islandAttachments,anchorAtomId,searchAliases})=>
  ({id,atomIds:sourceIds,legacyHint,reason,...(displayName?{displayName}:{}),...(islandAttachments?{islandAttachments}:{}),
   ...(anchorAtomId?{anchorAtomId}:{}),...(searchAliases?{searchAliases}:{})});
 assert.deepEqual(atlas.gameplayGroups.filter(g=>!g.atomIds.some(id=>isSmallEuropeBatch(id)||isAllIslands(id))),untouched.map(serialize));
 assert.deepEqual(atlas.provinces.map(({code,sourceId,...p})=>p),base.provinces);
 const attached=g=>(g.islandAttachments??[]).map(x=>x.join(':'));
 assert.deepEqual(atlas.gameplayGroups.filter(g=>!g.atomIds.some(isAllIslands)).flatMap(attached).sort(),prior.flatMap(attached).sort());
});

test('stale membership and an unproven land attachment fail before atlas generation',()=>{
 const unauthorized=structuredClone(plan);
 unauthorized.regions[0].members['group:SVN-269']=['SVN-200'];
 assert.throws(()=>applyEuropeSmallMergers(base,prior,unauthorized),/Unexpected European fragment membership/);
 const disconnected={...base,provinces:base.provinces.map(p=>p.id==='DEU-1575'?{...p,neighbors:[]}:p)};
 assert.throws(()=>applyEuropeSmallMergers(disconnected,prior,plan),/must actually touch destination land/);
});
