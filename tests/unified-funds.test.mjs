import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {DT,MAP_ID,STATE_VERSION,upgradeCost} from '../src/game/content.ts';
import {BASE_FUNDS_INCOME,CAPTURE_REWARD,CONSTRUCTION,MAX_FUNDS,STARTING_FUNDS,fundsIncomeRate} from '../src/game/construction.ts';
import {BALANCE} from '../src/game/balance.ts';
import {talentRerollCost} from '../src/game/talentReroll.ts';
import {MAP} from '../src/game/map.ts';
import {checksum,decodeSave,encodeSave,listSaves,readSave,SAVE_PREFIX,validateState,writeSave} from '../src/game/save.ts';
import {regionProductionRate} from '../src/game/territoryEconomy.ts';
import {applyFrame,encodeFrame} from '../src/platform/replication.ts';
import {dailyFundsBreakdown} from '../src/ui/hud/hudModel.ts';

const fresh=()=>new Engine(createGame([{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'steward',loadout:['infantry']}],1234));
const build=(province)=>({type:'construct',province,kind:'market',expectedLevel:0});
const upgrade={type:'upgrade',kind:'infantry',stat:'attack'};

test('construction, unit upgrades and rerolls draw from one shared funds balance',()=>{
 const e=fresh(),p=e.state.players[0],home=e.state.provinces.find(v=>v.owner===0).id;
 assert.equal(p.funds,STARTING_FUNDS);
 assert.equal(Object.hasOwn(p,'gold'),false);
 assert.equal(Object.hasOwn(p,'constructionFunds'),false);
 // Enough for a market and one upgrade, one short of a reroll.
 const market=CONSTRUCTION.market.costs[0],attack=upgradeCost(0),reroll=talentRerollCost({level:2,rerollsUsed:0});
 Object.assign(p,{funds:market+attack+reroll-1,level:2,drafts:1,choices:['industry','forcedMarch','entrenchment']});
 assert.deepEqual(e.command(0,build(home)),{ok:true});
 assert.equal(p.funds,attack+reroll-1);
 assert.deepEqual(e.command(0,upgrade),{ok:true});
 assert.equal(p.funds,reroll-1);
 assert.deepEqual(e.command(0,{type:'reroll',expectedCost:reroll}),{ok:false,error:'noFunds'});
 p.funds=reroll*2;
 assert.deepEqual(e.command(0,{type:'reroll',expectedCost:reroll}),{ok:true});
 assert.equal(p.funds,reroll);
 // Relies on a level-2 market costing more than one reroll.
 assert.deepEqual(e.command(0,{...build(home),expectedLevel:1}),{ok:false,error:'noFunds'});
 assert.equal(p.funds,reroll);
});

test('owned tiles, markets and captures pay into the same capped balance',()=>{
 const e=fresh(),s=e.state,p=s.players[0],home=s.provinces.find(v=>v.owner===0),target=s.provinces.find(v=>v.owner<0&&MAP[v.id].playable);
 const attacker=s.units.find(u=>u.owner===0&&u.province===home.id);
 const {x,z}=MAP[target.id].center;
 Object.assign(attacker,{x,z,province:target.id,origin:target.id});
 s.units=[attacker];
 target.captor=0;target.capture=BALANCE.capture.days-.01;
 assert.deepEqual(e.command(0,build(home.id)),{ok:true});
 // One tick of income: the home market at full rate, the captured region at the start of its recovery.
 const homeIncome=BASE_FUNDS_INCOME+CONSTRUCTION.market.benefits[0]*regionProductionRate(home.id),capturedIncome=BASE_FUNDS_INCOME*(1-BALANCE.economy.recoveryLoss);
 const expected=STARTING_FUNDS-CONSTRUCTION.market.costs[0]+CAPTURE_REWARD+DT*(homeIncome+capturedIncome-0.1);
 e.step(1);
 assert.equal(target.owner,0);
 assert.ok(Math.abs(p.funds-expected)<1e-8);
 p.funds=MAX_FUNDS;
 e.step(1);assert.equal(p.funds,MAX_FUNDS);
 assert.ok(fundsIncomeRate(home,regionProductionRate(home.id))>0);
});

