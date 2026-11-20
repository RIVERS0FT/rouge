import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {UNITS,stats} from '../src/game/content.ts';
import {MAP,provinceByCode} from '../src/game/map.ts';
import {updateBattleUnits} from '../src/game/groundKernel.ts';
import {updateUnitsFallback} from '../src/game/unitFallback.ts';
import {combatLanes,MAX_DAMAGE_REDUCTION,MODE_VS_MARCHING,MODE_VS_GARRISON,MODE_POINT_BLANK,MODE_SECONDARY_HEAVY,MODE_SECONDARY_HALF,MODE_WIDE_SALVO,MODE_SPLASH_RESIST} from '../src/game/talentEffects.ts';
import {BALANCE} from '../src/game/balance.ts';

const T=BALANCE.talents;
const close=(value,want)=>assert.ok(Math.abs(value-want)<1e-7,`${value} != ${want}`);
const engines=new Map();
/** Two countries on clear ground in one region; player 0 also owns a neighbour.
 * Units: 1 assaults/captures the region, 2 marches to the friendly neighbour, 3 is garrisoned;
 * player 1's units 4-8 mix garrison and marching troops. */
function scenario(kindA,talentsA,kindB,talentsB,regionOwner,{funds=0,extra=[]}={}){
 const key=kindA+'/'+kindB;if(!engines.has(key))engines.set(key,createGame([{name:'A',leader:'steward',loadout:[kindA]},{name:'B',leader:'steward',loadout:[kindB]}],42));
 const s=new Engine(engines.get(key)).state,province=provinceByCode('DEU-3487'),neighbor=MAP[province].neighbors.find(id=>MAP[id].playable),anchor=MAP[province].center,c={x:anchor.x,z:anchor.z+4};
 s.provinces[province].owner=regionOwner;s.provinces[neighbor].owner=0;
 s.players[0].talents=[...talentsA];s.players[1].talents=[...talentsB];s.players[0].funds=funds;
 const unit=(id,owner,kind,x,z,target=null)=>({id,owner,kind,x:c.x+x,z:c.z+z,hp:10000,province,origin:province,target,destination:target,route:[],cooldown:0});
 s.units=[unit(1,0,kindA,0,0,province),unit(2,0,kindA,.5,.8,neighbor),unit(3,0,kindA,-.6,.4),
  unit(4,1,kindB,1,0),unit(5,1,kindB,1.4,.6,province),unit(6,1,kindB,1.2,-.7),unit(7,1,kindB,2.1,.2),unit(8,1,kindB,1.7,-1.2),
  ...extra.map(([id,owner,kind,x,z])=>unit(id,owner,kind,x,z))];
 s.nextId=200;return {s,province,neighbor};
}
const halt=u=>{delete u.travel;delete u.transport;u.target=null;u.destination=null;u.route=[];u.origin=u.province;};
function resolve(state,path){
 const s=structuredClone(state),damage=new Map(),statsFor=(owner,kind)=>stats(s.players[owner],kind);
 if(path==='kernel')updateBattleUnits(s.units,statsFor,s,damage,combatLanes(s.units,s,statsFor));
 else updateUnitsFallback(s.units,statsFor,s,damage,halt);
 return {damage:[...damage].sort((a,b)=>a[0]-b[0]),units:s.units.map(u=>[u.id,u.x,u.z,u.cooldown,u.target])};
}
const CASES=[
 ['infantry',[],'infantry',[],-1],
 ['infantry',['entrenchment','massedRanks','shockAssault','pursuit'],'infantry',['entrenchment','fortressDoctrine'],1],
 ['cavalry',['charge','warChest','pursuit','logistics'],'heavyCavalry',['cuirass','breakthrough'],-1],
 ['artillery',['barrage','wideSalvo','shockAssault'],'grenadier',['stormTroops','grenadeVolley'],1],
 ['horseArtillery',['pointBlank','flyingBattery'],'skirmisher',['forwardMarksmen','lightInfantry'],0],
 ['engineer',['breachDrills','armoredSappers','fortressDoctrine'],'heavyCavalry',['cuirass','breakthrough','shockAssault'],1],
 ['grenadier',['grenadeVolley','mercantilism','veterans'],'heavyCavalry',['cuirass','massedRanks'],-1],
 ['skirmisher',['forwardMarksmen','lightInfantry','logistics'],'cavalry',['charge','shockAssault','warChest'],0],
];
test('the WASM kernel and the JS fallback resolve every combat talent identically',()=>{
 for(const [kindA,talentsA,kindB,talentsB,owner]of CASES){
  const {s}=scenario(kindA,talentsA,kindB,talentsB,owner,{funds:345});s.players[1].funds=1234;
  if(talentsB.includes('fortressDoctrine'))s.provinces[s.units[0].province].construction={kind:'fortress',level:2};
  const kernel=resolve(s,'kernel'),fallback=resolve(s,'fallback');
  assert.deepEqual(kernel,fallback,`${kindA} ${talentsA} vs ${kindB} ${talentsB}`);
  assert.ok(kernel.damage.length>=4,'both sides fought');
 }
});

