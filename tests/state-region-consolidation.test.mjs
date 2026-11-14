import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {consolidateStateRegions,applyCurrentStateMergers} from '../scripts/apply-state-region-consolidation.mjs';
import {MAP,SOURCE_MAP,provinceByCode,provinceAt,searchProvinces,PLAYABLE_COUNT,INITIAL_TERRITORY_GROUPING} from '../src/game/map.ts';
import decisions from '../data/state-region-consolidation.json' with {type:'json'};
import currentDecisions from '../data/state-region-1.15.1-overrides.json' with {type:'json'};
import audit from '../data/admin1-overlap-audit.json' with {type:'json'};
const readGzip=name=>JSON.parse(gunzipSync(readFileSync(new URL('../data/'+name+'.json.gz',import.meta.url))));
const base=readGzip('natural-earth-admin1-base');
const partition=readGzip('gameplay-region-partition').groups;
const original=new Map(partition.map(g=>[g.id,g]));
const readOriginal=id=>original.get(id).sourceIds;
const source=new Map(SOURCE_MAP.map(p=>[p.code,p]));

test('audited state-region consolidation merges eight whole adjacent groups without touching other members',()=>{
 assert.equal(decisions.merges.length,8);
 const updated=consolidateStateRegions(base,partition,decisions);
 const expected=new Map();
 const touched=new Set();
 for(const {primary,fragment,stateId,fragmentTargetShare,fragmentRunnerUpShare,primaryIoUBefore,consolidatedIoUAfter} of decisions.merges){
  assert.equal(original.get(primary).legacyHint,stateId);
  assert.equal(original.get(fragment).legacyHint,stateId);
  assert.ok(fragmentTargetShare>=.25 && fragmentTargetShare-fragmentRunnerUpShare>=.20);
  assert.ok(primaryIoUBefore-consolidatedIoUAfter<=.02);
  const ids=expected.get(primary)??[...readOriginal(primary)];
  ids.push(...readOriginal(fragment));expected.set(primary,ids);touched.add(primary);touched.add(fragment);
 }
 assert.equal(updated.length,partition.length-8);
 const after=new Map(updated.map(g=>[g.id,g]));
 for(const group of partition)if(!touched.has(group.id))assert.deepEqual(after.get(group.id),group);
 for(const members of expected.values()){
  const primary=MAP[provinceByCode(members[0])];
  assert.equal(primary.locked,true);
  assert.deepEqual(primary.sourceAtoms,[...members].sort());
  for(const id of members){const atom=source.get(id);assert.equal(provinceByCode(id),primary.id);if(atom.playable)assert.equal(provinceAt(atom.center.x,atom.center.z),primary.id);}
 }
 assert.throws(()=>consolidateStateRegions(base,partition,{...decisions,merges:[...decisions.merges,decisions.merges[0]]}),/invalid primary, fragment, or state/);
});

test('selectable land across an unconnected border cannot be joined via a stale state hint',()=>{
 const raw={provinces:[{id:'A',country:'X',neighbors:[]},{id:'B',country:'X',neighbors:[]}]};
 const groups=[{id:'group:A',sourceIds:['A'],legacyHint:7},{id:'group:B',sourceIds:['B'],legacyHint:7}];
 const plan={schema:1,merges:[{primary:'group:A',fragment:'group:B',stateId:7}]};
 assert.throws(()=>consolidateStateRegions(raw,groups,plan), /touching same-country land/);
 raw.provinces[0].neighbors=[1];raw.provinces[1].neighbors=[0];raw.provinces[1].country='Y';
 assert.throws(()=>consolidateStateRegions(raw,groups,plan), /touching same-country land/);
});


test('1.15.1 reunites whole adjacent Chukotka and Kamchatka only, preserving all other groups', () => {
 const prior = consolidateStateRegions(base,partition,decisions);
 const updated = applyCurrentStateMergers(base,prior,currentDecisions,audit);
 const expectedAtoms = ['RUS-2321','RUS-3468'];
 const after = new Map(updated.map(g => [g.id,g]));
 assert.equal(updated.length,prior.length-1);
 for(const group of prior) {
  if(group.id === 'group:RUS-2321' || group.id === 'group:RUS-3468') continue;
  assert.deepEqual(after.get(group.id),group);
 }
 const complete = after.get('group:RUS-2321');
 assert.deepEqual(complete.sourceIds,expectedAtoms);
 assert.deepEqual(complete.displayName,['堪察加','Kamchatka']);
 assert.equal(after.has('group:RUS-3468'),false);
 assert.equal(PLAYABLE_COUNT,1149);
 const id = provinceByCode('RUS-3468');
 const region = MAP[id];
 assert.deepEqual(region.sourceAtoms,expectedAtoms);
 assert.deepEqual(region.name,complete.displayName);
 assert.equal(region.locked,true);
 assert.equal(INITIAL_TERRITORY_GROUPING.groups.filter(g => g.atoms.includes(region.code)).length,1);
 assert.ok(searchProvinces('RUS-2321').some(p=>p.id===id));
 assert.ok(searchProvinces('Kamchatka').some(p=>p.id===id));
 for(const code of expectedAtoms) {
  const {center} = source.get(code);
  assert.equal(provinceAt(center.x,center.z),id);
  assert.equal(provinceByCode(code),id);
 }
});

test('current reference mergers reject key, atom membership and contact drift', () => {
 const groups = consolidateStateRegions(base,partition,decisions);
 const [merge] = currentDecisions.merges;
 const withMerge = patch => ({...currentDecisions,merges:[{...merge,...patch}]});
 for(const patch of [{removedState:'STATE_GALICH'},{fragmentSourceIds:['RUS-2602']},{primaryStateId:576}]) {
  assert.throws(()=>applyCurrentStateMergers(base,groups,withMerge(patch),audit), /invalid primary, fragment, or state/);
 }
 const noContact = {...base,provinces:base.provinces.map(p=>p.id==='RUS-2321'?{...p,neighbors:[]}:p)};
 assert.throws(()=>applyCurrentStateMergers(noContact,groups,currentDecisions,audit),/touching same-country land/);
});
