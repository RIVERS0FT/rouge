import {usePreClassAMapFixture} from './pre-class-a-map-fixture.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {applyPacificGameplayRegions} from '../scripts/apply-pacific-gameplay-regions.mjs';
import plan from '../data/pacific-gameplay-regions.json' with {type:'json'};
import {preClassARegionCount as finalRegionCount} from './reviewed-ocean-fixtures.mjs';

usePreClassAMapFixture();
const {MAP,MAP_METADATA,PREPROCESSED_TOPOLOGY,SOURCE_MAP,SOURCE_TOPOLOGY,provinceAt,provinceByCode,searchProvinces}=await import('../src/game/map.ts');
const {MAP_ID,RULES_ID,STATE_VERSION}=await import('../src/game/content.ts');
const {SAVE_PREFIX}=await import('../src/game/save.ts');
const {terrainAt,terrainSegment}=await import('../src/game/terrain-navigation.ts');
const {default:atlas}=await import('../src/generated/world.js');

const base=JSON.parse(gunzipSync(readFileSync(new URL('../data/natural-earth-admin1-base.json.gz',import.meta.url))));
const reference=JSON.parse(gunzipSync(readFileSync(new URL('../data/state-regions-1.13.7.json.gz',import.meta.url))));
const source=new Map(SOURCE_MAP.map(a=>[a.code,a]));
const physical=new Map(SOURCE_TOPOLOGY.atoms.map(a=>[a.id,a.neighbors]));
const partition=new Map(PREPROCESSED_TOPOLOGY.atoms.map(a=>[a.id,a.neighbors]));
const names=new Map(reference.provinces.map(r=>[r.code,r.name]));

test('Pacific plan collapses complete source groups into named locked gameplay regions with real land anchors',()=>{
 const outputs=new Set();
 for(const row of plan.regions){
  assert.equal(row.displayName[1],names.get(row.stateCode)[1]);
  const atoms=Object.values(row.members).flat().sort(),r=MAP[provinceByCode(atoms[0])],a=source.get(row.anchorAtomId);
  assert.equal(r.code,atoms[0]);assert.deepEqual(r.sourceAtoms,atoms);assert.deepEqual(r.name,row.displayName);
  assert.deepEqual(r.center,a.center);assert.ok(r.locked&&r.playable&&terrainAt(r.center,true)>=0,row.stateCode);
  assert.ok(!outputs.has(r.id),row.stateCode);outputs.add(r.id);
  for(const s of atoms.map(id=>source.get(id))){
   assert.equal(provinceByCode(s.code),r.id);assert.ok(s.parts.every(p=>r.parts.includes(p)),s.code);
   if(s.playable)assert.equal(provinceAt(s.center.x,s.center.z),r.id,s.code);
  }
  for(const q of [...row.displayName,...row.searchAliases??[]])assert.ok(searchProvinces(q,MAP.length).some(p=>p.id===r.id),q);
 }
 assert.equal(MAP_METADATA.count,finalRegionCount);
 assert.equal(MAP_METADATA.playableCount,MAP_METADATA.count-4);
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v27');
 assert.equal(STATE_VERSION,28);assert.equal(SAVE_PREFIX,'rouge.save.natural-earth-admin1.regions.v28.');
 assert.equal(RULES_ID,'admin1-locked-game-regions-v43');
});

test('Pacific grouping links never widen physical land; original coastlines and source country tags survive byte-for-byte',()=>{
 assert.deepEqual(atlas.provinces.map(({code,sourceId,...p})=>p),base.provinces);
 const Pacific=atlas.gameplayGroups.filter(g=>g.reason==='victoria-3-reviewed-pacific-region');
 assert.equal(Pacific.length,plan.regions.length);
 let someSeparation=false;
 for(const group of Pacific)for(const [from,to] of group.islandAttachments??[]){
  assert.ok(!physical.get(from).includes(to)&&!physical.get(to).includes(from));
  assert.ok(partition.get(from).includes(to)&&partition.get(to).includes(from));
  const a=source.get(from),b=source.get(to);
  if(a.playable&&b.playable&&!terrainSegment(a.center,b.center,false))someSeparation=true;
 }
 assert.ok(someSeparation);
});

test('Pacific validator checks known state codes, exact name, anchor lineage and unmodified existing memberships',()=>{
 const synthetic={provinces:[
  {id:'A',country:'AA',neighbors:[]},{id:'B',country:'AB',neighbors:[]},{id:'C',country:'AB',neighbors:[]},
  {id:'D',country:'AC',neighbors:[]}
 ]};
 const before=[{id:'group:A',sourceIds:['A','B'],islandAttachments:[['A','B']],searchAliases:['Earlier']},
  {id:'group:C',sourceIds:['C'],displayName:['旧称','Old name']},{id:'group:D',sourceIds:['D']}];
 const ref={sourceVersion:'1.13.7',provinces:[{code:'STATE_EXAMPLE',name:['州名','Example']}]};
 const sample={schema:1,referenceVersion:'1.13.7',regions:[
  {stateCode:'STATE_EXAMPLE',primary:'group:C',members:{'group:A':['A','B'],'group:C':['C']},
   displayName:['州名','Example'],anchorAtomId:'C',searchAliases:['Alias']}
 ]};
 const [replacement,untouched]=applyPacificGameplayRegions(synthetic,before,sample,ref);
 assert.equal(untouched,before[2]);assert.equal(replacement.id,'group:A');
 assert.equal(replacement.anchorAtomId,'C');assert.deepEqual(replacement.sourceIds,['A','B','C']);
 assert.deepEqual(replacement.islandAttachments,[['A','B'],['A','C']]);
 assert.deepEqual(replacement.searchAliases,['Alias','Earlier','Old name','旧称']);
 for(const change of [
  r=>r.displayName[1]='Incorrect',r=>r.stateCode='STATE_UNKNOWN',r=>r.anchorAtomId='B',
  r=>r.members['group:A']=['A'],r=>r.members['group:C']=['D'],
 ]){const invalid=structuredClone(sample);change(invalid.regions[0]);assert.throws(()=>applyPacificGameplayRegions(synthetic,before,invalid,ref),/Invalid Pacific|changed Pacific/);}
 assert.throws(()=>applyPacificGameplayRegions(synthetic,before,{...sample,regions:[...sample.regions,...sample.regions]},ref),/Invalid Pacific/);
});
