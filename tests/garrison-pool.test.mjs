import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {countryActions} from '../src/game/countryActions.ts';
import {MAP,provinceAt} from '../src/game/map.ts';
import {stats} from '../src/game/content.ts';
import {regionTroops} from '../src/game/capacity.ts';
import {reconcileGrouping} from '../src/game/territoryEconomy.ts';
import {combatLanes} from '../src/game/talentEffects.ts';
import {makeAISetups} from '../src/game/spawns.ts';
import {BALANCE} from '../src/game/balance.ts';

const base=createGame([{name:'Home',leader:'warden',loadout:['infantry']},{name:'Rival',leader:'warden',loadout:['infantry']}],41,'garrison-pool');
const span=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const around=(p,angle,d)=>({x:p.center.x+Math.cos(angle)*d,z:p.center.z+Math.sin(angle)*d});
const RING=4,NEAR_FOE=12,FAR_FOE=20;
// A town whose garrison ring lies inside it, and a bearing with land under both foe positions.
const setup=MAP.flatMap(p=>{
 if(!p.playable||!p.neighbors.some(n=>MAP[n].playable))return [];
 if(![...Array(6).keys()].every(i=>{const q=around(p,i*Math.PI/3,RING);return provinceAt(q.x,q.z)===p.id;}))return [];
 const bearing=[...Array(16).keys()].map(i=>i*Math.PI/8+Math.PI/16).find(a=>[NEAR_FOE,FAR_FOE].every(d=>{const q=around(p,a,d);return provinceAt(q.x,q.z)>=0;}));
 return bearing===undefined?[]:[{home:p,bearing}];
})[0];
const unit=(s,owner,{x,z})=>({id:s.nextId++,owner,kind:'infantry',x,z,hp:stats(s.players[owner],'infantry').hp,province:provinceAt(x,z),origin:provinceAt(x,z),target:null,destination:null,route:[],cooldown:0});
/** Six battalions resting RING units around the town centre (none touching); the rival far away. */
function world(foeDistance){
 const {home,bearing}=setup,far=MAP.find(p=>p.playable&&span(p.center,home.center)>300);
 const s=structuredClone(base);s.units=[];s.armies=[];s.battles=[];
 for(const p of s.provinces){p.owner=-1;p.production=0;delete p.march;}
 s.provinces[home.id].owner=0;s.provinces[far.id].owner=1;
 for(let i=0;i<6;i++)s.units.push(unit(s,0,around(home,i*Math.PI/3,RING)));
 s.units.push(unit(s,1,far.center));
 if(foeDistance!==undefined)s.units.push(unit(s,1,around(home,bearing,foeDistance)));
 s.grouping=reconcileGrouping(s);
 return new Engine(s);
}
const garrison=e=>e.state.units.filter(u=>u.owner===0).map(u=>[u.x,u.z]);

test('a garrison at rest in its own town is pooled: it keeps its place and still counts for the town',()=>{
 assert.ok(setup);
 const e=world(),before=garrison(e);
 e.step(40);
 assert.deepEqual(garrison(e),before);
 assert.equal(regionTroops(e.state,0,setup.home.id),6);
});

test('a foe within twelve units of a battalion wakes the garrison, which then drifts as usual; a farther one does not',()=>{
 // Awake idle troops drift toward the town centre: the control that this town lets them move.
 const near=world(NEAR_FOE),before=garrison(near);near.step();
 assert.notDeepEqual(garrison(near),before);
 const distant=world(FAR_FOE),still=garrison(distant);
 assert.ok(distant.state.units.filter(u=>u.owner===0).every(u=>span(u,distant.state.units.at(-1))>12));
 distant.step(3);
 assert.deepEqual(garrison(distant),still);
});

test('orders take troops out of the pool',()=>{
 const e=world(),to=setup.home.neighbors.find(n=>MAP[n].playable),before=new Map(e.state.units.map(u=>[u.id,{x:u.x,z:u.z}]));
 e.step(5);
 assert.deepEqual(e.command(0,countryActions.march(setup.home.id,to,1)),{ok:true});
 e.step(60);
 assert.ok(e.state.units.some(u=>u.owner===0&&u.target===to&&span(u,before.get(u.id))>.5));
});

test('pooled troops still count for Massed Ranks',()=>{
 const s=world().state,statsFor=(owner,kind)=>stats(s.players[owner],kind),home=setup.home;
 s.players[0].talents=['massedRanks'];
 const troops=[...s.units.filter(u=>u.owner===0),unit(s,0,around(home,0,2.5)),unit(s,0,around(home,Math.PI,2.5))];
 for(const u of troops)u.province=home.id;
 assert.ok(troops.length>=BALANCE.talents.massedRanks.minUnits);
 const awake=[troops[0]];
 assert.equal(combatLanes(awake,s,statsFor).taken[0],0);
 assert.equal(combatLanes(awake,s,statsFor,undefined,troops).taken[0],BALANCE.talents.massedRanks.damageReduction);
});

test('pooling reads only the current state: a rebuilt engine continues the campaign identically',()=>{
 const start=createGame([{name:'Idle',leader:'warden',loadout:['infantry']},...makeAISetups(3,9)],9,'pool-reload');
 const a=new Engine(start);a.step(300);
 const b=new Engine(structuredClone(a.state));
 a.step(300);b.step(300);
 assert.deepEqual(b.state,a.state);
});
