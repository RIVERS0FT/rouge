import assert from 'node:assert/strict';
import test from 'node:test';
import {MAP,provinceByCode,searchProvinces} from '../src/game/map.ts';
import {MAP_ID,STATE_VERSION} from '../src/game/content.ts';

test('the 20 locked Bhutan source districts share one bilingual gameplay name',()=>{
 const bhutan=MAP[provinceByCode('BTN-2433')];
 assert.deepEqual(bhutan.name,['不丹','Bhutan']);
 assert.equal(bhutan.playable,true);
 assert.equal(bhutan.locked,true);
 assert.equal(bhutan.sourceAtoms.length,20);
 for(const member of bhutan.sourceAtoms)assert.equal(provinceByCode(member),bhutan.id);
 for(const q of ['不丹','Bhutan','加萨宗','Gasa','廷布宗','Thimphu']){
  assert.ok(searchProvinces(q).some(p=>p.id===bhutan.id),q);
 }
 assert.equal(MAP_ID,'earth-natural-earth-admin1-511-regions-v13');
 assert.equal(STATE_VERSION,14);
});
