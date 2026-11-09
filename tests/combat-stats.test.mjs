import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {DT,UNITS,KINDS} from '../src/game/content.ts';
import {MAP,STARTS} from '../src/game/map.ts';
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
function battle(kind='infantry') {
 const e=new Engine(createGame([{name:'Attacker',leader:'steward',loadout:[kind]},{name:'Defender',leader:'steward',loadout:['infantry']}],42));
 const s=e.state,province=e.state.provinces.find(p=>p.owner===0).id,center=MAP[province].center;
 const unit=(id,owner,k,x=0,z=0)=>({id,owner,kind:k,x:center.x+x,z:center.z+z,hp:10000,province,origin:province,target:null,destination:null,route:[],cooldown:owner===0?0:1000});
 s.units=[unit(1,0,kind),unit(2,1,'infantry',1)];s.nextId=100;
 return {e,s,unit,attacker:s.units[0],defender:s.units[1]};
}
for(const kind of KINDS)test(`${kind}: single-hit attack, defense and multi-second rate`,()=>{
 const {e,defender}=battle(kind),hp=defender.hp,base=UNITS[kind];
 e.step(1);close(hp-defender.hp,base.attack*100/110);
 // Fractional rates preserve cooldown remainder; no wall-clock timing.
 e.step(199);close(hp-defender.hp,base.attack*100/110*Math.ceil(10*base.attackSpeed));
});
test('attack cooldown expires at exactly one interval measured in simulation seconds',()=>{
 for(const kind of ['infantry','cavalry','artillery','engineer']){
  const {e,defender}=battle(kind);e.step(1);const hp=defender.hp;
  e.step(Math.round(1/UNITS[kind].attackSpeed/DT)-1);close(defender.hp,hp);
  e.step(1);close(hp-defender.hp,UNITS[kind].attack*100/110);
 }
});
test('armor reduction precedes entrenchment; Warden is cosmetic',()=>{
 const {e,s,defender}=battle();s.players[1].leader='warden';s.players[1].talents=['entrenchment'];s.provinces[defender.province].owner=1;
 const hp=defender.hp;e.step(1);close(hp-defender.hp,14*100/110*.85);
 const away=battle();away.s.players[1].leader='warden';away.s.players[1].talents=['entrenchment'];
 const awayHp=away.defender.hp;away.e.step(1);close(awayHp-away.defender.hp,14*100/110);
});
test('artillery splash chooses at most two nearest enemies with stable id ties and no friendly fire',()=>{
 function fire(reverse){
  const {e,s,unit}=battle('artillery');
  // Primary at distance 1. Secondary pair equidistant from it; a third tied enemy must be excluded.
  s.units=[unit(1,0,'artillery'),unit(2,1,'infantry',1),unit(3,1,'infantry',1.5),unit(4,1,'infantry',1,.5),unit(5,1,'infantry',1,-.5),unit(6,1,'infantry',3),unit(7,0,'infantry',1.25)];
  s.units.find(u=>u.id===7).cooldown=1000;
  if(reverse)s.units.reverse();e.step(1);return new Map(s.units.map(u=>[u.id,10000-u.hp]));
 }
 const normal=fire(false),reversed=fire(true);
 for(const [id,damage]of normal)close(damage,reversed.get(id));
 close(normal.get(2),40*100/110);close(normal.get(3),40*.35*100/110);close(normal.get(4),40*.35*100/110);
 for(const id of [1,5,6,7])close(normal.get(id),0);
});
test('non-artillery attacks remain single target even with clustered enemies',()=>{
 const {e,s,unit}=battle('infantry');s.units.push(unit(3,1,'infantry',1,.1));e.step(1);
 close(10000-s.units.find(u=>u.id===2).hp,14*100/110);close(s.units.find(u=>u.id===3).hp,10000);
});
test('attack upgrade and unit talents retain multipliers before defender armor',()=>{
 for(const [kind,talent]of [['cavalry','charge'],['heavyCavalry','charge'],['artillery','barrage'],['horseArtillery','barrage']]){
  const {e,s,defender}=battle(kind);s.players[0].talents=['veterans',talent];
  assert.equal(e.command(0,{type:'upgrade',kind,stat:'attack'}).ok,true);
  const hp=defender.hp;e.step(1);close(hp-defender.hp,(UNITS[kind].attack+2)*1.12*1.25*100/110);
 }
});
test('engineers keep 1.5 capture multiplier and existing multiplicative capture talents',()=>{
 function capture(kind,talents=[]){
  const {e,s,unit}=battle(kind),target=MAP.find(p=>p.playable&&s.provinces[p.id].owner===-1).id;
  const u=unit(1,0,kind);Object.assign(u,{x:MAP[target].center.x,z:MAP[target].center.z,province:target,origin:target});s.units=[u];s.players[0].talents=talents;
  e.step(20);return s.provinces[target].capture;
 }
 close(capture('infantry'),1);close(capture('engineer'),1.5);close(capture('engineer',['conqueror','sappers']),1.5*1.3*1.3);
});

for(const kind of ['grenadier','horseArtillery'])test(kind+': bounded splash shares combat formula',()=>{
 const {e,s,unit}=battle(kind);s.units.push(unit(3,1,'infantry',1,.2),unit(4,1,'infantry',1,.3),unit(5,1,'infantry',1,.4));
 e.step();close(10000-s.units.find(u=>u.id===2).hp,UNITS[kind].attack/1.1);
 for(const id of [3,4])close(10000-s.units.find(u=>u.id===id).hp,UNITS[kind].attack*.35/1.1);
 close(s.units.find(u=>u.id===5).hp,10000);
});
test('fractional attack rates do not drift over sixty game seconds',()=>{
 for(const kind of ['heavyCavalry','horseArtillery']){
  const {e,defender}=battle(kind);const hp=defender.hp;e.step(1200);
  close(hp-defender.hp,UNITS[kind].attack/1.1*Math.ceil(60*UNITS[kind].attackSpeed));
 }
});
