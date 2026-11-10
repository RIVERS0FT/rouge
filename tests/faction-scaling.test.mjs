import test from 'node:test';
import assert from 'node:assert/strict';
import {factionColor,FACTION_COLORS} from '../src/game/factionColors.ts';
import {commanderIdentity} from '../src/ui/commanderIdentity.ts';
import {createGame,Engine} from '../src/game/engine.ts';
import {encodeFrame,applyFrame} from '../src/platform/replication.ts';
import {reconcileGrouping} from '../src/game/territoryEconomy.ts';

test('faction colors retain established palette and extend deterministically beyond four',()=>{
 assert.deepEqual(FACTION_COLORS,['#609baa','#bb6e62','#c0a263','#8a91b5']);
 for(let actor=0;actor<4;actor++)assert.equal(factionColor(actor),FACTION_COLORS[actor]);
 const colors=Array.from({length:512},(_,actor)=>factionColor(actor));
 for(const color of colors)assert.match(color,/^#[0-9a-f]{6}$/);
 assert.equal(new Set(colors).size,colors.length);
 assert.equal(factionColor(10000),factionColor(10000));
 for(const actor of [-1,NaN,Infinity,1.5])assert.equal(factionColor(actor),'#929481');
});
test('commander identities support all valid actor indices',()=>{
 for(const actor of [4,255,256,10000]){
  assert.equal(commanderIdentity(actor).actor,actor);
  assert.equal(commanderIdentity(actor).names[1],`Faction ${actor+1}`);
 }
 for(const actor of [-1,NaN,Infinity,1.5])assert.equal(commanderIdentity(actor).actor,null);
});
test('high actor indices survive simulation, elimination and full/delta replication',()=>{
 const setup=[{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'warden',loadout:['infantry']}];
 const s=createGame(setup,19),high=256;
 // Isolate actor-index behavior from the map's separate physical spawn capacity.
 for(let id=2;id<=high;id++)s.players.push({...structuredClone(s.players[1]),id,name:`Faction ${id+1}`});
 s.domination=s.players.map(()=>0);
 for(const p of s.provinces)if(p.owner===1)p.owner=high;
 for(const u of s.units)if(u.owner===1)u.owner=high;
 s.grouping=reconcileGrouping(s);s.players[high].choices=['drill'];s.players[0].choices=['march'];
 const e=new Engine(s);e.step();assert.equal(e.state.winner,null);
 assert.ok(e.state.units.some(u=>u.owner===high));
 const full=encodeFrame(e.state,undefined,high),remote=applyFrame(null,JSON.parse(JSON.stringify(full.frame)));
 assert.equal(remote.players[high].id,high);assert.deepEqual(remote.players[high].choices,['drill']);assert.deepEqual(remote.players[0].choices,[]);
 e.step();const delta=encodeFrame(e.state,full.base,high),next=applyFrame(remote,JSON.parse(JSON.stringify(delta.frame)));
 assert.ok(next.provinces.some(p=>p.owner===high));assert.ok(next.units.some(u=>u.owner===high));
 // Last survivor detection must include the final actor rather than four fixed slots.
 for(const p of e.state.provinces)if(p.owner===0)p.owner=high;
 e.state.grouping=reconcileGrouping(e.state);e.step();assert.equal(e.state.winner,high);
 assert.equal(e.state.units.some(u=>u.owner===0),false);
});
