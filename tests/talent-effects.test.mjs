import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {DT,UNITS,stats,upgradeCost,upgradeCostFor} from '../src/game/content.ts';
import {CONSTRUCTION,constructionCost,salvageValue} from '../src/game/construction.ts';
import {MAP,pointInProvince,provinceByCode} from '../src/game/map.ts';
import {capacityFor,regionCapacity} from '../src/game/territoryEconomy.ts';
import {talentContext,SAPPER_INTERVAL_TICKS} from '../src/game/talentEffects.ts';
import {dailyFundsBreakdown,incomePerDay} from '../src/ui/hud/hudModel.ts';
import {decodeSave,encodeSave} from '../src/game/save.ts';
import {BALANCE} from '../src/game/balance.ts';

const T=BALANCE.talents;
/** Funds Tribute takes from a country holding `funds`. */
const tributeTaken=funds=>Math.min(T.tribute.max,Math.floor(funds*T.tribute.share));
const close=(value,want,epsilon=1e-8)=>assert.ok(Math.abs(value-want)<epsilon,`${value} != ${want}`);
const setups=(kind='infantry',other='infantry')=>[{name:'A',leader:'warden',loadout:[kind]},{name:'B',leader:'steward',loadout:[other]}];
const initial=new Map();
/** A fresh engine; talents are granted directly to test rules, not drafts. */
function game(kind='infantry',other='infantry',talents=[],enemyTalents=[]){
 const key=kind+'/'+other;if(!initial.has(key))initial.set(key,createGame(setups(kind,other),42));
 const e=new Engine(initial.get(key));e.state.players[0].talents.push(...talents);e.state.players[1].talents.push(...enemyTalents);return e;
}
const home=e=>e.state.provinces.find(p=>p.owner===0).id;
const enemyHome=e=>e.state.provinces.find(p=>p.owner===1).id;
const steps=(e,count)=>{for(let i=0;i<count;i++)e.step();};
const stepToPulse=(e,every=20)=>{do e.step();while(e.state.tick%every!==0);};

/** One player-0 battalion finishes capturing an empty region on the next step. */
function captureSetup(e,{owner=-1,construction}={}){
 const s=e.state,taken=new Set(s.units.filter(u=>u.owner>=0).map(u=>u.province));
 const target=MAP.find(region=>region.playable&&s.provinces[region.id].owner===-1&&!taken.has(region.id));
 const unit=s.units.find(u=>u.owner===0);
 Object.assign(unit,{x:target.center.x,z:target.center.z,province:target.id,origin:target.id});
 const province=s.provinces[target.id];Object.assign(province,{owner,capture:BALANCE.capture.days-.01,captor:0});
 if(construction)province.construction=construction;
 s.units=[unit];return province;
}
test('capture talents: Press Gang raises troops, Fortify builds, Salvage cashes buildings in first, Tribute takes funds',()=>{
 const plain=game(),plainRegion=captureSetup(plain);plain.step();
 assert.equal(plainRegion.owner,0);assert.equal(plainRegion.construction,undefined);
 const levy=game('infantry','infantry',['pressGang']),levyRegion=captureSetup(levy);levy.step();
 assert.equal(levy.state.units.filter(u=>u.owner===0&&u.province===levyRegion.id).length,1+T.pressGang.units);
 const fort=game('infantry','infantry',['fortify']),fortRegion=captureSetup(fort);fort.step();
 assert.deepEqual(fortRegion.construction,{kind:'fortress',level:T.fortify.level});
 // Salvage then Fortify: the captured market becomes funds and the empty slot a fortress.
 const both=game('infantry','infantry',['salvage','fortify']),market={kind:'market',level:2};
 const bothRegion=captureSetup(both,{construction:market}),funds=both.state.players[0].funds;both.step();
 assert.equal(salvageValue(market),Math.floor((CONSTRUCTION.market.costs[0]+CONSTRUCTION.market.costs[1])*T.salvage.refund));
 close(both.state.players[0].funds-funds,BALANCE.economy.captureReward+salvageValue(market),.5);assert.deepEqual(bothRegion.construction,{kind:'fortress',level:T.fortify.level});
 // Without Salvage, buildings survive capture as before.
 const keep=game(),keepRegion=captureSetup(keep,{construction:market});keep.step();assert.deepEqual(keepRegion.construction,market);
 const tribute=game('infantry','infantry',['tribute']),victim=tribute.state.players[1];victim.funds=300;
 captureSetup(tribute,{owner:1});const before=tribute.state.players[0].funds;tribute.step();
 close(victim.funds,300-tributeTaken(300),.5);close(tribute.state.players[0].funds-before,BALANCE.economy.captureReward+tributeTaken(300),.5);
});

