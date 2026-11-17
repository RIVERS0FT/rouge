import {usePreClassAMapFixture} from './pre-class-a-map-fixture.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {applyReviewedStateIslands} from '../scripts/apply-reviewed-state-islands.mjs';
import plan from '../data/south-america-gameplay-regions.json' with {type:'json'};
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
const provenance='victoria-3-reviewed-south-america-region';
const opts={label:'South America',reason:provenance,allowNewAttachments:false};

test('the reviewed South America selections have exact bilingual names, real anchors and every whole source region',()=>{
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
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v27');
 assert.equal(STATE_VERSION,28);assert.equal(SAVE_PREFIX,'rouge.save.natural-earth-admin1.regions.v28.');
 assert.equal(RULES_ID,'admin1-locked-game-regions-v41');
});

test('South America grouping reuses every original map atom without changing raw jurisdiction, shape or physical topology',()=>{
 assert.deepEqual(atlas.provinces.map(({code,sourceId,...atom})=>atom),base.provinces);
 const changed=atlas.gameplayGroups.filter(region=>region.reason===provenance);
 assert.equal(changed.length,plan.regions.length);
 for(const {islandAttachments=[]} of changed)for(const [a,b] of islandAttachments){
  assert.ok(!raw.get(a).includes(b)&&!raw.get(b).includes(a));
  assert.ok(management.get(a).includes(b)&&management.get(b).includes(a));
 }
});

test('South America provenance rejects changed memberships, incorrect names and duplicate states',()=>{
 const row=plan.regions.find(r=>Object.keys(r.members).length>1)??plan.regions[0];
 const groups=Object.entries(row.members).map(([id,sourceIds])=>({id,sourceIds}));
 const single={schema:plan.schema,referenceVersion:plan.referenceVersion,regions:[row]};
 assert.ok(applyReviewedStateIslands(base,groups,single,reference,opts).length);
 const renamed=structuredClone(single);renamed.regions[0].displayName[1]+=' (fake)';
 assert.throws(()=>applyReviewedStateIslands(base,groups,renamed,reference,opts),/Invalid South America/);
 const truncated=structuredClone(single);truncated.regions[0].members[row.primary].pop();
 assert.throws(()=>applyReviewedStateIslands(base,groups,truncated,reference,opts),/South America membership/);
 const duplicated={...single,regions:[row,row]};
 assert.throws(()=>applyReviewedStateIslands(base,groups,duplicated,reference,opts),/Invalid South America/);
});


test('South American grouping leaves existing Pacific and South Atlantic island decisions intact',()=>{
 const find=code=>MAP[provinceByCode(code)];
 for(const id of ['FLK-5152','SGS+00?','SHN-4863','SHN-4864'])
  assert.deepEqual(find(id).name,['南大西洋群岛','South Atlantic Islands'],id);
 assert.equal(find('FLK-5152'),find('SGS+00?'));
 assert.notEqual(find('SHN-4865'),find('FLK-5152'));
 assert.equal(find('AIA+99?'),find('VEN-48'));
 assert.deepEqual(find('VEN-48').name,['西印度群岛','West Indies']);
 assert.notEqual(find('VEN-44'),find('VEN-48'));
 for(const id of ['PCN+00?','PYF-4963'])
  assert.deepEqual(find(id).name,['塔希提','Tahiti'],id);
 assert.equal(find('GRL-2738').playable,false);
});

test('all four audited South American unions resolve with exact names while Galápagos remains separate',()=>{
 const find=code=>MAP[provinceByCode(code)];
 for(const [ids,name] of [
  [['ARG-1307','PRY-4837'],['上巴拉圭','Alto Paraguay']],
  [['ARG-1272','CHL-2691'],['阿劳卡尼亚','Araucania']],
  [['ARG-1295','ARG-5493'],['布宜诺斯艾利斯','Buenos Aires']],
  [['FRA-2000','GUY-671','SUR-37'],['圭亚那','Guayana']],
 ]){
  const target=find(ids[0]);
  assert.deepEqual(target.name,name);
  assert.ok(ids.every(id=>find(id)===target));
 }
 for(const q of ['Suriname','苏里南','French Guiana','法属圭亚那'])assert.ok(searchProvinces(q,MAP.length).some(r=>r.id===find('FRA-2000').id),q);
 const islands=find('ECU-1270');
 assert.equal(islands.code,'ECU-1270');
 assert.equal(islands.sourceAtoms.length,1);
 assert.equal(plan.regions.reduce((n,row)=>n+Object.keys(row.members).length-1,0),5);
});

test('newer English and Chinese state aliases still find the pinned state names',()=>{
 for(const [id,display,aliases] of [
  ['ARG-1298',['拉潘帕','La Pampa'],['科尔多瓦','Córdoba']],
  ['ARG-1275',['里奥内格罗','Rio Negro'],['门多萨','Mendoza']],
 ]){
  const group=MAP[provinceByCode(id)];
  assert.deepEqual(group.name,display);
  for(const q of aliases)assert.ok(searchProvinces(q,MAP.length).some(p=>p.id===group.id),q);
 }
});
