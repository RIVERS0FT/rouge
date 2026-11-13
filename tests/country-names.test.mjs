import {execFileSync} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {assignCountryNames,countryName,COUNTRY_FORMS,validCountryIdentity} from '../src/game/countryNames.ts';
import {createGame} from '../src/game/engine.ts';
import {MAP} from '../src/game/map.ts';
import {chooseSpawnPairs,makeAISetups,getSpawnCapacity} from '../src/game/spawns.ts';
import {encodeSave,decodeSave,validateState,checksum} from '../src/game/save.ts';
import {encodeFrame,applyFrame} from '../src/platform/replication.ts';
import {playerName} from '../src/ui/i18n.ts';
const human={name:'Alice 王',leader:'warden',loadout:['infantry']};
test('all AI countries use the allocated birthplace, while every human keeps their exact name',()=>{
 for(const seed of [0,42,1234]){
  const s=createGame([human,{...human,name:'Bob 的国'},...makeAISetups(12,seed)],seed),pairs=chooseSpawnPairs(seed,s.players.length);
  for(const p of s.players)for(const lang of ['zh','en']){
   if(!p.ai){assert.equal(playerName(lang,p),p.name);assert.equal(p.country,undefined);continue;}
   const origin=MAP[pairs[p.id][0]];assert.equal(p.country.origin,origin.code);
   assert.ok(countryName(lang,p).includes(origin.name[lang==='zh'?0:1]));assert.ok(validCountryIdentity(p.country));
   assert.equal(playerName(lang,p),countryName(lang,p));
  }
  assert.deepEqual(createGame([human,{...human,name:'Bob 的国'},...makeAISetups(12,seed)],seed).players,s.players);
 }
});
test('all available map spawns have localized roots; names never impose a seat cap',()=>{
 const pairs=chooseSpawnPairs(42,getSpawnCapacity()),players=pairs.map((_,id)=>({id,name:`AI ${id}`,ai:true}));
 assignCountryNames(players,pairs.map(p=>MAP[p[0]]));
 assert.equal(new Set(players.map(p=>p.country.name[0])).size,players.length);
 assert.equal(new Set(players.map(p=>p.country.name[1])).size,players.length);
 for(const p of players){assert.match(p.country.name[0],/\p{Script=Han}/u);assert.doesNotMatch(p.country.name[1],/\p{Script=Han}/u);}
});
test('repeated birthplaces use local variants then unlimited distinct suffixes, avoiding human collisions',()=>{
 const origin={...MAP[0],name:['海港','Harbor']},n=10000;
 const players=[{id:0,name:'海港共和国',ai:false},{id:1,name:'Kingdom of Harbor',ai:false},...Array.from({length:n},(_,i)=>({id:i+2,name:`AI ${i}`,ai:true}))];
 assignCountryNames(players,players.map(()=>origin));
 for(const lang of ['zh','en'])assert.equal(new Set(players.map(p=>countryName(lang,p))).size,players.length);
 assert.equal(players[2].country.name[1],'Federation of Harbor');
 assert.ok(players.at(-1).country.name[0].match(/\d+$/));assert.ok(COUNTRY_FORMS.length>=16);
 const before=structuredClone(players);assignCountryNames(players,players.map(()=>MAP[1]));assert.deepEqual(players,before);
});
test('missing geographic text has a localized fallback and identity validates strictly',()=>{
 const players=[{id:0,name:'AI',ai:true},{id:1,name:'AI',ai:true}];assignCountryNames(players,[undefined,{...MAP[0],name:['未命名地区 5','Unnamed region 5']}]);
 assert.equal(players[0].country.name[0],'新境共和国');assert.equal(players[1].country.name[1],'Kingdom of Newland');
 for(const value of [null,{}, {origin:'',name:['国','State']},{origin:'x',name:['国',3]},{origin:'x',name:['国','x'.repeat(161)]}])assert.equal(validCountryIdentity(value),false);
});
test('country names persist through saves, full and delta LAN frames and conquest',()=>{
 const state=createGame([human,{...human,name:'Bob'},...makeAISetups(3)],88),names=structuredClone(state.players.map(p=>p.country));
 assert.deepEqual(decodeSave(encodeSave(state,'Countries')).state,state);
 const full=encodeFrame(state,undefined,1),client=applyFrame(null,JSON.parse(JSON.stringify(full.frame)));
 state.tick++;const delta=encodeFrame(state,full.base,1),updated=applyFrame(client,JSON.parse(JSON.stringify(delta.frame)));
 assert.deepEqual(updated.players.map(p=>p.country),names);
 for(const p of state.provinces)if(p.owner===2)p.owner=3;
 assignCountryNames(state.players,state.players.map(()=>MAP[0]));assert.deepEqual(state.players.map(p=>p.country),names);
 const invalid=structuredClone(updated);invalid.players[0].country=invalid.players[2].country;assert.equal(countryName('zh',invalid.players[0]),human.name);invalid.players[2].country.name[0]='';assert.equal(validateState(invalid),false);
});
test('old v5 saves recover original birthplaces, not the territory held when loaded',()=>{
 const state=createGame([human,...makeAISetups(3)],71);const expected=state.players.map(p=>p.country);
 for(const p of state.players)delete p.country;
 const envelope=JSON.parse(encodeSave(state,'Old campaign'));const loaded=decodeSave(JSON.stringify(envelope)).state;
 assert.deepEqual(loaded.players.map(p=>p.country),expected);
 const malformed=JSON.parse(envelope.body);malformed.players[1].country={origin:'x',name:['','']};envelope.body=JSON.stringify(malformed);envelope.hash=checksum(envelope.body);
 assert.throws(()=>decodeSave(JSON.stringify(envelope)),/invalidSave/);
});

test('browser country fixture is a valid playable save before any UI is launched',()=>{
 const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-country-name-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
 const state=decodeSave(fixture.value).state;assert.ok(validateState(state));
 assert.equal(state.players.filter(p=>!p.ai).length,2);assert.equal(state.players.filter(p=>p.ai).length,fixture.origins.length-2);
 for(const p of state.provinces)if(p.owner>=0)assert.ok(state.players[p.owner].loadout.includes(p.kind));
});
