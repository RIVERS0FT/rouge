import test from 'node:test';
import assert from 'node:assert/strict';
import {UNITS,UNIT_ATTRIBUTES,stats,KINDS} from '../src/game/content.ts';
import {STRINGS} from '../src/ui/i18n.ts';
const expected={
 infantry:[100,14,10,1,0,3.1,14,2.4,3],
 cavalry:[120,24,15,.8,0,1.8,22,4,3],
 artillery:[80,40,0,.5,1.2,7.2,28,1.8,3],
 engineer:[100,12,10,1,0,2.6,18,2.5,3],
 skirmisher:[75,12,0,1,0,4.6,18,3,3],
 grenadier:[130,18,20,.8,.7,2.3,24,2.2,3],
 heavyCavalry:[155,30,25,.65,0,1.6,32,3.4,3],
 horseArtillery:[70,28,0,.55,.8,5.8,30,2.8,3],
};
for(const kind of KINDS)test(`${kind} defines all nine approved base attributes`,()=>{
 assert.equal(UNIT_ATTRIBUTES.length,9);
 assert.deepEqual(UNIT_ATTRIBUTES.map(key=>UNITS[kind][key]),expected[kind]);
 assert.deepEqual(stats(undefined,kind),UNITS[kind]);
});
test('upgrades and talents modify health, attack and land speed but not transport or base training',()=>{
 const player={leader:'vanguard',talents:['veterans','charge','barrage','forcedMarch','industry','logistics'],upgrades:Object.fromEntries(KINDS.map(k=>[k,{attack:2,health:3,speed:4}]))};
 for(const kind of KINDS){
  const result=stats(player,kind),base=UNITS[kind];
  assert.equal(result.hp,base.hp+36);
  assert.equal(result.attack,(base.attack+4)*1.12*(['cavalry','heavyCavalry','artillery','horseArtillery'].includes(kind)?1.25:1));
  assert.equal(result.speed,(base.speed+.64)*1.12*1.2);
  for(const key of ['defense','attackSpeed','splash','range','train','seaSpeed'])assert.equal(result[key],base[key]);
 }
});
test('all nine attributes and their units have Chinese and English labels',()=>{
 for(const key of [...UNIT_ATTRIBUTES.map(k=>`attribute.${k}`),'singleTarget','attacksPerSecond','gameSeconds','distancePerSecond','mapUnits','transportStatsHint']){
  assert.equal(STRINGS[key].length,2);assert.ok(STRINGS[key].every(v=>typeof v==='string'&&v.length>0));
 }
});
