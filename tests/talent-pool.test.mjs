import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {KINDS,TALENTS,TALENT_BY_ID,UNITS,stats,talentApplies} from '../src/game/content.ts';
import {availableTalentIds,canRerollTalent} from '../src/game/talentReroll.ts';
import {SAMPLE_BUILDS,aiBuildPlan,aiTalentChoice,formedBuilds} from '../src/game/talentBuilds.ts';
import {checksum,decodeSave,encodeSave} from '../src/game/save.ts';
import {STRINGS} from '../src/ui/i18n.ts';
import {BALANCE} from '../src/game/balance.ts';

const T=BALANCE.talents;
const close=(value,want)=>assert.ok(Math.abs(value-want)<1e-8,`${value} != ${want}`);
const LEGACY=['industry','forcedMarch','entrenchment','veterans','logistics','conqueror','fieldMedicine','protectiveGear','combatDrills','rangefinding',
 'navalLogistics','warSpoils','taxReform','publicWorks','rapidRecovery','charge','barrage','sappers','shieldWall','forwardMarksmen','lightSaddles',
 'wideSalvo','armoredSappers','breachDrills'];
const pool=kind=>TALENTS.filter(t=>talentApplies(t,[kind]));
function game(kind='infantry'){
 return new Engine(createGame([{name:'A',leader:'warden',loadout:[kind]},{name:'B',leader:'steward',loadout:['infantry']}],42));
}

test('59 translated talents keep all 24 legacy IDs; every unit kind draws the 42 universal talents plus its own signatures',()=>{
 assert.equal(TALENTS.length,59);assert.equal(new Set(TALENTS.map(t=>t.id)).size,59);
 for(const id of LEGACY)assert.ok(TALENT_BY_ID.has(id),id);
 assert.equal(TALENTS.filter(t=>!t.kinds).length,42);
 for(const t of TALENTS){
  for(const key of [t.id,t.id+'.desc']){assert.equal(STRINGS[key]?.length,2,key);assert.ok(STRINGS[key].every(value=>value.trim().length),key);}
  if(t.kinds)assert.equal(t.kinds.length,1,`${t.id} belongs to exactly one unit kind`);
 }
 const signatures=new Map(KINDS.map(kind=>[kind,TALENTS.filter(t=>t.kinds?.includes(kind)).map(t=>t.id)]));
 for(const kind of KINDS){
  assert.equal(signatures.get(kind).length,kind==='engineer'?3:2,kind);
  assert.equal(pool(kind).length,42+signatures.get(kind).length,kind);
 }
 // Kinds of one family no longer share a pool: every unit kind has its own cards.
 assert.notDeepEqual(signatures.get('infantry'),signatures.get('skirmisher'));
 assert.notDeepEqual(signatures.get('cavalry'),signatures.get('heavyCavalry'));
});

test('design graph: conditions can be produced, cards connect to at least two others, and plain number cards stay a minority',()=>{
 for(const kind of KINDS){
  const cards=pool(kind),fillers=cards.filter(t=>!t.reads.length);
  assert.ok(fillers.length*3<=cards.length,`${kind}: ${fillers.length}/${cards.length} unconditional cards`);
  for(const t of cards){
   for(const keyword of t.reads)assert.ok(cards.some(o=>o!==t&&o.writes.includes(keyword)),`${kind}/${t.id}: nothing writes ${keyword}`);
   if(!t.reads.length)continue;
   const partners=cards.filter(o=>o!==t&&(o.writes.some(k=>t.reads.includes(k))||t.writes.some(k=>o.reads.includes(k))));
   assert.ok(partners.length>=2,`${kind}/${t.id} connects to ${partners.length}`);
  }
 }
});

test('sample builds are made of universal cards, are translated and are recognised once enough cards are held',()=>{
 assert.equal(SAMPLE_BUILDS.length,6);
 for(const build of SAMPLE_BUILDS){
  assert.ok(build.need>=2&&build.need<=build.cards.length,build.id);
  for(const id of build.cards){const t=TALENT_BY_ID.get(id);assert.ok(t&&!t.kinds,`${build.id}/${id}`);}
  for(const key of [`build.${build.id}`,`build.${build.id}.desc`])assert.equal(STRINGS[key]?.length,2,key);
  assert.deepEqual(formedBuilds(build.cards.slice(0,build.need)).includes(build.id),true);
  assert.equal(formedBuilds(build.cards.slice(0,build.need-1)).includes(build.id),false);
 }
 assert.deepEqual(formedBuilds(['treasury','warChest','industry']),['hoarder']);
 assert.deepEqual(formedBuilds(['martyrs','militia','logistics']),['lastStand']);
});

test('rule-changing talents enter drafts at leader level 4; drafts stay uniform and family-free',()=>{
 const early=availableTalentIds({loadout:['cavalry'],talents:[],level:3});
 for(const id of ['encirclement','livingOffLand','industrialBase'])assert.equal(early.includes(id),false,id);
 const late=availableTalentIds({loadout:['cavalry'],talents:[],level:4});
 for(const id of ['encirclement','livingOffLand','industrialBase'])assert.ok(late.includes(id),id);
 assert.ok(late.includes('charge')&&late.includes('lightSaddles'));
 assert.equal(late.includes('cuirass'),false,'heavy cavalry signature');
 const e=game('cavalry'),p=e.state.players[0];
 Object.assign(p,{level:3,drafts:1,choices:['encirclement']});
 assert.deepEqual(e.command(0,{type:'talent',id:'encirclement'}),{ok:false,error:'invalidChoice'});
});