test('Living off the Land multiplies kill and capture funds but cuts regional income',()=>{
 const e=game('infantry','infantry',['livingOffLand','tribute']),victim=e.state.players[1];victim.funds=300;
 captureSetup(e,{owner:1});const before=e.state.players[0].funds;e.step();
 close(e.state.players[0].funds-before,(BALANCE.economy.captureReward+tributeTaken(300))*T.livingOffLand.plunder,.5);
 const plain=game(),cut=game('infantry','infantry',['livingOffLand']);
 close(dailyFundsBreakdown(cut.state,0).regions,dailyFundsBreakdown(plain.state,0).regions*T.livingOffLand.income);
});

/** Player 0 attacks a nearly dead player-1 battalion on clear ground. */
function duel(attackerTalents,victimTalents,{victimOwnsRegion=false}={}){
 const e=game('infantry','infantry',attackerTalents,victimTalents),s=e.state,province=provinceByCode('DEU-3487'),anchor=MAP[province].center,center={x:anchor.x,z:anchor.z+4};
 s.provinces[province].owner=victimOwnsRegion?1:-1;s.provinces[province].kind='infantry';s.provinces[province].production=0;
 const unit=(id,owner,hp,cooldown,x=0)=>({id,owner,kind:'infantry',x:center.x+x,z:center.z,hp,province,origin:province,target:null,destination:null,route:[],cooldown});
 s.units=[unit(1,0,100,0),unit(2,1,1,1000,1)];s.nextId=100;
 const before={funds:s.players.map(p=>p.funds),xp:s.players.map(p=>p.xp)};e.step();
 assert.equal(s.units.some(u=>u.id===2),false,'victim died');
 return {e,s,province:s.provinces[province],funds:s.players.map((p,i)=>p.funds-before.funds[i]),xp:s.players.map((p,i)=>p.xp-before.xp[i])};
}
test('kill talents: Bounty and Battle-hardened reward the killer; Pensions and Martyrs pay back the victim',()=>{
 const control=duel([],[],{victimOwnsRegion:true});
 const reward=duel(['bounty','battleHardened'],['pensions','martyrs'],{victimOwnsRegion:true});
 close(control.xp[0],BALANCE.leader.killXp);close(reward.xp[0],T.battleHardened.killXp);
 close(reward.funds[0]-control.funds[0],T.bounty.funds);close(reward.funds[1]-control.funds[1],T.pensions.funds);
 close(reward.province.production-control.province.production,UNITS.infantry.train*T.martyrs.training);
 const plunder=duel(['bounty','livingOffLand'],[]),plain=duel([],[]);
 close(plunder.funds[0]-plain.funds[0]-(plunder.e.state.players[0].funds-plunder.e.state.players[0].funds),T.bounty.funds*T.livingOffLand.plunder,.2);
 // Martyrs only refunds deaths inside the victim's own territory.
 const away=duel([],['martyrs']);close(away.province.production,0);
});

test('capacity talents stack: Grand Garrison, Human Wave and Conscription barracks',()=>{
 const e=game(),s=e.state,id=home(e),base=regionCapacity(id);
 assert.equal(capacityFor(s,id),base);
 s.players[0].talents.push('grandGarrison');assert.equal(capacityFor(s,id),Math.floor(base*T.grandGarrison.capacity));
 s.players[0].talents.push('shieldWall');assert.equal(capacityFor(s,id),Math.floor(base*T.grandGarrison.capacity)+T.shieldWall.capacity);
 s.players[0].talents.push('conscription');s.provinces[id].construction={kind:'barracks',level:2};
 assert.equal(capacityFor(s,id),Math.floor(base*T.grandGarrison.capacity)+T.shieldWall.capacity+T.conscription.slots[1]);
 assert.equal(capacityFor(s,enemyHome(e)),base,'only the owner’s talents count');
});

