import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {DT,KINDS,TALENTS,UNITS,UNIT_FAMILY,stats} from '../src/game/content.ts';
import {captureReward,constructionCost,recoveryDuration,recoveryMultiplier} from '../src/game/construction.ts';
import {MAP} from '../src/game/map.ts';
import {availableTalentIds} from '../src/game/talentReroll.ts';
import {decodeSave,encodeSave} from '../src/game/save.ts';
import {STRINGS} from '../src/ui/i18n.ts';
import {incomePerSecond} from '../src/ui/hud/hudModel.ts';

const close=(value,want)=>assert.ok(Math.abs(value-want)<1e-8,`${value} != ${want}`);
function game(kind='infantry') {
 return new Engine(createGame([{name:'A',leader:'warden',loadout:[kind]},{name:'B',leader:'steward',loadout:['infantry']}],42));
}
function choose(e,id) {
 const p=e.state.players[0];
 p.level=Math.max(2,p.level);p.drafts=1;p.choices=[id];
 assert.deepEqual(e.command(0,{type:'talent',id}),{ok:true});
}
test('24 unique, translated talents; every starting unit sees only its own family plus 15 universal entries',()=>{
 assert.equal(TALENTS.length,24);assert.equal(new Set(TALENTS.map(t=>t.id)).size,24);
 assert.equal(TALENTS.filter(t=>!t.kind).length,15);
 for(const t of TALENTS)for(const key of [t.id,t.id+'.desc']){
  assert.equal(STRINGS[key]?.length,2,key);
  assert.ok(STRINGS[key].every(value=>value.trim().length),key);
 }
 for(const kind of KINDS){
  const eligible=availableTalentIds({loadout:[kind],talents:['industry']});
  assert.equal(eligible.length,UNIT_FAMILY[kind]==='engineer'?17:16,kind);
  for(const t of TALENTS)assert.equal(eligible.includes(t.id),t.id!=='industry'&&(!t.kind||UNIT_FAMILY[kind]===UNIT_FAMILY[t.kind]),`${kind}/${t.id}`);
 }
});
test('old unchanged offers load; reroll and all seven level drafts remain distinct and family-eligible',()=>{
 const old=game('skirmisher').state,oldOffers=['industry','conqueror','veterans'];
 Object.assign(old.players[0],{level:8,drafts:7,choices:oldOffers});
 const e=new Engine(decodeSave(encodeSave(old,'Existing save')).state),p=e.state.players[0];
 assert.deepEqual(p.choices,oldOffers);
 assert.deepEqual(e.command(0,{type:'reroll',expectedCost:90}),{ok:true});
 assert.equal(p.funds,94);
 assert.ok(p.choices.some(id=>!oldOffers.includes(id)));
 for(let i=0;i<7;i++){
  assert.equal(p.choices.length,3);
  assert.equal(new Set(p.choices).size,3);
  assert.ok(p.choices.every(id=>availableTalentIds(p).includes(id)));
  assert.deepEqual(e.command(0,{type:'talent',id:p.choices[0]}),{ok:true});
 }
 assert.equal(new Set(p.talents).size,7);
 assert.deepEqual(p.choices,[]);assert.equal(p.drafts,0);
 p.drafts=1;p.choices=['armoredSappers'];
 assert.deepEqual(e.command(0,{type:'talent',id:'armoredSappers'}),{ok:false,error:'invalidChoice'});
});
test('combat and transport modifiers affect real stats and are limited to the intended families',()=>{
 const p=game().state.players[0];
 p.talents=['fieldMedicine','protectiveGear','combatDrills','rangefinding','navalLogistics','shieldWall','forwardMarksmen',
  'lightSaddles','wideSalvo','armoredSappers','breachDrills'];
 for(const kind of KINDS){
  const st=stats(p,kind),b=UNITS[kind],family=UNIT_FAMILY[kind];
  close(st.hp,b.hp*1.15*(family==='infantry'?1.15:1));
  close(st.defense,b.defense+8+(family==='engineer'?12:0));
  close(st.attackSpeed,b.attackSpeed*1.12);
  close(st.range,b.range*1.1*(family==='infantry'?1.2:1));
  assert.ok(st.range<8,'the current combat bucket checks adjoining 8-unit cells');
  close(st.seaSpeed,b.seaSpeed*1.25);
  close(st.speed,b.speed*(family==='cavalry'?1.15:1));
  close(st.splash,b.splash*(family==='artillery'?1.25:1));
  close(st.attack,b.attack*(family==='engineer'?1.2:1));
 }
});
test('max health and attack speed talents update live troops without breaking v6 saves',()=>{
 const e=game(),s=e.state,p=s.players[0],u=s.units.find(u=>u.owner===0),other=s.units.find(u=>u.owner===1);
 u.hp/=2;u.cooldown=.99;const hp=other.hp;
 choose(e,'fieldMedicine');choose(e,'shieldWall');choose(e,'combatDrills');
 close(u.hp,stats(p,u.kind).hp*.5);
 close(u.cooldown,.99/1.12);assert.equal(other.hp,hp);
 assert.deepEqual(decodeSave(encodeSave(s,'Expanded talents')).state,s);
});
test('recurring funds and construction discounts match engine transactions and HUD quotes',()=>{
 const e=game(),s=e.state,p=s.players[0],home=s.provinces.find(province=>province.owner===0);
 choose(e,'taxReform');choose(e,'publicWorks');
 const initial=p.funds;
 assert.equal(constructionCost('market',0,p),45);
 assert.deepEqual(e.command(0,{type:'construct',province:home.id,kind:'market',expectedLevel:0}),{ok:true});
 assert.equal(p.funds,initial-45);
 assert.equal(constructionCost('market',1,p),66);
 assert.deepEqual(e.command(0,{type:'construct',province:home.id,kind:'market',expectedLevel:1}),{ok:true});
 assert.equal(p.funds,initial-111);
 const income=incomePerSecond(s,0);close(income,2.75*1.15);
 e.step();close(p.funds,initial-111+DT*income);
});
test('capture talents pay an extra 10 funds and shorten recovery without resetting current recovery progress',()=>{
 const e=game(),s=e.state,p=s.players[0],home=s.provinces.find(province=>province.owner===0);
 home.recovery=8;const initialRecoveryFraction=recoveryMultiplier(home.recovery,p);
 choose(e,'warSpoils');choose(e,'rapidRecovery');
 close(home.recovery,6);close(recoveryMultiplier(home.recovery,p),initialRecoveryFraction);
 const target=MAP.find(region=>region.playable&&s.provinces[region.id].owner===-1);
 const unit=s.units.find(u=>u.owner===0);
 Object.assign(unit,{x:target.center.x,z:target.center.z,province:target.id,origin:target.id});
 const captured=s.provinces[target.id];
 Object.assign(captured,{capture:7.99,captor:0});
 s.units=[unit];const funds=p.funds,existingIncome=incomePerSecond(s,0);
 e.step();assert.equal(captured.owner,0);
 close(captured.recovery,11.25-DT);assert.equal(recoveryDuration(p),11.25);
 assert.equal(captureReward(p),40);
 close(p.funds-funds,40+DT*(existingIncome+.75*.5));
});