test('a reroll can keep one card, must still change another, and rejects keeps outside the offer',()=>{
 const e=game(),p=e.state.players[0];
 Object.assign(p,{level:4,drafts:1,choices:['industry','forcedMarch','entrenchment'],funds:500});
 assert.deepEqual(e.command(0,{type:'reroll',keep:'charge'}),{ok:false,error:'invalidCommand'});
 assert.deepEqual(e.command(0,{type:'reroll',keep:7}),{ok:false,error:'invalidCommand'});
 for(let i=0;i<20;i++){
  const before=[...p.choices],kept=before[i%3];
  assert.deepEqual(e.command(0,{type:'reroll',keep:kept}),{ok:true});
  assert.equal(p.choices[0],kept);assert.equal(p.choices.length,3);assert.equal(new Set(p.choices).size,3);
  assert.ok(p.choices.some(id=>!before.includes(id)),'at least one new card');
  assert.ok(p.choices.every(id=>availableTalentIds(p).includes(id)));
  p.funds=500;
 }
 assert.equal(canRerollTalent(p,'charge'),false);
 assert.deepEqual(decodeSave(encodeSave(e.state,'Kept reroll')).state,e.state);
});

test('AI countries follow a stable sample-build plan without consuming the campaign RNG',()=>{
 const state=createGame(Array.from({length:12},(_,i)=>({name:`AI ${i}`,leader:'warden',loadout:['infantry'],ai:true})),7);
 const plans=state.players.map(p=>aiBuildPlan(state,p).id);
 assert.deepEqual(state.players.map(p=>aiBuildPlan(state,p).id),plans);
 assert.ok(new Set(plans).size>=3,'plans vary between seats');
 const player=state.players[0],plan=aiBuildPlan(state,player),card=plan.cards[0],rng=state.rng;
 assert.equal(aiTalentChoice(state,{...player,choices:['veterans','industrialBase',card]}),card);
 assert.equal(aiTalentChoice(state,{...player,choices:['tradeRoutes','veterans']}),'veterans','AI skips cards that need construction');
 assert.equal(aiTalentChoice(state,{...player,choices:['veterans','industry']}),'veterans','ties keep the offer order');
 assert.equal(state.rng,rng);
});

test('static unit modifiers apply only to the matching unit kind',()=>{
 const p={talents:['forcedMarch','veterans','protectiveGear','combatDrills','rangefinding','navalLogistics','shieldWall','lightInfantry','cuirass','breakthrough','wideSalvo','mercantilism'],
  upgrades:Object.fromEntries(KINDS.map(k=>[k,{attack:0,health:0,speed:0}]))};
 for(const kind of KINDS){
  const st=stats(p,kind),b=UNITS[kind];
  close(st.hp,b.hp*(kind==='infantry'?T.shieldWall.hp:1));
  close(st.attack,b.attack*T.veterans.attack*T.mercantilism.attack);
  close(st.defense,b.defense+T.protectiveGear.defense+(kind==='heavyCavalry'?T.cuirass.defense:0));
  close(st.attackSpeed,b.attackSpeed*T.combatDrills.attackSpeed);
  close(st.range,b.range*T.rangefinding.range);
  close(st.seaSpeed,b.seaSpeed*T.navalLogistics.seaSpeed);
  close(st.speed,b.speed*T.forcedMarch.speed*(kind==='skirmisher'?T.lightInfantry.speed:1));
  close(st.splash,kind==='heavyCavalry'?b.splash+T.breakthrough.splash:kind==='artillery'?b.splash*T.wideSalvo.splash:b.splash);
 }
 // Former family attack/range/defense bonuses are now conditional effects, not stats.
 const signature={talents:['charge','barrage','breachDrills','forwardMarksmen','armoredSappers','lightSaddles'],upgrades:p.upgrades};
 for(const kind of KINDS)assert.deepEqual(stats(signature,kind),stats(undefined,kind),kind);
});

test('Human Wave scales deployed troops; old saves with reworked health talents load clamped to the new maximum',()=>{
 const e=game(),s=e.state,p=s.players[0],u=s.units.find(unit=>unit.owner===0);
 u.hp=50;Object.assign(p,{level:2,drafts:1,choices:['shieldWall']});
 assert.deepEqual(e.command(0,{type:'talent',id:'shieldWall'}),{ok:true});
 close(u.hp,50*T.shieldWall.hp);
 // An older save: Field Medicine and Infantry Line both used to add 15% maximum health.
 const old=game().state,legacy=old.units.find(unit=>unit.owner===0);
 old.players[0].talents=['fieldMedicine','shieldWall'];legacy.hp=UNITS.infantry.hp*1.15*1.15;
 const body=JSON.stringify(old),envelope=JSON.stringify({version:1,name:'Legacy',savedAt:new Date().toISOString(),hash:checksum(body),body});
 const loaded=decodeSave(envelope).state.units.find(unit=>unit.id===legacy.id);
 close(loaded.hp,stats(old.players[0],'infantry').hp);
});
