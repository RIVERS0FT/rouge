import {usePreClassAMapFixture} from './pre-class-a-map-fixture.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {applyReviewedStateIslands} from '../scripts/apply-reviewed-state-islands.mjs';
import plan from '../data/africa-gameplay-regions.json' with {type:'json'};
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
const provenance='victoria-3-reviewed-africa-region';
const opts={label:'Africa',reason:provenance,allowNewAttachments:false};

test('the reviewed Africa selections have exact bilingual names, real anchors and every whole source region',()=>{
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
 assert.equal(STATE_VERSION,29);assert.equal(SAVE_PREFIX,'rouge.save.natural-earth-admin1.regions.v29.');
 assert.equal(RULES_ID,'admin1-locked-game-regions-v44');
});

test('Africa grouping reuses every original map atom without changing raw jurisdiction, shape or physical topology',()=>{
 assert.deepEqual(atlas.provinces.map(({code,sourceId,...atom})=>atom),base.provinces);
 const changed=atlas.gameplayGroups.filter(region=>region.reason===provenance);
 assert.equal(changed.length,plan.regions.length);
 for(const {islandAttachments=[]} of changed)for(const [a,b] of islandAttachments){
  assert.ok(!raw.get(a).includes(b)&&!raw.get(b).includes(a));
  assert.ok(management.get(a).includes(b)&&management.get(b).includes(a));
 }
});

test('Africa provenance rejects changed memberships, incorrect names and duplicate states',()=>{
 const row=plan.regions.find(r=>Object.keys(r.members).length>1)??plan.regions[0];
 const groups=Object.entries(row.members).map(([id,sourceIds])=>({id,sourceIds}));
 const single={schema:plan.schema,referenceVersion:plan.referenceVersion,regions:[row]};
 assert.ok(applyReviewedStateIslands(base,groups,single,reference,opts).length);
 const renamed=structuredClone(single);renamed.regions[0].displayName[1]+=' (fake)';
 assert.throws(()=>applyReviewedStateIslands(base,groups,renamed,reference,opts),/Invalid Africa/);
 const truncated=structuredClone(single);truncated.regions[0].members[row.primary].pop();
 assert.throws(()=>applyReviewedStateIslands(base,groups,truncated,reference,opts),/Africa membership/);
 const duplicated={...single,regions:[row,row]};
 assert.throws(()=>applyReviewedStateIslands(base,groups,duplicated,reference,opts),/Invalid Africa/);
});

test('reviewed African grouping leaves approved coastal island regions and protected remote areas unchanged',()=>{
 const get=code=>MAP[provinceByCode(code)];
 for(const [ids,names] of [
   [['CMR-1476','STP-4861','GNQ-1478'],['南喀麦隆','South Cameroon']],
   [['MUS-5180','FRA-4601'],['印度洋领地','Indian Ocean Territory']],
   [['MDG-5860'],['北马达加斯加','North Madagascar']],
   [['COM-4934','MDG-5861','FRA-4602'],['南马达加斯加','South Madagascar']],
   [['CPV-5041'],['佛得角','Cape Verde']],
   [['TZA-3337','TZA-3380'],['桑给巴尔','Zanzibar']],
 ])for(const id of ids)assert.deepEqual(get(id).name,names,id);
 assert.notEqual(get('GRL-2738'),get('GRL-2739'));
 assert.equal(get('GRL-2738').playable,false);
});

test('whole-group continental unions cannot introduce a new administrative sea crossing',()=>{
 const row={stateCode:'STATE_TEST',primary:'group:A',members:{'group:A':['A'],'group:B':['B']},displayName:['测试','Test'],anchorAtomId:'A'};
 const fake={provinces:[{id:'A',neighbors:[]},{id:'B',neighbors:[]}]};
 const groups=Object.entries(row.members).map(([id,sourceIds])=>({id,sourceIds}));
 const ref={sourceVersion:'1.13.7',provinces:[{code:row.stateCode,name:row.displayName}]};
 const plan={schema:1,referenceVersion:'1.13.7',regions:[row]};
 assert.throws(()=>applyReviewedStateIslands(fake,groups,plan,ref,opts),/Africa merge requires connected land/);
 fake.provinces[0].neighbors=[1];
 fake.provinces[1].neighbors=[0];
 const [merged]=applyReviewedStateIslands(fake,groups,plan,ref,opts);
 assert.deepEqual(merged.sourceIds,['A','B']);assert.equal(merged.islandAttachments,undefined);
});

test('fixed reference labels have Chinese localization and renamed states can still be found',()=>{
 const get=code=>MAP[provinceByCode(code)];
 const gold=plan.regions.find(r=>r.stateCode==='STATE_GOLD_COAST');
 assert.deepEqual(get(gold.anchorAtomId).name,['黄金海岸','Gold Coast']);
 const congo=plan.regions.find(r=>r.stateCode==='STATE_CONGO_ORIENTALE');
 const group=get(congo.anchorAtomId);
 assert.deepEqual(group.name,['东刚果','Congo Orientale']);
 for(const q of ['卢阿拉巴','Lualaba'])assert.ok(searchProvinces(q,MAP.length).some(r=>r.id===group.id),q);
});
