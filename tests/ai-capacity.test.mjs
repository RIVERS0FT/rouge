import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine,MARCH_INTERVAL_TICKS} from '../src/game/engine.ts';
import {countryActions} from '../src/game/countryActions.ts';
import {MAP,provinceByCode} from '../src/game/map.ts';
import {regionCapacity,reconcileGrouping} from '../src/game/territoryEconomy.ts';
import {stats} from '../src/game/content.ts';
import {regionTroops} from '../src/game/capacity.ts';
import {validateState} from '../src/game/save.ts';

const initial=createGame([
 {name:'Human',leader:'warden',loadout:['infantry']},
 {name:'AI',leader:'warden',loadout:['infantry'],ai:true},
],21,'ai-small-capacity');
function fixture(capacity,count){
 const s=structuredClone(initial);s.units=[];
 for(const p of s.provinces){p.owner=-1;p.production=0;p.kind='infantry';}
 const home=MAP.find(p=>p.playable&&regionCapacity(p.id)===capacity&&p.neighbors.length>0);
 assert.ok(home);s.provinces[home.id].owner=1;
 s.provinces[provinceByCode('USA-3521')].owner=0;
 s.grouping=reconcileGrouping(s);
 for(let i=0;i<count;i++)s.units.push({id:s.nextId++,owner:1,kind:'infantry',...home.center,hp:stats(s.players[1],'infantry').hp,province:home.id,origin:home.id,target:null,destination:null,route:[],cooldown:0});
 return {engine:new Engine(s),home};
}
test('preprocessed game regions have full budgets, never one-slot raw-atom garrisons',()=>{
 for(const p of MAP)assert.equal(regionCapacity(p.id),p.playable?12:0);
});
test('AI waits for four troops then sends every available troop at the shared march interval',()=>{
 const {engine:waiting,home:waitingHome}=fixture(12,3);waiting.step(80);
 assert.ok(waiting.state.units.every(u=>u.target===null));
 assert.equal(waiting.state.provinces[waitingHome.id].march,undefined);
 const {engine:ready,home}=fixture(12,4);
 const sent=()=>ready.state.units.filter(u=>u.target!==null);
 const pending=()=>ready.state.provinces[home.id].march?.pendingIds;
 ready.step(80);
 assert.equal(sent().length,1);
 const destination=sent()[0].target,queued=pending();
 assert.equal(queued.length,3);
 assert.equal(ready.state.units.filter(u=>u.target===null&&u.province===home.id).length,3);
 ready.step(MARCH_INTERVAL_TICKS-1);
 assert.equal(sent().length,1);assert.deepEqual(pending(),queued);
 ready.step();assert.equal(sent().length,2);assert.deepEqual(pending(),queued.slice(1));
 ready.step(MARCH_INTERVAL_TICKS);assert.equal(sent().length,3);assert.deepEqual(pending(),queued.slice(2));
 ready.step(MARCH_INTERVAL_TICKS-1);assert.equal(sent().length,3);
 ready.step();assert.equal(sent().length,4);
 assert.ok(sent().every(u=>u.target===destination));
 assert.equal(pending(),undefined);
 assert.equal(ready.state.units.filter(u=>u.target===null&&u.province===home.id).length,0);
 assert.ok(validateState(ready.state));
});

