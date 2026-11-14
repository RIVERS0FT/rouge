import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {decodeSave,encodeSave,validateState} from '../src/game/save.ts';
import {talentRerollCost} from '../src/game/talentReroll.ts';
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
 assert.equal(p.funds,154);assert.equal(p.rerollsUsed,1);assert.equal(p.drafts,1);
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
 assert.equal(p.funds,99);assert.equal(p.rerollsUsed,2);
 const after=applyFrame(receiver,encodeFrame(e.state,firstFrame.base,0).frame);
 assert.equal(after.players[0].funds,99);assert.equal(talentRerollCost(after.players[0]),70);
 assert.deepEqual(after.players[0].choices,p.choices);
 p.funds=69;const before=structuredClone(e.state);
 assert.deepEqual(e.command(0,{type:'reroll',expectedCost:70}),{ok:false,error:'noFunds'});
 assert.deepEqual(e.command(0,{type:'reroll',expectedCost:-1}),{ok:false,error:'invalidCommand'});
 assert.deepEqual(e.state,before);
 assert.deepEqual(decodeSave(encodeSave(e.state,'Paid rerolls')).state,e.state);
});

test('old free-roll records and invalid current counters are rejected',()=>{
 const state=createGame(setups,42),old=state.players[0];
 delete old.rerollsUsed;old.rerolls=0;
 assert.equal(validateState(state),false);assert.throws(()=>encodeSave(state,'Old'),/invalidSave/);
 old.rerollsUsed=1;assert.equal(validateState(state),false);
 delete old.rerolls;old.rerollsUsed=-1;assert.equal(validateState(state),false);
 old.rerollsUsed=1;assert.equal(decodeSave(encodeSave(state,'Current')).state.players[0].rerollsUsed,1);
});