test('training talents: Levy trains faster for funds per battalion; Militia trains while besieged',()=>{
 const plain=game(),levy=game('infantry','infantry',['levy']);
 for(const e of [plain,levy]){e.state.provinces[home(e)].production=0;e.step();}
 const increment=plain.state.provinces[home(plain)].production;assert.ok(increment>0);
 close(levy.state.provinces[home(levy)].production,increment*T.levy.training);
 const train=UNITS.infantry.train;
 for(const e of [plain,levy]){e.state.provinces[home(e)].production=train-1e-6;}
 const counts=[plain,levy].map(e=>e.state.units.length),funds=[plain,levy].map(e=>e.state.players[0].funds);
 plain.step();levy.step();
 assert.equal(plain.state.units.length,counts[0]+1);assert.equal(levy.state.units.length,counts[1]+1);
 close((levy.state.players[0].funds-funds[1])-(plain.state.players[0].funds-funds[0]),-T.levy.cost);
 // An enemy at the region centre stalls training unless the owner has Militia (then it speeds up).
 const besieged=[game(),game('infantry','infantry',['militia'])];
 for(const e of besieged){
  const s=e.state,id=home(e),center=MAP[id].center;s.provinces[id].production=0;
  s.units.push({id:s.nextId++,owner:1,kind:'infantry',x:center.x,z:center.z,hp:100,province:id,origin:id,target:null,destination:null,route:[],cooldown:0});
  e.step();
 }
 close(besieged[0].state.provinces[home(besieged[0])].production,0);
 close(besieged[1].state.provinces[home(besieged[1])].production,increment*T.militia.training);
});

/** A playable region whose playable neighbours all belong to player 0. */
function encircle(e){
 const s=e.state,spawns=new Set([home(e),enemyHome(e)]);
 const region=MAP.find(r=>r.playable&&!spawns.has(r.id)&&r.neighbors.filter(id=>MAP[id].playable).length>=2&&r.neighbors.every(id=>!spawns.has(id)));
 for(const id of region.neighbors)if(MAP[id].playable)s.provinces[id].owner=0;
 Object.assign(s.provinces[region.id],{owner:1,kind:'infantry',production:1});
 s.units=s.units.filter(u=>u.province!==region.id);
 return region.id;
}
test('Encirclement: surrounded regions stop training, take more damage and fall faster',()=>{
 const plain=game(),surrounded=game('infantry','infantry',['encirclement']);
 const a=encircle(plain),b=encircle(surrounded);
 assert.deepEqual(talentContext(surrounded.state).encirclers.get(b),[0]);
 assert.equal(talentContext(plain.state).encirclers.size,0);
 plain.step();surrounded.step();
 assert.ok(plain.state.provinces[a].production>1);close(surrounded.state.provinces[b].production,1);
 for(const e of [plain,surrounded]){
  const id=e===plain?a:b,center=MAP[id].center;
  e.state.units.push({id:e.state.nextId++,owner:0,kind:'infantry',x:center.x,z:center.z,hp:100,province:id,origin:id,target:null,destination:null,route:[],cooldown:0});
  e.step();
 }
 close(surrounded.state.provinces[b].capture/plain.state.provinces[a].capture,T.encirclement.captureSpeed);
});

test('Raiders: enemy regions with this cavalry inside earn and train nothing; the HUD agrees',()=>{
 const results=[false,true].map(raid=>{
  const e=game('cavalry','infantry',raid?['lightSaddles']:[]),s=e.state,id=enemyHome(e),center=MAP[id].center;
  let spot;for(let r=6;r<14&&!spot;r+=.5)for(let a=0;a<32&&!spot;a++){const p={x:center.x+Math.cos(a/5.1)*r,z:center.z+Math.sin(a/5.1)*r};if(pointInProvince(id,p.x,p.z))spot=p;}
  assert.ok(spot,'a point inside the enemy region away from its garrison');
  s.units=s.units.filter(u=>u.owner!==0);s.units.push({id:s.nextId++,owner:0,kind:'cavalry',x:spot.x,z:spot.z,hp:120,province:id,origin:id,target:null,destination:null,route:[],cooldown:0});
  s.provinces[id].production=0;const funds=s.players[1].funds,quote=incomePerDay(s,1);e.step();
  return {gain:s.players[1].funds-funds,quote,upkeep:s.units.filter(u=>u.owner===1).length*0.1,production:s.provinces[id].production};
 });
 assert.ok(results[0].gain>0&&results[0].production>0);
 close(results[1].quote,-results[1].upkeep);close(results[1].gain,DT*results[1].quote);close(results[1].production,0);
});

