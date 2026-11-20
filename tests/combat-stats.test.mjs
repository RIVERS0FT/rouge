import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {DT,UNITS,KINDS} from '../src/game/content.ts';
import {BALANCE} from '../src/game/balance.ts';
import {MAP,STARTS,provinceByCode} from '../src/game/map.ts';
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
/** Defense divisor of the infantry defender: one hit deals attack × 100 / ARMOR. */
const ARMOR=100+UNITS.infantry.defense;
function battle(kind='infantry') {
 const e=new Engine(createGame([{name:'Attacker',leader:'steward',loadout:[kind]},{name:'Defender',leader:'steward',loadout:['infantry']}],42));
 // Isolate combat arithmetic on clear ground, not inside the town houses.
 const s=e.state,province=provinceByCode('DEU-3487'),anchor=MAP[province].center,center={x:anchor.x,z:anchor.z+4};s.provinces[province].owner=-1;
 const unit=(id,owner,k,x=0,z=0)=>({id,owner,kind:k,x:center.x+x,z:center.z+z,hp:10000,province,origin:province,target:null,destination:null,route:[],cooldown:owner===0?0:1000});
 s.units=[unit(1,0,kind),unit(2,1,'infantry',1)];s.nextId=100;
 return {e,s,unit,attacker:s.units[0],defender:s.units[1]};
}
for(const kind of KINDS)test(`${kind}: single-hit attack, defense and multi-second rate`,()=>{
 const {e,defender}=battle(kind),hp=defender.hp,base=UNITS[kind];
 e.step(1);close(hp-defender.hp,base.attack*100/ARMOR);
 // Fractional rates preserve cooldown remainder; no wall-clock timing.
 e.step(199);close(hp-defender.hp,base.attack*100/ARMOR*Math.ceil(10*base.attackSpeed));
});
test('attack cooldown expires at exactly one interval measured in simulation seconds',()=>{
 for(const kind of ['infantry','cavalry','artillery','engineer']){
  const {e,defender}=battle(kind);e.step(1);const hp=defender.hp;
  e.step(Math.round(1/UNITS[kind].attackSpeed/DT)-1);close(defender.hp,hp);
  e.step(1);close(hp-defender.hp,UNITS[kind].attack*100/ARMOR);
 }
});
test('armor reduction precedes entrenchment; Warden is cosmetic',()=>{
 const {e,s,defender}=battle();s.players[1].leader='warden';s.players[1].talents=['entrenchment'];s.provinces[defender.province].owner=1;
 const hp=defender.hp;e.step(1);close(hp-defender.hp,UNITS.infantry.attack*100/ARMOR*(1-BALANCE.talents.entrenchment.damageReduction));
 const away=battle();away.s.players[1].leader='warden';away.s.players[1].talents=['entrenchment'];
 const awayHp=away.defender.hp;away.e.step(1);close(awayHp-away.defender.hp,UNITS.infantry.attack*100/ARMOR);
});
test('artillery splash chooses the nearest enemies up to the target count with stable id ties and no friendly fire',()=>{
 function fire(reverse){
  const {e,s,unit}=battle('artillery');
  // Primary at distance 1. Three secondaries tie at 0.5 from it; ids decide which fit the splash target count.
  s.units=[unit(1,0,'artillery'),unit(2,1,'infantry',1),unit(3,1,'infantry',1.5),unit(4,1,'infantry',1,.5),unit(5,1,'infantry',1,-.5),unit(6,1,'infantry',3),unit(7,0,'infantry',1.25)];
  s.units.find(u=>u.id===7).cooldown=1000;
  if(reverse)s.units.reverse();e.step(1);return new Map(s.units.map(u=>[u.id,10000-u.hp]));
 }
 const normal=fire(false),reversed=fire(true);
 for(const [id,damage]of normal)close(damage,reversed.get(id));
 close(normal.get(2),UNITS.artillery.attack*100/ARMOR);
 for(const [rank,id]of [3,4,5].entries())close(normal.get(id),rank<BALANCE.combat.splashTargets?UNITS.artillery.attack*BALANCE.combat.splashDamage*100/ARMOR:0);
 for(const id of [1,6,7])close(normal.get(id),0);
});
test('non-artillery attacks remain single target even with clustered enemies',()=>{
 const {e,s,unit}=battle('infantry');s.units.push(unit(3,1,'infantry',1,.1));e.step(1);
 close(10000-s.units.find(u=>u.id===2).hp,UNITS.infantry.attack*100/ARMOR);close(s.units.find(u=>u.id===3).hp,10000);
});
test('attack upgrades and Veteran cadres scale attack before conditional talent bonuses and armor',()=>{
 // Charge needs the attacker under orders; Siege guns needs a garrisoned target (the defender has no order).
 for(const [kind,talent,bonus,march]of [['cavalry','charge',BALANCE.talents.charge.damageBonus,true],['artillery','barrage',BALANCE.talents.barrage.damageBonus,false]]){
  const {e,s,attacker,defender}=battle(kind);s.players[0].talents=['veterans',talent];
  if(march)Object.assign(attacker,{target:attacker.province,destination:attacker.province});
  assert.equal(e.command(0,{type:'upgrade',kind,stat:'attack'}).ok,true);
  const hp=defender.hp;e.step(1);close(hp-defender.hp,(UNITS[kind].attack+BALANCE.upgrades.attackPerLevel)*BALANCE.talents.veterans.attack*(1+bonus)*100/ARMOR);
 }
});

