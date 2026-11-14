import test from 'node:test';
import assert from 'node:assert/strict';
import {KINDS,UNITS,TALENTS,stats,talentApplies,validateSetup} from '../src/game/content.ts';
import {createGame,Engine} from '../src/game/engine.ts';
import {encodeSave,decodeSave,checksum,validateState} from '../src/game/save.ts';
import {encodeFrame,applyFrame} from '../src/platform/replication.ts';
import {regionCapacity,regionProductionRate,reconcileGrouping} from '../src/game/territoryEconomy.ts';
import {MAP,provinceByCode,SOURCE_MAP,STARTS} from '../src/game/map.ts';
const NEW=['skirmisher','grenadier','heavyCavalry','horseArtillery'];
const setup=k=>({name:k,leader:'steward',loadout:[k]});
const fresh=k=>new Engine(createGame([setup(k),setup('infantry')],42));
for(const kind of NEW)test(kind+': single-choice campaign, production, upgrades, save and replication',()=>{
 assert.ok(validateSetup(setup(kind)));assert.equal(validateSetup({...setup(kind),loadout:[kind,'infantry']}),false);
 const e=fresh(kind),p=e.state.players[0],home=e.state.provinces.find(v=>v.owner===0).id;
 assert.ok(e.state.units.filter(u=>u.owner===0).every(u=>u.kind===kind));
 assert.ok(e.state.provinces.filter(p=>p.owner===0).every(p=>p.kind===kind));
 const wounded=e.state.units.find(u=>u.owner===0);wounded.hp/=2;
 assert.ok(e.command(0,{type:'upgrade',kind,stat:'health'}).ok);
 assert.equal(wounded.hp/stats(p,kind).hp,.5);
 const count=e.state.units.filter(u=>u.owner===0).length;
 const queue=e.state.provinces.find(v=>v.owner===0&&e.state.units.filter(u=>u.owner===0&&u.province===v.id).length<regionCapacity(v.id));assert.ok(queue);queue.production=UNITS[kind].train-.025*regionProductionRate(queue.id);e.step();
 assert.ok(e.state.units.filter(u=>u.owner===0).length>count);
 assert.ok(validateState(e.state));
 const restored=decodeSave(encodeSave(e.state,'roster')).state;assert.deepEqual(restored,e.state);
 const {frame,base}=encodeFrame(e.state,undefined,0);let replica=applyFrame(null,frame);
 e.step();replica=applyFrame(replica,encodeFrame(e.state,base,0).frame);assert.deepEqual(replica,e.state);
 assert.equal(e.command(0,{type:'production',province:home,kind:'infantry'}).ok,false);
});
test('family-specific talent offers and bonuses work for both original and new members',()=>{
 for(const [talent,family]of [['charge',['cavalry','heavyCavalry']],['barrage',['artillery','horseArtillery']],['sappers',['engineer']]]){
  const definition=TALENTS.find(t=>t.id===talent);
  for(const k of KINDS){
   assert.equal(talentApplies(definition,[k]),family.includes(k));
   const p=fresh(k).state.players[0];p.talents=[talent];
   const expected=(talent!=='sappers'&&family.includes(k))?1.25:1;
   assert.equal(stats(p,k).attack,UNITS[k].attack*expected);
  }
 }
});
test('old four-kind saves and old multi-kind loadouts are rejected without migration',()=>{
 const s=fresh('infantry').state;
 const wrap=state=>{const body=JSON.stringify(state);return JSON.stringify({version:1,name:'old',savedAt:new Date().toISOString(),hash:checksum(body),body});};
 const old=structuredClone(s);for(const p of old.players)for(const k of NEW)delete p.upgrades[k];
 assert.equal(validateState(old),false);assert.throws(()=>decodeSave(wrap(old)),/invalidSave/);
 const multi=structuredClone(s);multi.players[0].loadout.push('artillery');
 assert.equal(validateState(multi),false);assert.throws(()=>decodeSave(wrap(multi)),/invalidSave/);
});
test('every new kind can capture without engineer bonuses and AI can upgrade its own kind',()=>{
 for(const k of NEW){
  const e=fresh(k),s=e.state,p=s.players[0],target=MAP.find(r=>r.playable&&s.provinces[r.id].owner===-1).id;
  const u=s.units.find(u=>u.owner===0);Object.assign(u,{province:target,origin:target,x:MAP[target].center.x,z:MAP[target].center.z});s.units=[u];
  e.step(20);assert.ok(Math.abs(s.provinces[target].capture-1)<1e-8);
  e.step(141);assert.equal(s.provinces[target].owner,0);assert.equal(s.provinces[target].kind,k);
  p.ai=true;p.funds=1000;e.step(80);assert.ok(Object.values(p.upgrades[k]).some(x=>x>0));
 }
});
for(const kind of NEW)test(kind+': real sea transport, landing and occupation preserve kind and valid save',()=>{
 const e=fresh(kind),s=e.state,from=MAP[provinceByCode('GBR-3409')].id,to=MAP[provinceByCode('FRA-5275')].id;
 for(const p of s.provinces){p.owner=-1;p.production=0;}
 s.provinces[from].owner=0;s.provinces[from].kind=kind;s.provinces[to].owner=1;s.provinces[to].kind='infantry';
 const u=s.units.find(u=>u.owner===0);Object.assign(u,{province:from,origin:from,x:MAP[from].center.x,z:MAP[from].center.z});s.units=[u];s.grouping=reconcileGrouping(s);
 assert.ok(e.command(0,{type:'march',from,to,fraction:1}).ok);
 let sailed=false;
 for(let i=0;i<3000&&s.provinces[to].owner!==0;i++){e.step();if(u.transport?.embarked){sailed=true;assert.ok(validateState(s));}}
 assert.ok(sailed);assert.equal(s.provinces[to].owner,0);assert.equal(u.kind,kind);assert.equal(s.provinces[to].kind,kind);assert.ok(validateState(s));
});
