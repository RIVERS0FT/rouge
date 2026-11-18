import {usePreClassAMapFixture} from './pre-class-a-map-fixture.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {applyReviewedStateIslands} from '../scripts/apply-reviewed-state-islands.mjs';
import plan from '../data/north-america-gameplay-regions.json' with {type:'json'};
import {preClassARegionCount as finalRegionCount,preClassAPlayableCount as finalPlayableCount} from './reviewed-ocean-fixtures.mjs';

usePreClassAMapFixture();
const {MAP,MAP_METADATA,PREPROCESSED_TOPOLOGY,SOURCE_MAP,SOURCE_TOPOLOGY,provinceAt,provinceByCode,searchProvinces}=await import('../src/game/map.ts');
const {MAP_ID,RULES_ID,STATE_VERSION}=await import('../src/game/content.ts');
const {SAVE_PREFIX}=await import('../src/game/save.ts');
const {terrainAt}=await import('../src/game/terrain-navigation.ts');
const {default:atlas}=await import('../src/generated/world.js');

const readGzip=name=>JSON.parse(gunzipSync(readFileSync(new URL('../data/'+name+'.json.gz',import.meta.url))));
const base=readGzip('natural-earth-admin1-base');
const reference=readGzip('state-regions-1.13.7');
const states=new Map(reference.provinces.map(row=>[row.code,row.name]));
const source=new Map(SOURCE_MAP.map(atom=>[atom.code,atom]));
const raw=new Map(SOURCE_TOPOLOGY.atoms.map(atom=>[atom.id,atom.neighbors]));
const management=new Map(PREPROCESSED_TOPOLOGY.atoms.map(atom=>[atom.id,atom.neighbors]));
const provenance='victoria-3-reviewed-north-america-region';
const opts={label:'North America',reason:provenance,allowNewAttachments:false};

test('the reviewed North America selections have exact bilingual names, real anchors and every whole source region',()=>{
 const selected=new Set();
 for(const {stateCode,members,displayName,anchorAtomId,searchAliases=[]} of plan.regions){
  const atoms=Object.values(members).flat().sort();
  const region=MAP[provinceByCode(atoms[0])];
  assert.equal(displayName[1],states.get(stateCode)[1]);
  assert.match(displayName[0],/\p{Script=Han}/u,stateCode);
  assert.ok(!selected.has(region.id),stateCode);selected.add(region.id);
  assert.deepEqual(region.sourceAtoms,atoms,stateCode);
  assert.deepEqual(region.name,displayName,stateCode);
  assert.deepEqual(region.center,source.get(anchorAtomId).center,stateCode);
  assert.ok(region.locked&&region.playable&&terrainAt(region.center,true)>=0,stateCode);
  for(const id of atoms){
   const atom=source.get(id);
   assert.equal(provinceByCode(id),region.id,id);
   assert.ok(atom.parts.every(part=>region.parts.includes(part)),id);
   if(atom.playable)assert.equal(provinceAt(atom.center.x,atom.center.z),region.id,id);
  }
  for(const query of [...displayName,...searchAliases])
   assert.ok(searchProvinces(query,MAP.length).some(p=>p.id===region.id),query);
 }
 assert.equal(MAP_METADATA.count,finalRegionCount);
 assert.equal(MAP_METADATA.playableCount,finalPlayableCount);
 assert.equal(MAP_METADATA.sourceAtomCount,4596);
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v28');
 assert.equal(STATE_VERSION,30);assert.equal(SAVE_PREFIX,'rouge.save.natural-earth-admin1.regions.v30.');
 assert.equal(RULES_ID,'admin1-locked-game-regions-v45');
});

test('North America grouping reuses every original map atom without changing raw jurisdiction, shape or physical topology',()=>{
 assert.deepEqual(atlas.provinces.map(({code,sourceId,...atom})=>atom),base.provinces);
 const changed=atlas.gameplayGroups.filter(region=>region.reason===provenance);
 assert.equal(changed.length,plan.regions.length);
 for(const {islandAttachments=[]} of changed)for(const [a,b] of islandAttachments){
  assert.ok(!raw.get(a).includes(b)&&!raw.get(b).includes(a));
  assert.ok(management.get(a).includes(b)&&management.get(b).includes(a));
 }
});

