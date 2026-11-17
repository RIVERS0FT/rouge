import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {applyAdministrativeGroupOverrides} from '../scripts/apply-state-region-consolidation.mjs';
import overrides from '../data/administrative-region-overrides.json' with {type:'json'};
import test from 'node:test';
import {MAP,provinceByCode,searchProvinces} from '../src/game/map.ts';
import {MAP_ID,STATE_VERSION} from '../src/game/content.ts';

test('the 20 locked Bhutan source districts are preserved and find their new receiving gameplay region',()=>{
 const readGzip=name=>JSON.parse(gunzipSync(readFileSync(new URL('../data/'+name+'.json.gz',import.meta.url))));
 const baseline=readGzip('gameplay-region-partition').groups;
 const base=readGzip('natural-earth-admin1-base');
 const previous=applyAdministrativeGroupOverrides(base,baseline,{schema:1,merges:[],names:overrides.names})
  .find(group=>group.id==='group:BTN-2433');
 assert.deepEqual(previous.displayName,['不丹','Bhutan']);
 assert.equal(previous.sourceIds.length,20);
 const bhutan=MAP[provinceByCode('BTN-2433')];
 assert.equal(bhutan,MAP[provinceByCode('IND-3299')]);
 assert.deepEqual(bhutan.name,['阿鲁纳恰尔邦','Arunachal Pradesh']);
 assert.equal(bhutan.playable,true);
 assert.equal(bhutan.locked,true);
 assert.deepEqual(bhutan.sourceAtoms.filter(id=>id.startsWith('BTN-')),previous.sourceIds);
 for(const member of bhutan.sourceAtoms)assert.equal(provinceByCode(member),bhutan.id);
 for(const q of ['不丹','Bhutan','加萨宗','Gasa','廷布宗','Thimphu']){
  assert.ok(searchProvinces(q).some(p=>p.id===bhutan.id),q);
 }
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v27');
 assert.equal(STATE_VERSION,28);
});
