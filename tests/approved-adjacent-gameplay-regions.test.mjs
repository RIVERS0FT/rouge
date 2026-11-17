import {usePreClassAMapFixture} from './pre-class-a-map-fixture.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {applyApprovedAdjacentGameplayRegions} from '../scripts/apply-approved-adjacent-gameplay-regions.mjs';
import plan from '../data/approved-adjacent-gameplay-regions.json' with {type:'json'};

usePreClassAMapFixture();
const {MAP,MAP_METADATA,PREPROCESSED_TOPOLOGY,SOURCE_MAP,SOURCE_TOPOLOGY,provinceAt,provinceByCode,searchProvinces}=await import('../src/game/map.ts');
const {MAP_ID,RULES_ID,STATE_VERSION}=await import('../src/game/content.ts');
const {SAVE_PREFIX}=await import('../src/game/save.ts');
const {terrainAt}=await import('../src/game/terrain-navigation.ts');
const {default:atlas}=await import('../src/generated/world.js');

const base=JSON.parse(gunzipSync(readFileSync(new URL('../data/natural-earth-admin1-base.json.gz',import.meta.url))));
const source=new Map(SOURCE_MAP.map(atom=>[atom.code,atom]));
const raw=new Map(SOURCE_TOPOLOGY.atoms.map(atom=>[atom.id,atom.neighbors]));
const management=new Map(PREPROCESSED_TOPOLOGY.atoms.map(atom=>[atom.id,atom.neighbors]));
const provenance='user-approved-adjacent-gameplay-region';
const find=code=>MAP[provinceByCode(code)];

test('exactly the 21 approved transfers preserve 18 receiving names, land anchors, and all atom picking',()=>{
 const ids=new Set();let donors=0,contacts=0,covered=0;
 for(const row of plan.regions){
  const atoms=[...row.targetSourceIds,...row.sources.flatMap(s=>s.sourceIds)].sort();
  const receiver=find(row.anchorAtomId);
  assert.ok(!ids.has(receiver.id));ids.add(receiver.id);
  assert.deepEqual(receiver.sourceAtoms,atoms);
  assert.deepEqual(receiver.name,row.displayName);
  assert.deepEqual(receiver.center,source.get(row.anchorAtomId).center);
  assert.ok(receiver.playable&&receiver.locked&&terrainAt(receiver.center,true)>=0);
  for(const atom of atoms){
   const prior=source.get(atom);
   assert.equal(find(atom),receiver);
   assert.ok(prior.parts.every(part=>receiver.parts.includes(part)),atom);
   if(prior.playable)assert.equal(provinceAt(prior.center.x,prior.center.z),receiver.id,atom);
  }
  for(const {group,aliases,sourceIds,landEdges} of row.sources){
   assert.ok(sourceIds.length>0);
   for(const q of [...aliases,group,...sourceIds])
    assert.ok(searchProvinces(q,MAP.length).some(r=>r.id===receiver.id),q);
   for(const [a,b] of landEdges){
    assert.ok(raw.get(a).includes(b)&&raw.get(b).includes(a),a+' ↔ '+b);
    assert.ok(management.get(a).includes(b)&&management.get(b).includes(a),a+' ↔ '+b);
   }
   contacts+=landEdges.length;donors++;
  }
  covered+=atoms.length;
 }
 assert.equal(ids.size,18);assert.equal(donors,21);assert.equal(contacts,53);assert.equal(covered,153);
 assert.equal(MAP_METADATA.count,750);assert.equal(MAP_METADATA.playableCount,746);
 assert.equal(MAP_METADATA.sourceAtomCount,4596);
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v28');
 assert.equal(STATE_VERSION,29);assert.equal(SAVE_PREFIX,'rouge.save.natural-earth-admin1.regions.v29.');
 assert.equal(RULES_ID,'admin1-locked-game-regions-v44');
});

test('cross-border gameplay labels do not change raw jurisdiction data or invent routes',()=>{
 assert.deepEqual(atlas.provinces.map(({code,sourceId,...atom})=>atom),base.provinces);
 const changed=atlas.gameplayGroups.filter(region=>region.reason===provenance);
 assert.equal(changed.length,18);
 assert.ok(changed.every(r=>!r.islandAttachments?.length));
 const sourceCountries=new Map(atlas.provinces.map(p=>[p.id,p.country]));
 for(const [id,country,receiver,name] of [
  ['BTN-2433','BTN','IND-3299',['阿鲁纳恰尔邦','Arunachal Pradesh']],
  ['RUS-2324','RUS','POL-3139',['瓦尔米亚-马祖里省','Warmian-Masurian']],
  ['VAT+00?','VAT','ITA-5422',['罗马省','Roma']],
  ['LBN-3024','LBN','LBN-3022',['贝卡省','Beqaa']],
 ]){
  assert.equal(sourceCountries.get(id),country);
  assert.equal(find(id),find(receiver));
  assert.deepEqual(find(id).name,name);
 }
});

test('stale receiving membership, forged raw land contacts and duplicated transfers are rejected',()=>{
 const unaffected=atlas.gameplayGroups.filter(g=>g.reason!==provenance).map(({id,atomIds:sourceIds})=>({id,sourceIds}));
 const original=[...unaffected,...plan.regions.flatMap(r=>[
  {id:r.target,sourceIds:r.targetSourceIds},...r.sources.map(s=>({id:s.group,sourceIds:s.sourceIds})),
 ])];
 assert.equal(applyApprovedAdjacentGameplayRegions(base,original,plan).length,750);
 const changed=edit=>{const copy=structuredClone(plan);edit(copy);return copy;};
 assert.throws(()=>applyApprovedAdjacentGameplayRegions(base,original,changed(p=>p.regions[0].targetSourceIds.pop())),/changed approved adjacent group/);
 assert.throws(()=>applyApprovedAdjacentGameplayRegions(base,original,changed(p=>p.regions[0].sources[0].landEdges[0][1]='OMN-2425')),/reviewed raw land contacts/);
 assert.throws(()=>applyApprovedAdjacentGameplayRegions(base,original,changed(p=>p.regions[0].sources.push(p.regions[0].sources[0]))),/duplicate or changed approved adjacent group/);
});
