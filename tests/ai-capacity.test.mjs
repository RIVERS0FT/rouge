import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {MAP,provinceByCode} from '../src/game/map.ts';
import {regionCapacity,reconcileGrouping} from '../src/game/territoryEconomy.ts';
import {stats} from '../src/game/content.ts';
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
for(const capacity of [1,2,3])test(`AI dispatches from a full capacity-${capacity} atom`,()=>{
 const {engine,home}=fixture(capacity,capacity);
 engine.step(79);assert.ok(engine.state.units.every(u=>u.target===null));
 engine.step();
 const sent=engine.state.units.filter(u=>u.target!==null);
 assert.ok(sent.length>=1,'A full small garrison must not stay permanently idle');
 assert.ok(sent.every(u=>u.origin===home.id&&u.travel&&u.target!==home.id));
 if(capacity===1)assert.equal(sent.length,1);
 assert.ok(validateState(engine.state));
});
for(const capacity of [4,12])test(`AI keeps four-troop threshold and 75% dispatch at capacity ${capacity}`,()=>{
 const waiting=fixture(capacity,3).engine;waiting.step(80);
 assert.ok(waiting.state.units.every(u=>u.target===null));
 const ready=fixture(capacity,4).engine;ready.step(80);
 assert.equal(ready.state.units.filter(u=>u.target!==null).length,3);
 assert.ok(validateState(ready.state));
});

test('AI factions act on deterministic staggered phases, once each per 80 ticks',()=>{
 const s=createGame(Array.from({length:8},(_,id)=>({name:`Faction ${id}`,leader:'warden',loadout:['infantry'],ai:id>0})),21,'ai-staggered');
 s.units=[];
 for(const p of s.players){p.gold=0;p.choices=['industry'];p.drafts=1;}
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