test('AI sends the same full march command as the player and sends all troops to a full friendly region',()=>{
 const {engine,home}=fixture(12,4);
 const s=engine.state,homeNeighbors=new Set(home.neighbors);
 for(const id of homeNeighbors)s.provinces[id].owner=1;
 const to=home.neighbors.find(id=>MAP[id].neighbors.some(n=>s.provinces[n].owner!==1));
 assert.notEqual(to,undefined);
 s.grouping=reconcileGrouping(s);
 const template=s.units[0];
 for(let i=0;i<regionCapacity(to);i++)s.units.push({...template,id:s.nextId++,...MAP[to].center,province:to,origin:to});
 assert.equal(regionTroops(s,1,to),regionCapacity(to));
 const playerEngine=new Engine(s);
 playerEngine.state.players[1].ai=false;
 const submit=engine.command.bind(engine);
 let observed;
 engine.command=(actor,command)=>{
  if(command.type!=='march'||command.from!==home.id)return submit(actor,command);
  const result=submit(actor,command);
  if(result.ok)observed={actor,command,result,order:structuredClone(s.provinces[home.id].march)};
  return result;
 };
 engine.step(80);
 const action=countryActions.march(home.id,to);
 assert.deepEqual(observed?.command,action);
 playerEngine.step(80);
 assert.deepEqual(playerEngine.command(1,action),{ok:true});
 const released=state=>state.units.filter(u=>u.origin===home.id&&u.target!==null).map(u=>[u.id,u.target]);
 assert.deepEqual(released(playerEngine.state),released(s));
 assert.deepEqual(playerEngine.state.provinces[home.id].march,observed.order);
 const saved=structuredClone(playerEngine.state),aiState=structuredClone(s);
 for(const [subject,before] of [[playerEngine,saved],[engine,aiState]]){
  assert.deepEqual(subject.command(-1,action),{ok:false,error:'notPlaying'});
  assert.deepEqual(subject.command(0,action),{ok:false,error:'notOwner'});
  assert.deepEqual(subject.command(1,{...action,fraction:.5}),{ok:false,error:'invalidCommand'});
  assert.deepEqual(subject.state,before);
 }
 assert.equal(observed.actor,1);
 assert.deepEqual(observed.result,{ok:true});
 assert.equal(observed.order.reserved,true);
 assert.equal(observed.order.pendingIds.length,3);
 const sent=()=>s.units.filter(u=>u.origin===home.id&&u.target===to);
 assert.equal(sent().length,1);
 engine.step(MARCH_INTERVAL_TICKS-1);playerEngine.step(MARCH_INTERVAL_TICKS-1);assert.equal(sent().length,1);
 engine.step();playerEngine.step();assert.equal(sent().length,2);
 engine.step(2*MARCH_INTERVAL_TICKS);playerEngine.step(2*MARCH_INTERVAL_TICKS);assert.equal(sent().length,4);
 assert.deepEqual(released(playerEngine.state),released(s));
 assert.equal(s.provinces[home.id].march,undefined);
});

test('AI factions act on deterministic staggered phases, once each per 80 ticks',()=>{
 const s=createGame(Array.from({length:8},(_,id)=>({name:`Faction ${id}`,leader:'warden',loadout:['infantry'],ai:id>0})),21,'ai-staggered');
 s.units=[];
 for(const p of s.players){p.funds=0;p.choices=['industry'];p.drafts=1;}
 const e=new Engine(s),replica=new Engine(structuredClone(s));
 e.step(79);assert.ok(e.state.players.every(p=>p.choices.length===1));
 for(let actor=1;actor<8;actor++){
  e.step();
  assert.deepEqual(e.state.players.filter(p=>p.talents.includes('industry')).map(p=>p.id),Array.from({length:actor},(_,i)=>i+1));
 }
 // Refill queues: no actor may run again before its next phase.
 for(const p of e.state.players){p.choices=['logistics'];p.drafts=1;}
 e.step(159-e.state.tick);assert.ok(e.state.players.every(p=>p.choices.length===1));
 for(let actor=1;actor<8;actor++){
  e.step();
  assert.deepEqual(e.state.players.filter(p=>p.talents.includes('logistics')).map(p=>p.id),Array.from({length:actor},(_,i)=>i+1));
 }
 // Equivalent step batching must not affect scheduling or RNG consumption.
 const comparison=new Engine(s);comparison.step(86);replica.step(79);replica.step(7);
 assert.deepEqual(replica.state,comparison.state);
});