test('each administrative region earns one base fund regardless of training productivity',()=>{
 const empty={recovery:0};
 for(const productivity of [0.5,1,1.33])assert.equal(fundsIncomeRate(empty,productivity),1);
});

test('unmodified training produces one battalion on day 30',()=>{
 const e=fresh(),s=e.state,home=s.provinces.find(p=>p.owner===0);
 s.units=[];
 assert.equal(regionProductionRate(home.id),1);
 e.step(Math.round(30/DT)-1);
 assert.equal(s.units.filter(u=>u.owner===0).length,0);
 e.step();
 assert.equal(s.units.filter(u=>u.owner===0).length,1);
 assert.ok(home.production<1e-9);
});

test('upkeep can exhaust a treasury and pause every queue until income recovers',()=>{
 const e=fresh(),s=e.state,player=s.players[0],home=s.provinces.find(p=>p.owner===0);
 const extra=s.provinces.find(p=>p.owner===-1&&MAP[p.id].playable);
 extra.owner=0;
 const field=s.units.filter(u=>u.owner===-1&&u.province!==extra.id).slice(0,22);
 for(const unit of field)unit.owner=0;
 Object.assign(field[0],{armyStatus:'sea',transport:{from:home.id,to:extra.id,index:0,embarked:true}});
 const garrison=s.units.find(u=>u.owner===0&&u.province===home.id);
 s.units=[...field,garrison];
 Object.assign(home,{production:29.99});extra.production=12;
 player.funds=0.001;
 const budget=dailyFundsBreakdown(s,0);
 assert.equal(budget.regions,2);
 assert.ok(Math.abs(budget.upkeep-2.3)<1e-9);
 assert.ok(Math.abs(budget.net+0.3)<1e-9);
 const otherFunds=s.players[1].funds;
 e.step(3);
 assert.equal(player.funds,0);
 assert.equal(s.units.length,23);
 assert.equal(home.production,29.99);
 assert.equal(extra.production,12);
 assert.ok(s.players[1].funds>otherFunds);
 home.construction={kind:'market',level:1};
 const nextNet=dailyFundsBreakdown(s,0).net;
 e.step();
 assert.ok(Math.abs(player.funds-DT*nextNet)<1e-9);
 assert.equal(s.units.filter(u=>u.owner===0).length,24);
 assert.ok(home.production<1);
 assert.ok(extra.production>12);
});

test('current saves and LAN use unified funds while isolating v5 storage',()=>{
 const s=fresh().state;
 const legacy=structuredClone(s);
 legacy.version=5;
 for(const p of legacy.players){delete p.funds;p.gold=120;p.constructionFunds=64;}
 const oldSlot='rouge.save.natural-earth-admin1.regions.v5.same',body=JSON.stringify(legacy);
 const old=JSON.stringify({...JSON.parse(encodeSave(s,'New')),name:'Old',body,hash:checksum(body)});
 assert.equal(s.map,MAP_ID);assert.equal(s.version,STATE_VERSION);
 assert.equal(validateState(legacy),false);assert.throws(()=>decodeSave(old),/invalidSave/);
 assert.throws(()=>applyFrame(null,{type:'state',state:legacy}),/incompatibleMap/);
 const data=new Map([[oldSlot,old],[oldSlot+'.backup',old]]);
 const storage={get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 assert.deepEqual(listSaves(storage),[]);
 assert.throws(()=>readSave(storage,'same'),/invalidSave/);
 writeSave(storage,'same',s,'New');
 assert.equal(listSaves(storage)[0].name,'New');
 assert.equal(readSave(storage,'same').state.players[0].funds,STARTING_FUNDS);
 assert.equal(data.get(oldSlot),old);assert.equal(data.get(oldSlot+'.backup'),old);assert.ok(data.has(SAVE_PREFIX+'same'));
 assert.deepEqual(applyFrame(null,encodeFrame(s).frame),s);
});
