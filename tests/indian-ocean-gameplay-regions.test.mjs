import {usePreClassAMapFixture} from './pre-class-a-map-fixture.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import plan from '../data/indian-ocean-gameplay-regions.json' with {type:'json'};
import {preClassARegionCount as finalRegionCount,preClassAPlayableCount as finalPlayableCount} from './reviewed-ocean-fixtures.mjs';

usePreClassAMapFixture();
const {MAP,MAP_METADATA,PREPROCESSED_TOPOLOGY,SOURCE_MAP,SOURCE_TOPOLOGY,provinceAt,provinceByCode,searchProvinces}=await import('../src/game/map.ts');
const {MAP_ID,RULES_ID,STATE_VERSION}=await import('../src/game/content.ts');
const {SAVE_PREFIX}=await import('../src/game/save.ts');
const {terrainAt}=await import('../src/game/terrain-navigation.ts');
const {default:atlas}=await import('../src/generated/world.js');

const base=JSON.parse(gunzipSync(readFileSync(new URL('../data/natural-earth-admin1-base.json.gz',import.meta.url))));
const reference=JSON.parse(gunzipSync(readFileSync(new URL('../data/state-regions-1.13.7.json.gz',import.meta.url))));
const source=new Map(SOURCE_MAP.map(a=>[a.code,a]));
const physical=new Map(SOURCE_TOPOLOGY.atoms.map(a=>[a.id,a.neighbors]));
const partition=new Map(PREPROCESSED_TOPOLOGY.atoms.map(a=>[a.id,a.neighbors]));
const names=new Map(reference.provinces.map(r=>[r.code,r.name]));

test('Indian Ocean historical grouping has exact whole-atom coverage, bilingual names and valid land anchors',()=>{
 const ids=new Set();
 for(const row of plan.regions){
  assert.equal(row.displayName[1],names.get(row.stateCode)[1]);
  const atoms=Object.values(row.members).flat().sort(),r=MAP[provinceByCode(atoms[0])];
  assert.ok(!ids.has(r.id),row.stateCode);
  ids.add(r.id);assert.deepEqual(r.sourceAtoms,atoms);assert.deepEqual(r.name,row.displayName);
  assert.deepEqual(r.center,source.get(row.anchorAtomId).center);assert.ok(r.locked&&r.playable&&terrainAt(r.center,true)>=0,row.stateCode);
  for(const atom of atoms.map(id=>source.get(id))){
   assert.equal(provinceByCode(atom.code),r.id);
   assert.ok(atom.parts.every(p=>r.parts.includes(p)),atom.code);
   if(atom.playable)assert.equal(provinceAt(atom.center.x,atom.center.z),r.id,atom.code);
  }
  for(const alias of [...row.displayName,...row.searchAliases??[]])
   assert.ok(searchProvinces(alias,MAP.length).some(p=>p.id===r.id),alias);
 }
 assert.equal(MAP_METADATA.count,finalRegionCount);
 assert.equal(MAP_METADATA.playableCount,finalPlayableCount);
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v27');
 assert.equal(STATE_VERSION,28);assert.equal(SAVE_PREFIX,'rouge.save.natural-earth-admin1.regions.v28.');
 assert.equal(RULES_ID,'admin1-locked-game-regions-v42');
});

test('Indian Ocean grouping leaves geographic country labels and the physical topology untouched',()=>{
 assert.deepEqual(atlas.provinces.map(({code,sourceId,...p})=>p),base.provinces);
 const groups=atlas.gameplayGroups.filter(g=>g.reason==='victoria-3-reviewed-indian-ocean-region');
 assert.equal(groups.length,plan.regions.length);
 for(const g of groups)for(const [a,b] of g.islandAttachments??[]){
  assert.ok(!physical.get(a).includes(b)&&!physical.get(b).includes(a));
  assert.ok(partition.get(a).includes(b)&&partition.get(b).includes(a));
 }
});

test('audited west/east islands share the intended historical region and documented exceptions stay independent',()=>{
 const region=id=>MAP[provinceByCode(id)];
 for(const [name,anchor,priorCodes,count] of [
  [['北马达加斯加','North Madagascar'],'MDG-5862',['MDG-5860'],12],
  [['南马达加斯加','South Madagascar'],'MDG-5861',['MDG-5861','COM-4934','FRA-4602'],14],
  [['印度洋领地','Indian Ocean Territory'],'MUS-5190',['MUS-5180','FRA-4601'],17],
  [['锡兰','Ceylon'],'LKA-2470',['LKA-2448','MDV-5223','IOT+00?'],47],
  [['桑给巴尔','Zanzibar'],'TZA-3337',['TZA-3337','TZA-3380'],5],
  [['勃固','Pegu'],'MMR-3269',['MMR-3268','IND-2474'],5],
 ]){
  const r=region(anchor);
  assert.deepEqual(r.name,name);assert.equal(r.sourceAtoms.length,count);
  assert.ok(priorCodes.every(c=>region(c)===r),name[1]);
 }
 const seychelles=region('SYC-5197');assert.deepEqual(seychelles.name,['塞舌尔','Seychelles']);
 assert.ok(seychelles.sourceAtoms.every(code=>code.startsWith('SYC-')));
 assert.notEqual(region('MDG-5860'),region('MDG-5861'));
});
