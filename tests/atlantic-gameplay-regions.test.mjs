import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import test from 'node:test';
import {applyReviewedStateIslands} from '../scripts/apply-reviewed-state-islands.mjs';
import {MAP,MAP_METADATA,PREPROCESSED_TOPOLOGY,SOURCE_MAP,SOURCE_TOPOLOGY,provinceAt,provinceByCode,searchProvinces} from '../src/game/map.ts';
import {MAP_ID,RULES_ID,STATE_VERSION} from '../src/game/content.ts';
import {SAVE_PREFIX} from '../src/game/save.ts';
import {terrainAt} from '../src/game/terrain-navigation.ts';
import atlas from '../src/generated/world.js';
import plan from '../data/atlantic-gameplay-regions.json' with {type:'json'};
import {finalRegionCount,finalPlayableCount} from './reviewed-ocean-fixtures.mjs';

const readGzip=name=>JSON.parse(gunzipSync(readFileSync(new URL('../data/'+name+'.json.gz',import.meta.url))));
const base=readGzip('natural-earth-admin1-base');
const reference=readGzip('state-regions-1.13.7');
const states=new Map(reference.provinces.map(row=>[row.code,row.name]));
const source=new Map(SOURCE_MAP.map(atom=>[atom.code,atom]));
const raw=new Map(SOURCE_TOPOLOGY.atoms.map(atom=>[atom.id,atom.neighbors]));
const management=new Map(PREPROCESSED_TOPOLOGY.atoms.map(atom=>[atom.id,atom.neighbors]));
const provenance='victoria-3-reviewed-atlantic-region';
const opts={label:'Atlantic',reason:provenance};

test('the reviewed Atlantic selections have exact bilingual names, real anchors and every whole source region',()=>{
 const selected=new Set();
 for(const {stateCode,members,displayName,anchorAtomId,searchAliases=[]} of plan.regions){
  const atoms=Object.values(members).flat().sort();
  const region=MAP[provinceByCode(atoms[0])];
  assert.equal(displayName[1],states.get(stateCode)[1]);
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
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v25');
 assert.equal(STATE_VERSION,26);assert.equal(SAVE_PREFIX,'rouge.save.natural-earth-admin1.regions.v26.');
 assert.equal(RULES_ID,'admin1-locked-game-regions-v39');
});

test('Atlantic grouping reuses every original map atom without changing raw jurisdiction, shape or physical topology',()=>{
 assert.deepEqual(atlas.provinces.map(({code,sourceId,...atom})=>atom),base.provinces);
 const changed=atlas.gameplayGroups.filter(region=>region.reason===provenance);
 assert.equal(changed.length,plan.regions.length);
 for(const {islandAttachments=[]} of changed)for(const [a,b] of islandAttachments){
  assert.ok(!raw.get(a).includes(b)&&!raw.get(b).includes(a));
  assert.ok(management.get(a).includes(b)&&management.get(b).includes(a));
 }
});

test('Atlantic provenance rejects changed memberships, incorrect names and duplicate states',()=>{
 const row=plan.regions.find(r=>Object.keys(r.members).length>1)??plan.regions[0];
 const groups=Object.entries(row.members).map(([id,sourceIds])=>({id,sourceIds}));
 const single={schema:plan.schema,referenceVersion:plan.referenceVersion,regions:[row]};
 assert.ok(applyReviewedStateIslands(base,groups,single,reference,opts).length);
 const renamed=structuredClone(single);renamed.regions[0].displayName[1]+=' (fake)';
 assert.throws(()=>applyReviewedStateIslands(base,groups,renamed,reference,opts),/Invalid Atlantic/);
 const truncated=structuredClone(single);truncated.regions[0].members[row.primary].pop();
 assert.throws(()=>applyReviewedStateIslands(base,groups,truncated,reference,opts),/Atlantic membership/);
 const duplicated={...single,regions:[row,row]};
 assert.throws(()=>applyReviewedStateIslands(base,groups,duplicated,reference,opts),/Invalid Atlantic/);
});

test('selected Atlantic scope never absorbs the retained remote islands or mainland polygon fragments',()=>{
 const get=code=>MAP[provinceByCode(code)];
 assert.deepEqual(get('AIA+99?').name,['西印度群岛','West Indies']);
 for(const atom of ['VEN-48','TTO-50','VIR-4868','NLD-5147'])
  assert.equal(get(atom),get('AIA+99?'),atom);
 assert.notEqual(get('VEN-44'),get('AIA+99?'));
 assert.equal(get('TCA-5003'),get('BHS-5009'));
 assert.equal(get('CYM+00?'),get('JAM-1370'));
 assert.equal(get('SPM-4866'),get('CAN-686'));
 assert.equal(get('STP-4861'),get('GNQ-1478'));
 assert.equal(get('SGS+00?'),get('FLK-5152'));
 assert.notEqual(get('SHN-4865'),get('FLK-5152'));
 assert.notEqual(get('GRL-2738'),get('GRL-2739'));
 assert.equal(get('GRL-2738').playable,false);
 assert.equal(plan.regions.reduce((n,row)=>n+Object.keys(row.members).length-1,0),35);
});
