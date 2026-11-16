import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {MAP,MAP_METADATA,provinceByCode,searchProvinces} from '../src/game/map.ts';

const {names}=JSON.parse(readFileSync(new URL('../data/france-state-region-names.json',import.meta.url),'utf8'));
test('all 21 mainland French and Corsican state regions use the reviewed bilingual names',()=>{
  assert.equal(names.length,21);
  assert.equal(new Set(names.map(row=>row.id)).size,21);
  for(const row of names){
    const id=row.id.slice('group:'.length), region=MAP[provinceByCode(id)];
    assert.equal(region.code,id);
    assert.deepEqual(region.name,row.displayName);
    assert.deepEqual(region.sourceAtoms,row.atomIds);
    assert.equal(region.playable,true);
  }
  assert.equal(names.reduce((n,row)=>n+row.atomIds.length,0),96);
  assert.equal(MAP.length,1153);
  assert.equal(MAP_METADATA.mapId,'earth-natural-earth-admin1-511-regions-v5');
});

test('Paris and the old department labels still find Île-de-France',()=>{
  const paris=MAP[provinceByCode('FRA-5333')];
  assert.deepEqual(paris.name,['法兰西岛','Île-de-France']);
  for(const query of ['巴黎','Paris','塞纳-马恩省','法兰西岛','Île-de-France']){
    assert.ok(searchProvinces(query).some(region=>region.id===paris.id),query);
  }
});
