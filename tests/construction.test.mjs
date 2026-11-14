import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Engine,createGame} from '../src/game/engine.ts';
import {MAP} from '../src/game/map.ts';
import {CONSTRUCTION,CONSTRUCTION_KINDS,STARTING_FUNDS,availableFunds,fundsIncomeRate,recoveryMultiplier} from '../src/game/construction.ts';
import {DT} from '../src/game/content.ts';
import {decodeSave,encodeSave,validateState} from '../src/game/save.ts';
import {regionProductionRate,reconcileGrouping} from '../src/game/territoryEconomy.ts';
import {applyFrame,encodeFrame} from '../src/platform/replication.ts';

const setups=[{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'steward',loadout:['infantry']}];
const initial=createGame(setups,1234);
const home=initial.provinces.find(p=>p.owner===0).id;
const enemy=initial.provinces.find(p=>p.owner===1).id;
const adjacent=MAP[home].neighbors.find(id=>initial.provinces[id].owner!==1&&MAP[id].playable);
const fresh=()=>new Engine(initial);
const expectClose=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≠ ${b}`);
const order=(province,kind,expectedLevel=0)=>({type:'construct',province,kind,expectedLevel});
const wire=frame=>JSON.parse(JSON.stringify(frame));

test('each initial facility is affordable from shared funds; one slot, two levels and no stale upgrades',()=>{
 for(const kind of CONSTRUCTION_KINDS){
  const e=fresh(),p=e.state.players[0],slot=e.state.provinces[home];
  assert.equal(availableFunds(e.state,0),STARTING_FUNDS);
  assert.deepEqual(e.command(0,order(home,kind)),{ok:true});
  assert.deepEqual(slot.construction,{kind,level:1});
  assert.equal(p.funds,STARTING_FUNDS-CONSTRUCTION[kind].costs[0]);
  p.funds=CONSTRUCTION[kind].costs[1]-1;
  const before=structuredClone(e.state);
  assert.deepEqual(e.command(0,order(home,kind)),{ok:false,error:'constructionChanged'});
  const other=CONSTRUCTION_KINDS.find(k=>k!==kind);
  assert.deepEqual(e.command(0,order(home,other)),{ok:false,error:'slotOccupied'});
  assert.deepEqual(e.command(0,order(home,kind,1)),{ok:false,error:'noFunds'});
  assert.deepEqual(e.state,before);
  p.funds=200;
  assert.deepEqual(e.command(0,order(home,kind,1)),{ok:true});
  assert.deepEqual(slot.construction,{kind,level:2});
  assert.equal(p.funds,200-CONSTRUCTION[kind].costs[1]);
  assert.deepEqual(e.command(0,order(home,kind,1)),{ok:false,error:'maxLevel'});
 }
});

test('host rejects invalid or hostile territory, forged kind/level, and building under occupation',()=>{
 const e=fresh(),notPlayable=MAP.find(p=>!p.playable).id;
 e.state.provinces[home].capture=1;e.state.provinces[home].captor=1;
 const before=structuredClone(e.state);
 for(const [command,error] of [
  [order(enemy,'market'),'notOwner'],[order(notPlayable,'market'),'notOwner'],
  [order(home+.5,'market'),'invalidCommand'],[order(home,'__proto__'),'invalidCommand'],
  [order(home,'market',2),'invalidCommand'],[order(home,'market'),'constructionContested'],
 ])assert.deepEqual(e.command(0,command),{ok:false,error});
 assert.deepEqual(e.state,before);
});

test('a market augments shared funds income; a barracks augments only local production',()=>{
 const a=fresh(),market=fresh(),barracks=fresh();
 for(const e of [a,market,barracks])e.state.units=[];
 assert.equal(market.command(0,order(home,'market')).ok,true);
 assert.equal(barracks.command(0,order(home,'barracks')).ok,true);
 const mb=market.state.players[0].funds,ab=a.state.players[0].funds;
 for(const e of [a,market,barracks])e.step(20);
 expectClose(market.state.players[0].funds-mb-(a.state.players[0].funds-ab),regionProductionRate(home)*CONSTRUCTION.market.benefits[0]);
 for(const tile of a.state.provinces){
  expectClose(market.state.provinces[tile.id].production,tile.production);
  expectClose(barracks.state.provinces[tile.id].production,tile.production*(tile.id===home?1.25:1));
 }
});

test('fortress slows only post-combat capture; ownership change retains facilities and gradually restores output',()=>{
 const normal=fresh(),fort=fresh();
 for(const e of [normal,fort]){
  // This fixture represents a mid-game attack, not conquest of the last tile.
  e.state.provinces[adjacent].owner=0;
  const v=e.state.units.find(u=>u.owner===0&&u.province===home);
  assert.ok(v&&Math.hypot(v.x-MAP[home].center.x,v.z-MAP[home].center.z)<3.7);
  e.state.units=[{...v,owner:1}];
 }
 assert.equal(fort.command(0,order(home,'fortress')).ok,true);
 assert.equal(normal.command(0,order(home,'market')).ok,true);
 normal.step(20);fort.step(20);
 const n=normal.state.provinces[home],f=fort.state.provinces[home];
 expectClose(n.capture,1);expectClose(f.capture,.8);
 normal.step(145);fort.step(145);
 assert.equal(n.owner,1);
 assert.deepEqual(n.construction,{kind:'market',level:1});
 assert.ok(n.recovery>14&&n.recovery<15);
 assert.equal(f.owner,0);
 fort.step(40);assert.equal(f.owner,1);
 const start=fundsIncomeRate(n,1);
 normal.step(150);
 const midway=fundsIncomeRate(n,1);
 assert.ok(start<midway&&midway<1.75);
 normal.step(150);
 assert.equal(n.recovery,0);
 expectClose(recoveryMultiplier(n.recovery),1);
 expectClose(fundsIncomeRate(n,1),1.75);
});

test('merge and split can never grant a duplicate construction slot or funds',()=>{
 const e=fresh(),p=e.state.players[0],slots=e.state.provinces;
 assert.ok(adjacent!==undefined);
 slots[adjacent].owner=0;e.state.grouping=reconcileGrouping(e.state);
 p.funds=200;
 assert.equal(e.command(0,order(home,'market')).ok,true);
 assert.equal(e.command(0,order(adjacent,'barracks')).ok,true);
 const a=MAP[home].code,b=MAP[adjacent].code,started=structuredClone(e.state);
 const merge={type:'mergeGroups',groups:[e.state.grouping.atomToGroup[a],e.state.grouping.atomToGroup[b]],expectedRevision:e.state.grouping.revision};
 assert.deepEqual(e.command(0,merge),{ok:true});
 assert.equal(e.state.grouping.atomToGroup[a],e.state.grouping.atomToGroup[b]);
 const control=new Engine(started);control.step(1);e.step(1);
 expectClose(p.funds,control.state.players[0].funds);
 assert.deepEqual(e.command(0,{type:'splitGroup',group:e.state.grouping.atomToGroup[a],atoms:[b],expectedRevision:e.state.grouping.revision}),{ok:true});
 assert.notEqual(e.state.grouping.atomToGroup[a],e.state.grouping.atomToGroup[b]);
 expectClose(p.funds,control.state.players[0].funds);
 assert.deepEqual(slots[home].construction,{kind:'market',level:1});
 assert.deepEqual(slots[adjacent].construction,{kind:'barracks',level:1});
 assert.equal(e.command(0,order(home,'fortress')).ok,false);
});

test('current saves require shared funds, retain progression, and reject corrupt facilities',()=>{
 const legacy=structuredClone(initial);
 for(const p of legacy.players)delete p.funds;
 assert.equal(validateState(legacy),false);assert.throws(()=>encodeSave(legacy,'old'),/invalidSave/);
 const e=new Engine(decodeSave(encodeSave(initial,'current')).state);
 assert.equal(availableFunds(e.state,0),STARTING_FUNDS);
 assert.equal(e.command(0,order(home,'market')).ok,true);
 const roundtrip=decodeSave(encodeSave(e.state,'new')).state;
 assert.deepEqual(roundtrip,e.state);
 const again=new Engine(roundtrip);
 again.step(1);
 expectClose(again.state.players[0].funds,e.state.players[0].funds+DT*e.state.provinces.filter(p=>p.owner===0).reduce((sum,p)=>sum+fundsIncomeRate(p,regionProductionRate(p.id)),0));
 roundtrip.provinces[home].construction.level=3;
 assert.equal(validateState(roundtrip),false);
});

test('same-tick LAN build and upgrade deltas preserve prior snapshots and reconnect state',()=>{
 const e=fresh(),p=e.state.players[0];p.funds=200;
 const first=encodeFrame(e.state,undefined,0),previous=applyFrame(null,wire(first.frame));
 assert.equal(e.command(0,order(home,'market')).ok,true);
 const second=encodeFrame(e.state,first.base,0);
 assert.deepEqual(second.frame.provinces.map(p=>p.id),[home]);
 const placed=applyFrame(previous,wire(second.frame));
 assert.equal(e.command(0,order(home,'market',1)).ok,true);
 const third=encodeFrame(e.state,second.base,0);
 assert.deepEqual(third.frame.provinces.map(p=>p.id),[home]);
 const upgraded=applyFrame(placed,wire(third.frame));
 assert.equal(previous.provinces[home].construction,undefined);
 assert.deepEqual(placed.provinces[home].construction,{kind:'market',level:1});
 assert.deepEqual(upgraded,e.state);
 assert.deepEqual(applyFrame(null,wire(encodeFrame(e.state,undefined,0).frame)),upgraded);
});
