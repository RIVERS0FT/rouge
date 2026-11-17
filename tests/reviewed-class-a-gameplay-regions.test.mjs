import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {MAP,MAP_METADATA,PREPROCESSED_TOPOLOGY,SOURCE_MAP,SOURCE_TOPOLOGY,provinceAt,provinceByCode,searchProvinces} from '../src/game/map.ts';
import {MAP_ID,RULES_ID,STATE_VERSION} from '../src/game/content.ts';
import {SAVE_PREFIX} from '../src/game/save.ts';
import {terrainAt,terrainSegment} from '../src/game/terrain-navigation.ts';
import atlas from '../src/generated/world.js';
import plan from '../data/reviewed-class-a-gameplay-regions.json' with {type:'json'};
import {correctedAnchor} from './reviewed-ocean-fixtures.mjs';

const base=JSON.parse(gunzipSync(readFileSync(new URL('../data/natural-earth-admin1-base.json.gz',import.meta.url))));
const source=new Map(SOURCE_MAP.map(atom=>[atom.code,atom]));
const raw=new Map(SOURCE_TOPOLOGY.atoms.map(atom=>[atom.id,atom.neighbors]));
const management=new Map(PREPROCESSED_TOPOLOGY.atoms.map(atom=>[atom.id,atom.neighbors]));
const find=code=>MAP[provinceByCode(code)];

test('A-page approval transfers precisely 63 groups into 50 existing labels and land anchors',()=>{
 const receivers=new Set(),atomsReviewed=new Set(),caseIds=new Set();
 let removed=0;
 for(const row of plan.regions){
  assert.match(row.auditCase,/^multi:STATE_/);
  assert.ok(!caseIds.has(row.auditCase));caseIds.add(row.auditCase);
  const target=find(row.anchorAtomId);
  const atoms=[...row.targetSourceIds,...row.sources.flatMap(s=>s.sourceIds)].sort();
  assert.ok(!receivers.has(target.id));receivers.add(target.id);
  assert.deepEqual(target.sourceAtoms,atoms);
  assert.deepEqual(target.name,row.displayName);
  assert.deepEqual(target.center,source.get(correctedAnchor(row.anchorAtomId)).center);
  assert.ok(target.playable&&target.locked&&terrainAt(target.center,true)>=0);
  for(const id of atoms){
   assert.ok(!atomsReviewed.has(id));atomsReviewed.add(id);
   const prior=source.get(id);
   assert.equal(find(id),target);
   assert.ok(prior.parts.every(part=>target.parts.includes(part)),id);
   if(prior.playable)assert.equal(provinceAt(prior.center.x,prior.center.z),target.id,id);
  }
  for(const {group,aliases,sourceIds} of row.sources){
   for(const q of [group,...aliases,...sourceIds])assert.ok(searchProvinces(q,MAP.length).some(r=>r.id===target.id),q);
   removed++;
  }
 }
 assert.equal(receivers.size,50);assert.equal(removed,63);assert.equal(atomsReviewed.size,795);
 assert.equal(MAP_METADATA.count,687);assert.equal(MAP_METADATA.playableCount,683);
 assert.equal(MAP_METADATA.sourceAtomCount,4596);
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v28');
 assert.equal(STATE_VERSION,29);assert.equal(SAVE_PREFIX,'rouge.save.natural-earth-admin1.regions.v29.');
 assert.equal(RULES_ID,'admin1-locked-game-regions-v44');
});

test('approved disconnected fragments share game ownership only, not terrain or physical routes',()=>{
 assert.deepEqual(atlas.provinces.map(({code,sourceId,...atom})=>atom),base.provinces);
 let links=0,receivers=0;
 for(const row of plan.regions){
  if(row.expectedNewIslandAttachments.length)receivers++;
  for(const [a,b] of row.expectedNewIslandAttachments){
   links++;
   assert.ok(management.get(a).includes(b)&&management.get(b).includes(a));
   assert.ok(!raw.get(a).includes(b)&&!raw.get(b).includes(a));
  }
 }
 assert.equal(links,27);assert.equal(receivers,22);
 for(const [a,b] of [['ECU-1270','ECU-1288'],['GGY+00?','GBR-2048'],['SYC-5197','MUS-5190']]){
  assert.equal(find(a),find(b));
  assert.equal(terrainSegment(source.get(a).center,source.get(b).center,false),false);
 }
});

test('historical fixtures reconstruct the exact preceding reviewed atlas',()=>{
 const prior=JSON.parse(readFileSync(new URL('../src/generated/gameplay-groups-before-class-a.json',import.meta.url),'utf8'));
 const reconstructed=JSON.stringify({...atlas,gameplayGroups:prior});
 assert.equal(createHash('sha256').update(reconstructed).digest('hex'),plan.baseline.atlasSha256);
});
