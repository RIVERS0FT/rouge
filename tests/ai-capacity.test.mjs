import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine,MARCH_INTERVAL_TICKS} from '../src/game/engine.ts';
import {MAP,provinceByCode} from '../src/game/map.ts';
import {regionCapacity,reconcileGrouping} from '../src/game/territoryEconomy.ts';
import {stats} from '../src/game/content.ts';
import {BALANCE} from '../src/game/balance.ts';
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
test('AI takes an empty neighbour with a small detachment and keeps the rest of the garrison home',()=>{
 const {engine,home}=fixture(12,4),s=engine.state,detachment=BALANCE.ai.detachment;
 const atHome=()=>s.units.filter(u=>u.owner===1&&u.province===home.id&&u.target===null&&!u.armyStatus).length;
 engine.step(79);assert.equal(s.armies.length,0);
 engine.step();
 const army=s.armies.find(a=>a.owner===1);
 assert.ok(army&&home.neighbors.includes(army.to));
 assert.equal(s.provinces[army.to].owner,-1);
 assert.equal(s.provinces[home.id].march?.pendingIds.length,detachment);
 assert.equal(atHome(),4-detachment);
 for(let i=0;i<20*MARCH_INTERVAL_TICKS&&s.provinces[home.id].march;i++)engine.step();
 assert.equal(s.provinces[home.id].march,undefined);
 assert.equal(s.units.filter(u=>u.owner===1&&u.target===army.to).length,detachment);
 assert.equal(atHome(),4-detachment);
 assert.ok(validateState(s));
});
test('AI orders are ordinary commands: a player sending the same ones gets the same campaign',()=>{
 const {engine}=fixture(12,4),twin=new Engine(structuredClone(engine.state));
 twin.state.players[1].ai=false;
 const issued=[],submit=engine.command.bind(engine);
 engine.command=(actor,command)=>{const result=submit(actor,command);issued.push({actor,command,result});return result;};
 engine.step(80);twin.step(80);
 assert.ok(issued.some(({command})=>command.type==='march'));
 for(const {actor,command,result} of issued)assert.deepEqual(twin.command(actor,command),result);
 twin.state.players[1].ai=true;
 assert.deepEqual(twin.state,engine.state);
 // The same departures, tick by tick, until the next AI turn.
 for(let i=0;i<60;i++){engine.step();twin.step();assert.deepEqual(twin.state,engine.state);}
 const action=issued.find(({command})=>command.type==='march').command;
 for(const subject of [engine,twin]){
  const before=structuredClone(subject.state);
  assert.deepEqual(subject.command(-1,action),{ok:false,error:'notPlaying'});
  assert.deepEqual(subject.command(0,action),{ok:false,error:'notOwner'});
  assert.deepEqual(subject.command(1,{...action,fraction:.6}),{ok:false,error:'invalidCommand'});
  assert.deepEqual(subject.state,before);
 }
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