test('combat stats reflect upgrades and talents changed between ticks',()=>{
 const {e,s,attacker,defender}=battle();e.step();const hp=defender.hp;
 assert.equal(e.command(0,{type:'upgrade',kind:'infantry',stat:'attack'}).ok,true);
 s.players[0].talents=['veterans'];
 attacker.cooldown=0;e.step();
 // The next shot uses the new attack and talent multiplier.
 close(hp-defender.hp,(UNITS.infantry.attack+BALANCE.upgrades.attackPerLevel)*BALANCE.talents.veterans.attack*100/ARMOR);
});
test('engineers keep their capture multiplier and existing multiplicative capture talents',()=>{
 function capture(kind,talents=[]){
  const {e,s,unit}=battle(kind),target=MAP.find(p=>p.playable&&s.provinces[p.id].owner===-1).id;
  const u=unit(1,0,kind);Object.assign(u,{x:MAP[target].center.x,z:MAP[target].center.z,province:target,origin:target});s.units=[u];s.players[0].talents=talents;
  e.step(20);return s.provinces[target].capture;
 }
 close(capture('infantry'),1);close(capture('engineer'),BALANCE.capture.engineerSpeed);close(capture('engineer',['conqueror','sappers']),BALANCE.capture.engineerSpeed*BALANCE.talents.conqueror.captureSpeed);
});

for(const kind of ['grenadier','horseArtillery'])test(kind+': bounded splash shares combat formula',()=>{
 const {e,s,unit}=battle(kind);s.units.push(unit(3,1,'infantry',1,.2),unit(4,1,'infantry',1,.3),unit(5,1,'infantry',1,.4));
 e.step();close(10000-s.units.find(u=>u.id===2).hp,UNITS[kind].attack/(ARMOR/100));
 // Three secondaries at 0.2, 0.3 and 0.4 from the target: the nearest splash target count are hit.
 for(const [rank,id]of [3,4,5].entries())close(10000-s.units.find(u=>u.id===id).hp,rank<BALANCE.combat.splashTargets?UNITS[kind].attack*BALANCE.combat.splashDamage/(ARMOR/100):0);
});
test('fractional attack rates do not drift over sixty game seconds',()=>{
 for(const kind of ['heavyCavalry','horseArtillery']){
  const {e,defender}=battle(kind);const hp=defender.hp;e.step(1200);
  close(hp-defender.hp,UNITS[kind].attack/(ARMOR/100)*Math.ceil(60*UNITS[kind].attackSpeed));
 }
});