test('Siege Lines keeps abandoned capture progress; without it progress decays',()=>{
 const values=[[],['siegeLines']].map(talents=>{
  const e=game('infantry','infantry',talents),s=e.state,taken=new Set(s.units.filter(u=>u.owner>=0).map(u=>u.province));
  const region=MAP.find(r=>r.playable&&s.provinces[r.id].owner===-1&&!taken.has(r.id));
  // An enemy-held region whose centre is now empty: base rules decay the abandoned progress.
  s.units=s.units.filter(u=>u.province!==region.id);
  Object.assign(s.provinces[region.id],{owner:1,kind:'infantry',capture:3,captor:0});e.step();return s.provinces[region.id].capture;
 });
 close(values[0],3-DT*BALANCE.capture.decayPerDay);close(values[1],3);
});

test('daily talents: Treasury interest, Academy experience, Field Medicine and Supply Columns healing',()=>{
 const plain=game(),rich=game('infantry','infantry',['treasury']);
 for(const e of [plain,rich])e.state.players[0].funds=300;
 plain.step();rich.step();close(rich.state.players[0].funds-plain.state.players[0].funds,DT*Math.min(T.treasury.max,300*T.treasury.interest),1e-4);// interest on the funds after this tick's income
 const school=game('infantry','infantry',['academy']);school.state.provinces[home(school)].construction={kind:'barracks',level:2};
 const xp=school.state.players[0].xp;school.step();close(school.state.players[0].xp-xp,DT*T.academy.xpPerDay[1]);
 const medic=game('infantry','infantry',['fieldMedicine','supplyColumns']),s=medic.state,id=home(medic);
 const resting=s.units.find(u=>u.owner===0&&u.province===id),marching=s.units.find(u=>u.owner===0&&u.province===id&&u!==resting);
 const neutral=MAP[id].neighbors.find(n=>MAP[n].playable&&s.provinces[n].owner===-1);
 resting.hp=50;Object.assign(marching,{hp:50,target:neutral,destination:neutral});
 stepToPulse(medic);
 const maximum=stats(s.players[0],'infantry').hp;
 // Field Medicine out of combat in friendly territory, plus Supply Columns under orders.
 close(resting.hp,50+maximum*T.fieldMedicine.healPerDay);close(marching.hp,50+maximum*(T.supplyColumns.healPerDay+T.fieldMedicine.healPerDay),1e-9);
 resting.hp=maximum-.5;stepToPulse(medic);close(resting.hp,maximum);
});

test('Bastion Guns bleeds enemies inside the holder’s fortress regions and credits the kill',()=>{
 const results=[[],['bastionGuns']].map(talents=>{
  const e=game('infantry','infantry',talents),s=e.state,id=home(e),center=MAP[id].center;
  s.provinces[id].construction={kind:'fortress',level:1};
  const intruder={id:s.nextId++,owner:1,kind:'infantry',x:center.x,z:center.z,hp:100,province:id,origin:id,target:null,destination:null,route:[],cooldown:0};
  const doomed={...intruder,id:s.nextId++,hp:1};s.units=[intruder,doomed];
  const xp=s.players[0].xp;stepToPulse(e);return {hp:intruder.hp,xp:s.players[0].xp-xp,alive:s.units.includes(doomed)};
 });
 close(results[0].hp,100);assert.equal(results[0].alive,true);
 close(results[1].hp,100-T.bastionGuns.damagePerDay[0]*UNITS.infantry.hp);assert.equal(results[1].alive,false);close(results[1].xp,BALANCE.leader.killXp);
});

