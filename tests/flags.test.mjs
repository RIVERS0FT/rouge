import test from 'node:test';
import assert from 'node:assert/strict';
import {validFlag,FLAG_PRESETS,FLAG_PATTERNS} from '../src/game/flags.ts';
import {createGame,Engine} from '../src/game/engine.ts';
import {validateSetup,stats,LEADERS} from '../src/game/content.ts';
import {encodeSave,decodeSave,validateState} from '../src/game/save.ts';
import {encodeFrame,applyFrame} from '../src/platform/replication.ts';
const setup={name:'Player',leader:'warden',loadout:['infantry']};
const custom={type:'custom',pattern:'cross',colors:['#123456','#abcdef','#FFFFFF']};
test('bounded preset and editor flags accept only safe known values',()=>{
 for(const id of FLAG_PRESETS)assert.ok(validFlag({type:'preset',id}));
 for(const pattern of FLAG_PATTERNS)assert.ok(validFlag({...custom,pattern}));
 for(const flag of [null,{}, {type:'preset',id:'unknown'}, {...custom,pattern:'url'}, {...custom,colors:['red','white','blue']},{...custom,colors:['#abcdef']},{...custom,html:'<script>'}]){assert.equal(validFlag(flag),false);assert.equal(validateSetup({...setup,flag}),false);}
});
test('flags survive saves, full and delta LAN frames without sharing setup references',()=>{
 const state=createGame([{...setup,flag:custom},{...setup,name:'Other',flag:{type:'preset',id:'jp'}}]);
 assert.notEqual(state.players[0].flag,custom);assert.deepEqual(state.players[0].flag,custom);
 const restored=decodeSave(encodeSave(state,'Flag')).state;assert.deepEqual(restored.players,state.players);
 const first=encodeFrame(state,undefined,0),remote=applyFrame(null,first.frame);
 const next=structuredClone(state);next.tick++;const updated=applyFrame(remote,encodeFrame(next,first.base,0).frame);
 assert.deepEqual(updated.players[0].flag,custom);
 next.players[0].flag={...custom,colors:['bad']};assert.equal(validateState(next),false);
});
test('old saves without flags stay readable; all leader identities have identical stats and recovery',()=>{
 const state=createGame([setup,{...setup,name:'Other'}]);assert.equal(state.players[0].flag,undefined);assert.ok(decodeSave(encodeSave(state,'Old')));
 const baseline=stats(state.players[0],'infantry');
 for(const leader of LEADERS){const copy=structuredClone(state);copy.players[0].leader=leader;assert.deepEqual(stats(copy.players[0],'infantry'),baseline);const p=copy.provinces.find(p=>p.owner===0);p.recovery=10;const engine=new Engine(copy);engine.step(1);assert.equal(engine.state.provinces[p.id].recovery,9.95);}
});
