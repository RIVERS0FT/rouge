import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, createGame } from '../src/game/engine.ts';
import { MAP, provinceAt } from '../src/game/map.ts';
import { buildFlow } from '../src/game/navigation.ts';
import { validateState, encodeSave, decodeSave, writeSave, readSave, listSaves, deleteSave } from '../src/game/save.ts';
import { stats } from '../src/game/content.ts';
const setups=[{name:'Player',leader:'warden',loadout:['infantry','cavalry','artillery']},{name:'AI',leader:'steward',loadout:['infantry','engineer'],ai:true}];
class MemoryStorage {m=new Map();get length(){return this.m.size;}key(i){return [...this.m.keys()][i]??null;}getItem(k){return this.m.get(k)??null;}setItem(k,v){this.m.set(k,v);}removeItem(k){this.m.delete(k);}}
const fresh=()=>new Engine(createGame(setups,1234,'test'));
test('32 fictional provinces have symmetric edge adjacency and valid centers',()=>{
 assert.equal(MAP.length,32);for(const p of MAP){assert.ok(p.polygon.length>=3);assert.equal(provinceAt(p.center.x,p.center.z),p.id);assert.ok(p.neighbors.length>0);for(const n of p.neighbors)assert.ok(MAP[n].neighbors.includes(p.id));}
 const seen=new Set([0]);for(let i=0;i<32;i++)for(const id of seen)for(const n of MAP[id].neighbors)seen.add(n);assert.equal(seen.size,32);
});
test('fixed seed and command sequence produce identical state',()=>{
 const a=fresh(),b=fresh();const command={type:'march',from:0,to:MAP[0].neighbors.find(n=>n!==1),fraction:1};assert.equal(a.command(0,command).ok,true);b.command(0,command);a.step(1200);b.step(1200);assert.deepEqual(a.state,b.state);assert.ok(validateState(a.state));
});
test('auto-production continues without consuming military funds',()=>{const e=fresh();e.state.players[1].ai=false;e.state.players[0].gold=0;const before=e.state.units.filter(u=>u.owner===0).length;e.step(281);assert.equal(e.state.units.filter(u=>u.owner===0).length,before+2);assert.ok(e.state.players[0].gold>0);});
test('reject forged ownership, non-adjacent, NaN and unsupported production',()=>{
 const e=fresh();assert.equal(e.command(1,{type:'march',from:0,to:1,fraction:1}).ok,false);assert.equal(e.command(0,{type:'march',from:0,to:31,fraction:1}).ok,false);assert.equal(e.command(0,{type:'march',from:0,to:1,fraction:NaN}).ok,false);assert.equal(e.command(0,{type:'production',province:0,kind:'engineer'}).ok,false);assert.equal(e.command(99,{type:'reroll'}).ok,false);
});
test('health upgrades preserve wounded health ratio and deduct cost exactly once',()=>{
 const e=fresh(),p=e.state.players[0],u=e.state.units.find(u=>u.owner===0);u.hp=45;const before=p.gold;assert.equal(e.command(0,{type:'upgrade',kind:'infantry',stat:'health'}).ok,true);assert.equal(u.hp/stats(p,'infantry').hp,0.5);assert.equal(p.gold,before-30);
});
test('shared reverse flow goes around walls and forbids diagonal corner cutting',()=>{
 const costs=new Float32Array(25).fill(1);costs[7]=costs[12]=costs[17]=Infinity;const f=buildFlow({width:5,height:5,costs},14);let i=10;const visited=new Set();while(i!==14){assert.ok(i>=0);assert.ok(!visited.has(i));visited.add(i);assert.ok(f.distance[f.next[i]]<f.distance[i]);i=f.next[i];}assert.ok(visited.size>4);
 const g=buildFlow({width:2,height:2,costs:new Float32Array([1,Infinity,Infinity,1])},3);assert.equal(g.next[0],-1);
});
test('flow is cached by owner, target and topology',()=>{const e=fresh(),target=MAP[0].neighbors.find(n=>n!==1);const a=e.navigation.get(e.state,0,target);assert.equal(a,e.navigation.get(e.state,0,target));e.state.topology++;assert.notEqual(a,e.navigation.get(e.state,0,target));});
test('march, combat, capture and automatic production form a working loop',()=>{
 const e=fresh();e.state.players[1].ai=false;const target=MAP[0].neighbors.find(n=>e.state.provinces[n].owner<0);assert.ok(target!==undefined);assert.equal(e.command(0,{type:'march',from:0,to:target,fraction:1}).ok,true);e.step(1600);assert.equal(e.state.provinces[target].owner,0);assert.ok(e.state.events.some(v=>v.key==='capture'&&v.province===target));assert.ok(validateState(e.state));
});
test('talents can only be selected from the current candidate set',()=>{const e=fresh(),p=e.state.players[0];assert.equal(e.command(0,{type:'talent',id:'veterans'}).ok,false);p.drafts=1;p.choices=['veterans','industry','entrenchment'];assert.equal(e.command(0,{type:'talent',id:'veterans'}).ok,true);assert.ok(p.talents.includes('veterans'));assert.equal(p.choices.length,0);});
test('save roundtrip retains RNG and pending talent choices; corruption rejected',()=>{const e=fresh();e.state.players[0].choices=['industry','veterans'];e.state.players[0].drafts=1;const raw=encodeSave(e.state,'Test');assert.deepEqual(decodeSave(raw).state,e.state);const envelope=JSON.parse(raw);envelope.hash='bad';assert.throws(()=>decodeSave(JSON.stringify(envelope)));assert.throws(()=>decodeSave('{}'));assert.equal(validateState({...e.state,version:99}),false);});
test('multi-slot deletion isolation and corrupt-current recovery from backup',()=>{
 const storage=new MemoryStorage(),e=fresh();writeSave(storage,'a',e.state,'A');writeSave(storage,'b',e.state,'B');e.step(10);writeSave(storage,'a',e.state,'A');storage.setItem('rouge.save.v1.a','bad');assert.equal(readSave(storage,'a').recovered,true);assert.equal(readSave(storage,'a').state.tick,0);assert.equal(listSaves(storage).length,2);deleteSave(storage,'a');assert.equal(listSaves(storage).length,1);assert.equal(readSave(storage,'b').state.campaign,'test');
});
test('save rejects out-of-bounds coordinates and nonexistent unit types',()=>{const e=fresh();e.state.units[0].x=Infinity;assert.equal(validateState(e.state),false);e.state.units[0].x=0;e.state.units[0].kind='tank';assert.equal(validateState(e.state),false);});
test('victory locks further commands',()=>{const e=fresh();for(const p of e.state.provinces)p.owner=0;e.state.units=e.state.units.filter(u=>u.owner===0);e.step();assert.equal(e.state.winner,0);assert.equal(e.command(0,{type:'upgrade',kind:'infantry',stat:'attack'}).ok,false);});