test('Field Engineers upgrade staffed buildings on their interval; Industrial Base allows level 3',()=>{
 const e=game('engineer','infantry',['sappers']),s=e.state,id=home(e);
 s.provinces[id].construction={kind:'market',level:1};
 steps(e,SAPPER_INTERVAL_TICKS-s.tick);assert.deepEqual(s.provinces[id].construction,{kind:'market',level:2});
 steps(e,SAPPER_INTERVAL_TICKS);assert.deepEqual(s.provinces[id].construction,{kind:'market',level:2},'level 2 is the cap without Industrial Base');
 s.players[0].talents.push('industrialBase');steps(e,SAPPER_INTERVAL_TICKS);assert.deepEqual(s.provinces[id].construction,{kind:'market',level:3});
});

test('construction and upgrade talents: Industrial Base level 3, Fortress Doctrine and Arsenal discounts',()=>{
 const order=(province,kind,expectedLevel)=>({type:'construct',province,kind,expectedLevel});
 const e=game('infantry','infantry',['industrialBase']),s=e.state,p=s.players[0],id=home(e);p.funds=1000;
 for(const [level,cost]of CONSTRUCTION.market.costs.entries()){const funds=p.funds;assert.deepEqual(e.command(0,order(id,'market',level)),{ok:true});close(funds-p.funds,cost);}
 assert.deepEqual(s.provinces[id].construction,{kind:'market',level:3});
 assert.deepEqual(e.command(0,order(id,'market',3)),{ok:false,error:'invalidCommand'});
 const plain=game();plain.state.provinces[home(plain)].construction={kind:'market',level:2};plain.state.players[0].funds=1000;
 assert.deepEqual(plain.command(0,order(home(plain),'market',2)),{ok:false,error:'invalidCommand'});
 assert.equal(constructionCost('fortress',0,{talents:['fortressDoctrine']}),Math.floor(CONSTRUCTION.fortress.costs[0]*T.fortressDoctrine.cost));
 assert.equal(constructionCost('fortress',0,{talents:['fortressDoctrine','publicWorks']}),Math.floor(CONSTRUCTION.fortress.costs[0]*T.publicWorks.cost*T.fortressDoctrine.cost));
 assert.equal(constructionCost('market',2,{talents:['publicWorks']}),Math.floor(CONSTRUCTION.market.costs[2]*T.publicWorks.cost));
 const discounted=Math.floor(upgradeCost(0)*T.arsenal.cost);assert.equal(upgradeCostFor({talents:['arsenal']},0),discounted);
 const armory=game('infantry','infantry',['arsenal']),funds=armory.state.players[0].funds;
 assert.deepEqual(armory.command(0,{type:'upgrade',kind:'infantry',stat:'attack'}),{ok:true});close(funds-armory.state.players[0].funds,discounted);
 // A level-3 building keeps working for a captor without the talent, and saves round-trip.
 assert.deepEqual(decodeSave(encodeSave(s,'Level three')).state,s);
});

test('HUD income matches engine funds with Trade Routes, Tax Reform, Mercantilism and Treasury',()=>{
 const e=game('infantry','infantry',['tradeRoutes','taxReform','mercantilism','treasury']),s=e.state,p=s.players[0],id=home(e);
 const neighbor=MAP[id].neighbors.find(n=>MAP[n].playable&&s.provinces[n].owner===-1);
 Object.assign(s.provinces[neighbor],{owner:0,kind:'infantry'});s.units=s.units.filter(u=>u.province!==neighbor);
 s.provinces[id].construction={kind:'market',level:1};s.provinces[neighbor].construction={kind:'market',level:2};p.funds=1000;
 const plain=game('infantry','infantry',['taxReform','mercantilism','treasury']);
 Object.assign(plain.state.provinces[neighbor],{owner:0,kind:'infantry'});plain.state.units=plain.state.units.filter(u=>u.province!==neighbor);
 plain.state.provinces[id].construction={kind:'market',level:1};plain.state.provinces[neighbor].construction={kind:'market',level:2};plain.state.players[0].funds=1000;
 const quote=incomePerDay(s,0),before=p.funds;e.step();
 close(p.funds-before,DT*quote,1e-9);
 assert.ok(quote>incomePerDay(plain.state,0),'neighbouring markets add trade income');
});
