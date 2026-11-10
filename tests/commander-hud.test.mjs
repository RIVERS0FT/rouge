import test from 'node:test';
import assert from 'node:assert/strict';
import {commanderIdentity,leaderProgress} from '../src/ui/commanderIdentity.ts';
import {createGame} from '../src/game/engine.ts';
import {encodeSave,decodeSave,validateState} from '../src/game/save.ts';
import {encodeFrame,applyFrame} from '../src/platform/replication.ts';
import {STARTS,MAP} from '../src/game/map.ts';
const setup=['warden','vanguard','steward','warden'].map((leader,i)=>({name:`Seat ${i}`,leader,loadout:['infantry']}));
test('player identity has no country; changing ownership never changes the local faction',()=>{
 const state=createGame(setup),before=JSON.stringify(state);
 state.players.forEach(p=>{const identity=commanderIdentity(p.id);assert.equal(identity.home,null);assert.equal(identity.actor,p.id);assert.equal('country' in identity,false);});
 assert.equal(JSON.stringify(state),before);state.provinces[STARTS[0]].owner=1;
 assert.equal(commanderIdentity(0).names[1],'Faction 1');assert.equal(commanderIdentity(2).names[0],'阵营 3');
});
test('unknown seats have an explicit neutral identity',()=>{
 for(const actor of [-1,1.5,NaN,4,10000])assert.equal(commanderIdentity(actor).home,null);
});
test('all management definitions omit national identity and national palette fields',()=>{
 for(const p of MAP)for(const key of ['country','countryName','flag','nation'])assert.equal(key in p,false);
});
test('commander experience is bounded and shows full progress at level cap',()=>{
 assert.deepEqual(leaderProgress({level:1,xp:0}),{maximum:105,value:0,percent:0,complete:false});
 assert.equal(leaderProgress({level:1,xp:52.5}).percent,50);assert.equal(leaderProgress({level:1,xp:999}).percent,100);
 assert.equal(leaderProgress({level:8,xp:0}).percent,100);assert.equal(leaderProgress({level:8,xp:0}).complete,true);
});
test('state-region saves and LAN keep local actors while rejecting the old administrative atlas',()=>{
 const state=createGame(setup),restored=decodeSave(encodeSave(state,'Regions')).state;
 assert.equal(restored.version,5);assert.equal(restored.map,'earth-natural-earth-admin1-511-v1');assert.deepEqual(restored,state);
 assert.equal(validateState({...restored,version:4,map:'earth-admin1-miller-crop-v1'}),false);
 for(let actor=0;actor<4;actor++){const remote=applyFrame(null,encodeFrame(restored,undefined,actor).frame);assert.equal(remote.players[actor].leader,setup[actor].leader);}
});
