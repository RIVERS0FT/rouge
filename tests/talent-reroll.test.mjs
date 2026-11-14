import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {decodeSave,encodeSave,validateState} from '../src/game/save.ts';
import {talentRerollCost,talentRerollsUsed} from '../src/game/talentReroll.ts';
import {applyFrame,encodeFrame} from '../src/platform/replication.ts';

const setups=[{name:'Reroll',leader:'warden',loadout:['infantry']},{name:'Opponent',leader:'steward',loadout:['infantry']}];
const choices=['industry','forcedMarch','entrenchment'];
const pending=(p,level=2)=>Object.assign(p,{level,drafts:1,choices:[...choices]});

test('paid rerolls use current leader level and successful lifetime count; stale quotes do not charge twice',()=>{
 const e=new Engine(createGame(setups,42)),p=e.state.players[0];
 const initial=structuredClone(p);
 assert.deepEqual(e.command(0,{type:'reroll'}),{ok:false,error:'noTalentReroll'});
 assert.deepEqual(p,initial);
 pending(p);
 assert.equal(talentRerollCost(p),30);
 assert.deepEqual(e.command(0,{type:'reroll',expectedCost:30}),{ok:true});
 assert.equal(p.gold,90);assert.equal(p.rerollsUsed,1);assert.equal(p.drafts,1);
 assert.equal(p.choices.length,3);assert.ok(p.choices.some(id=>!choices.includes(id)));
 const stale=structuredClone(p),rng=e.state.rng;
 assert.deepEqual(e.command(0,{type:'reroll',expectedCost:30}),{ok:false,error:'talentRerollPriceChanged'});
 assert.deepEqual(p,stale);assert.equal(e.state.rng,rng);
 assert.equal(talentRerollCost(p),45);
 assert.deepEqual(e.command(0,{type:'talent',id:p.choices[0]}),{ok:true});
 pending(p,3);p.choices=p.choices.filter(id=>!p.talents.includes(id));
 assert.equal(talentRerollCost(p),55);
 const firstFrame=encodeFrame(e.state,undefined,0);
 const receiver=applyFrame(null,firstFrame.frame);
 assert.deepEqual(e.command(0,{type:'reroll',expectedCost:55}),{ok:true});
 assert.equal(p.gold,35);assert.equal(p.rerollsUsed,2);
 const after=applyFrame(receiver,encodeFrame(e.state,firstFrame.base,0).frame);
 assert.equal(after.players[0].gold,35);assert.equal(talentRerollCost(after.players[0]),70);
 assert.deepEqual(after.players[0].choices,p.choices);
 const before=structuredClone(e.state);
 assert.deepEqual(e.command(0,{type:'reroll',expectedCost:70}),{ok:false,error:'noGold'});
 assert.deepEqual(e.command(0,{type:'reroll',expectedCost:-1}),{ok:false,error:'invalidCommand'});
 assert.deepEqual(e.state,before);
 assert.deepEqual(decodeSave(encodeSave(e.state,'Paid rerolls')).state,e.state);
});

test('legacy saves retain the one recorded historical reroll and reject invalid new counters',()=>{
 const state=createGame(setups,42),old=pending(state.players[0]);
 delete old.rerollsUsed;old.rerolls=0;
 assert.ok(validateState(state));const raw=encodeSave(state,'Legacy free roll');
 const saved=decodeSave(raw).state;assert.deepEqual(saved,state);assert.equal(talentRerollsUsed(saved.players[0]),1);
 const e=new Engine(saved);
 assert.deepEqual(e.command(0,{type:'reroll',expectedCost:45}),{ok:true});
 assert.equal(e.state.players[0].rerollsUsed,2);assert.equal(e.state.players[0].rerolls,undefined);
 old.rerolls=1;assert.equal(talentRerollCost(old),30);
 delete old.rerolls;old.rerollsUsed=-1;assert.equal(validateState(state),false);
});

test('a draft without alternative talents cannot take gold or consume a reroll',()=>{
 const e=new Engine(createGame(setups,42)),p=pending(e.state.players[0],5);
 p.talents=['veterans','logistics','conqueror'];
 const before=structuredClone(e.state);
 assert.deepEqual(e.command(0,{type:'reroll',expectedCost:60}),{ok:false,error:'noTalentReroll'});
 assert.deepEqual(e.state,before);
});