test('North America provenance rejects changed memberships, incorrect names and duplicate states',()=>{
 const row=plan.regions.find(r=>Object.keys(r.members).length>1)??plan.regions[0];
 const groups=Object.entries(row.members).map(([id,sourceIds])=>({id,sourceIds}));
 const single={schema:plan.schema,referenceVersion:plan.referenceVersion,regions:[row]};
 assert.ok(applyReviewedStateIslands(base,groups,single,reference,opts).length);
 const renamed=structuredClone(single);renamed.regions[0].displayName[1]+=' (fake)';
 assert.throws(()=>applyReviewedStateIslands(base,groups,renamed,reference,opts),/Invalid North America/);
 const truncated=structuredClone(single);truncated.regions[0].members[row.primary].pop();
 assert.throws(()=>applyReviewedStateIslands(base,groups,truncated,reference,opts),/North America membership/);
 const duplicated={...single,regions:[row,row]};
 assert.throws(()=>applyReviewedStateIslands(base,groups,duplicated,reference,opts),/Invalid North America/);
});



test('North American grouping preserves previously reviewed Atlantic and Pacific groups',()=>{
 const find=code=>MAP[provinceByCode(code)];
 for(const [ids,name] of [
  [['USA-3517'],['夏威夷群岛','Hawaiian Islands']],
  [['CAN-686','SPM-4866'],['纽芬兰','Newfoundland']],
  [['BHS-5009','TCA-5003'],['巴哈马','Bahamas']],
  [['GRL-2742'],['格陵兰','Greenland']],
  [['BMU-5134'],['百慕大','Bermuda']],
  [['LCA-5077','VEN-48'],['西印度群岛','West Indies']],
 ]){
  const target=find(ids[0]);
  assert.deepEqual(target.name,name);
  assert.ok(ids.every(id=>find(id)===target));
 }
 assert.equal(find('GRL-2738').playable,false);
});

test('the three North American unions keep real group anchors, source geography and remote carveouts',()=>{
 const find=code=>MAP[provinceByCode(code)];
 for(const [ids,name,anchor,aliases] of [
  [['BLZ-1323','GTM-1942'],['危地马拉','Guatemala'],'GTM-1944',['Belize','伯利兹','British Honduras','英属洪都拉斯']],
  [['PAN-1332','PAN-1419'],['巴拿马','Panama'],'PAN-1340',['Guna Yala','Kuna Yala','古纳亚拉','雅拉库纳族自治区']],
  [['USA-3556','USA-3557'],['马里兰','Maryland'],'USA-3557',['华盛顿哥伦比亚特区','哥伦比亚特区','District of Columbia','Washington D.C.','D.C.']],
 ]){
  const target=find(ids[0]);
  assert.deepEqual(target.name,name);
  assert.deepEqual(target.center,source.get(anchor).center);
  assert.ok(ids.every(id=>find(id)===target));
  for(const alias of aliases)assert.ok(searchProvinces(alias,MAP.length).some(p=>p.id===target.id),alias);
 }
 for(const [a,b] of [['CAN-687','CAN-684'],['HND-641','HND-637']])
  assert.notEqual(find(a),find(b));
 assert.ok(raw.get('USA-3556').includes('USA-3557')&&raw.get('USA-3557').includes('USA-3556'));
 assert.notEqual(find('USA-3556'),find('USA-3519'));
 assert.equal(plan.regions.reduce((n,row)=>n+Object.keys(row.members).length-1,0),3);
});

test('newer North American spellings remain aliases for the pinned names',()=>{
 const find=code=>MAP[provinceByCode(code)];
 for(const [id,display,aliases] of [
  ['CAN-633',['不列颠哥伦比亚','British Columbia'],['北哥伦比亚','Northern Columbia']],
  ['USA-3519',['华盛顿州','Washington'],['南哥伦比亚','Southern Columbia']],
  ['CAN-684',['新不伦瑞克','New Brunswick'],['滨海','Maritimes']],
 ]){
  const group=find(id);
  assert.deepEqual(group.name,display);
  for(const query of aliases)assert.ok(searchProvinces(query,MAP.length).some(p=>p.id===group.id),query);
 }
});
