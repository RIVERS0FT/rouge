import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {consolidateStateRegions} from '../scripts/apply-state-region-consolidation.mjs';
import {MAP,SOURCE_MAP,provinceByCode,provinceAt} from '../src/game/map.ts';
import decisions from '../data/state-region-consolidation.json' with {type:'json'};
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