test('combat lanes apply each condition to the right units and cap the damage reduction',()=>{
 const statsFor=(s)=>(owner,kind)=>stats(s.players[owner],kind);
 // Shock Assault, Charge, War Chest and Interior Lines on cavalry: 1 assaults, 2 marches home, 3 is garrisoned.
 let {s}=scenario('cavalry',['shockAssault','charge','warChest','logistics'],'infantry',[],-1,{funds:345});
 let lanes=combatLanes(s.units,s,statsFor(s));
 const chest=Math.min(T.warChest.max,T.warChest.bonus*Math.floor(345/T.warChest.per));
 close(lanes.dealt[0],T.shockAssault.assaultBonus+T.charge.damageBonus+chest);close(lanes.dealt[1],T.charge.damageBonus+chest);close(lanes.dealt[2],-T.shockAssault.garrisonPenalty+chest);
 close(lanes.speed[1],stats(s.players[0],'cavalry').speed*T.logistics.speed);close(lanes.speed[0],stats(s.players[0],'cavalry').speed);
 assert.ok(Number.isNaN(lanes.speed[3]),'no speed change for a country without Interior Lines');
 // Defensive stack: friendly territory, level-3 fortress, eight troops and recovery; the sum is capped.
 ({s}=scenario('infantry',[],'infantry',['entrenchment','fortressDoctrine','massedRanks','pursuit'],1,{extra:[[9,1,'infantry',1.5,1],[10,1,'infantry',2,1],[11,1,'infantry',2.4,0]]}));
 s.provinces[s.units[0].province].construction={kind:'fortress',level:3};s.provinces[s.units[0].province].recovery=5;
 lanes=combatLanes(s.units,s,statsFor(s));
 const stack=T.entrenchment.damageReduction+T.fortressDoctrine.damageReduction[2]+(8>=T.massedRanks.minUnits?T.massedRanks.damageReduction:0)+T.pursuit.damageReduction;
 close(lanes.taken[3],Math.min(MAX_DAMAGE_REDUCTION,stack));close(lanes.dealt[3],T.pursuit.damageBonus);
 for(let i=0;i<3;i++)close(lanes.taken[i],0);
 // Signature bits only on their own unit kind.
 for(const [kind,talent,bit]of [['skirmisher','forwardMarksmen',MODE_VS_MARCHING],['artillery','barrage',MODE_VS_GARRISON],['horseArtillery','pointBlank',MODE_POINT_BLANK],
  ['grenadier','grenadeVolley',MODE_SECONDARY_HEAVY],['heavyCavalry','breakthrough',MODE_SECONDARY_HALF],['artillery','wideSalvo',MODE_WIDE_SALVO],['heavyCavalry','cuirass',MODE_SPLASH_RESIST]]){
  ({s}=scenario(kind,[talent],'infantry',[],-1));lanes=combatLanes(s.units,s,statsFor(s));
  assert.equal(lanes.mode[0],bit,`${talent}`);assert.equal(lanes.mode[3],0);
 }
});

test('encircled defenders take more damage from everyone',()=>{
 const {s,province}=scenario('infantry',['encirclement'],'infantry',[],1);
 const region=MAP[province];for(const id of region.neighbors)if(MAP[id].playable)s.provinces[id].owner=0;
 const lanes=combatLanes(s.units,s,(owner,kind)=>stats(s.players[owner],kind));
 for(let i=3;i<8;i++)close(lanes.taken[i],Math.max(-BALANCE.combat.maxDamageIncrease,-T.encirclement.damageTaken));
 for(let i=0;i<3;i++)close(lanes.taken[i],0);
});

