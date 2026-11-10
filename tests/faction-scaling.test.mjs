import test from 'node:test';
import assert from 'node:assert/strict';
import {factionColor,factionTextColor,FACTION_COLORS,NEUTRAL_LAND_COLOR} from '../src/game/factionColors.ts';
import {commanderIdentity} from '../src/ui/commanderIdentity.ts';
import {createGame,Engine} from '../src/game/engine.ts';
import {encodeFrame,applyFrame} from '../src/platform/replication.ts';
import {reconcileGrouping} from '../src/game/territoryEconomy.ts';

test('muted historical faction inks extend deterministically beyond the curated palette',()=>{
 assert.equal(FACTION_COLORS.length,12);
 for(let actor=0;actor<FACTION_COLORS.length;actor++)assert.equal(factionColor(actor),FACTION_COLORS[actor]);
 const colors=Array.from({length:512},(_,actor)=>factionColor(actor));
 for(const color of colors)assert.match(color,/^#[0-9a-f]{6}$/);
 assert.equal(new Set(colors).size,colors.length);
 assert.equal(factionColor(10000),factionColor(10000));
 for(const actor of [-1,NaN,Infinity,1.5])assert.equal(factionColor(actor),NEUTRAL_LAND_COLOR);
 assert.ok(!colors.includes(NEUTRAL_LAND_COLOR));
 for(const color of colors){
  const rgb=color.slice(1).match(/../g).map(v=>parseInt(v,16)/255),max=Math.max(...rgb),min=Math.min(...rgb),light=(max+min)/2;
  const saturation=(max-min)/(1-Math.abs(2*light-1));
  assert.ok(saturation<=.32,`${color} must stay a muted ink`);
  assert.ok(light>=.44&&light<=.64,`${color} must stay readable without becoming pale neutral land`);
 }
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

test('small faction names retain readable contrast on the dark HUD',()=>{
 const luminance=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 for(let actor=-1;actor<512;actor++)assert.ok((luminance(factionTextColor(actor))+.05)/(luminance('#173038')+.05)>=4.5);
});
