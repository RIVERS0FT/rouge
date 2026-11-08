import test from 'node:test';
import assert from 'node:assert/strict';
import { commanderIdentity, isFlagCode, FLAG_SPECS, leaderProgress } from '../src/ui/commanderIdentity.ts';
import { createGame } from '../src/game/engine.ts';
import { encodeSave, decodeSave } from '../src/game/save.ts';
import { encodeFrame, applyFrame } from '../src/platform/replication.ts';
import { STARTS, MAP } from '../src/game/map.ts';
const setup = ['warden','vanguard','steward','warden'].map((leader,i)=>({name:`Seat ${i}`,leader,loadout:['infantry']}));

test('each player flag comes from their fixed homeland, never current selection or conquered land',()=>{
  const state=createGame(setup),before=JSON.stringify(state);
  assert.deepEqual(state.players.map(p=>commanderIdentity(p.id).country),['DEU','DEU','FRA','POL']);
  state.players.forEach(p=>assert.equal(commanderIdentity(p.id).home,STARTS[p.id]));
  assert.equal(JSON.stringify(state),before);
  state.provinces[STARTS[0]].owner=1;
  assert.equal(commanderIdentity(0).country,'DEU');
  assert.equal(commanderIdentity(2).country,'FRA');
  assert.equal(MAP[commanderIdentity(3).home].country,'POL');
});
test('missing actors use an explicit neutral fallback; arbitrary object keys cannot be flags',()=>{
  for(const actor of [-1,1.5,NaN,4,10000])assert.equal(commanderIdentity(actor).home,null);
  assert.equal(isFlagCode('DEU'),true);
  for(const code of ['constructor','__proto__','XXX',''])assert.equal(isFlagCode(code),false);
});
test('three supported flags retain their stripe orientation, order and proportions',()=>{
  assert.equal(FLAG_SPECS.DEU.axis,'horizontal');assert.deepEqual(FLAG_SPECS.DEU.colors,['#000000','#DD0000','#FFCE00']);
  assert.equal(FLAG_SPECS.FRA.axis,'vertical');assert.equal(FLAG_SPECS.FRA.width/FLAG_SPECS.FRA.height,1.5);
  assert.equal(FLAG_SPECS.POL.axis,'horizontal');assert.equal(FLAG_SPECS.POL.colors[0],'#FFFFFF');
  assert.equal(FLAG_SPECS.POL.width/FLAG_SPECS.POL.height,1.6);
});
test('commander experience is bounded and shows full progress at level cap',()=>{
  assert.deepEqual(leaderProgress({level:1,xp:0}),{maximum:105,value:0,percent:0,complete:false});
  assert.equal(leaderProgress({level:1,xp:52.5}).percent,50);
  assert.equal(leaderProgress({level:1,xp:999}).percent,100);
  assert.equal(leaderProgress({level:8,xp:0}).percent,100);
  assert.equal(leaderProgress({level:8,xp:0}).complete,true);
});
test('HUD additions preserve v0.4 saves and LAN actors without altering game state',()=>{
  const state=createGame(setup),restored=decodeSave(encodeSave(state,'Existing campaign')).state;
  assert.equal(restored.version,4);
  assert.equal(restored.map,'earth-admin1-miller-crop-v1');
  assert.deepEqual(restored,state);
  for(let actor=0;actor<4;actor++) {
    const remote=applyFrame(null,encodeFrame(restored,undefined,actor).frame);
    assert.equal(remote.players[actor].leader,setup[actor].leader);
    assert.equal(commanderIdentity(remote.players[actor].id).country,commanderIdentity(actor).country);
  }
});