/** One attacker against a defender and optional bystanders, one tick through the engine. */
function strike(kind,talents,{defenderKind='infantry',defenderTalents=[],distance=1,attackerOrder=false,defenderOrder=false,bystanders=[]}={}){
 const {s,province}=scenario(kind,talents,defenderKind,defenderTalents,-1);
 const center={x:s.units[0].x,z:s.units[0].z};
 const unit=(id,owner,k,x,z,target=null)=>({id,owner,kind:k,x:center.x+x,z:center.z+z,hp:10000,province,origin:province,target,destination:target,route:[],cooldown:owner===0?0:1000});
 s.units=[unit(1,0,kind,0,0,attackerOrder?province:null),unit(2,1,defenderKind,distance,0,defenderOrder?province:null),...bystanders.map(([id,x,z])=>unit(id,1,defenderKind,distance+x,z))];
 const e=new Engine(s);e.step(1);
 return new Map(e.state.units.map(u=>[u.id,10000-u.hp]));
}
test('damage formulas: conditional bonuses multiply attack before armor; splash talents change targets and shares',()=>{
 const infantryArmor=100/(100+UNITS.infantry.defense);
 close(strike('cavalry',['charge'],{attackerOrder:true}).get(2),UNITS.cavalry.attack*(1+T.charge.damageBonus)*infantryArmor);
 close(strike('cavalry',['charge']).get(2),UNITS.cavalry.attack*infantryArmor);
 close(strike('skirmisher',['forwardMarksmen'],{defenderOrder:true}).get(2),UNITS.skirmisher.attack*(1+T.forwardMarksmen.damageBonus)*infantryArmor);
 close(strike('skirmisher',['forwardMarksmen']).get(2),UNITS.skirmisher.attack*infantryArmor);
 close(strike('artillery',['barrage']).get(2),UNITS.artillery.attack*(1+T.barrage.damageBonus)*infantryArmor);
 close(strike('artillery',['barrage'],{defenderOrder:true}).get(2),UNITS.artillery.attack*infantryArmor);
 close(strike('horseArtillery',['pointBlank'],{distance:T.pointBlank.range-.5}).get(2),UNITS.horseArtillery.attack*(1+T.pointBlank.damageBonus)*infantryArmor);
 close(strike('horseArtillery',['pointBlank'],{distance:T.pointBlank.range+.5}).get(2),UNITS.horseArtillery.attack*infantryArmor);
 // Wide Salvo reaches more secondary targets; Grenade Volley raises their share; Cuirass resists it.
 // Five enemies behind the target inside the widened splash radius, nearest first (ties by id): only the first wideSalvo.targets are hit.
 const salvo=strike('artillery',['wideSalvo'],{bystanders:[[3,.3,0],[4,0,.3],[5,0,-.3],[6,.2,.25],[7,.5,.5]]});
 for(const [rank,id]of [3,4,5,6,7].entries())close(salvo.get(id),rank<T.wideSalvo.targets?UNITS.artillery.attack*BALANCE.combat.splashDamage*infantryArmor:0);
 const volley=strike('grenadier',['grenadeVolley'],{bystanders:[[3,.3,0]]});close(volley.get(3),UNITS.grenadier.attack*T.grenadeVolley.splashDamage*infantryArmor);
 const armored=strike('grenadier',['grenadeVolley'],{defenderKind:'heavyCavalry',defenderTalents:['cuirass'],bystanders:[[3,.3,0]]});
 const cuirassArmor=100+UNITS.heavyCavalry.defense+T.cuirass.defense;
 close(armored.get(2),UNITS.grenadier.attack*100/cuirassArmor);close(armored.get(3),UNITS.grenadier.attack*T.grenadeVolley.splashDamage*T.cuirass.splashTaken*100/cuirassArmor);
 const cleave=strike('heavyCavalry',['breakthrough'],{bystanders:[[3,.3,0]]});close(cleave.get(3),UNITS.heavyCavalry.attack*T.breakthrough.splashDamage*infantryArmor);
 assert.equal(stats({talents:['breakthrough'],upgrades:{}},'heavyCavalry').splash,UNITS.heavyCavalry.splash+T.breakthrough.splash,'Breakthrough adds the splash radius');
});
