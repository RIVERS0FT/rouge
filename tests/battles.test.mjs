import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,Engine} from '../src/game/engine.ts';
import {MAP,provinceByCode} from '../src/game/map.ts';
import {BATTLE_QUIET_TICKS,CombatLog,battleWinner,settleBattles} from '../src/game/battles.ts';
import {validateState} from '../src/game/save.ts';
import {battleViews} from '../src/render/armyViews.ts';

const ledger=(owners=[])=>({tick:0,battles:[],nextBattle:1,events:[],units:[],provinces:owners.map((owner,id)=>({id,owner}))});
function hits(s,entries){const log=new CombatLog();for(const [region,victim,attacker,killed=false]of entries)log.note(region,victim,attacker,killed);settleBattles(s,log);}

test('every country fighting in a region joins one battle; losses accumulate per side',()=>{
 const s=ledger([-1,2]);
 hits(s,[[0,0,1,true],[0,1,0]]);
 assert.deepEqual(s.battles,[{id:1,region:0,start:0,last:0,sides:[{owner:0,losses:1},{owner:1,losses:0}]}]);
 s.tick=5;hits(s,[[0,2,1,true],[0,-1,2],[1,1,2]]);
 assert.equal(s.battles.length,2,'another region is another battle');
 assert.deepEqual(s.battles[0].sides,[{owner:0,losses:1},{owner:1,losses:0},{owner:2,losses:1},{owner:-1,losses:0}]);
 assert.deepEqual([s.battles[0].last,s.battles[1].start,s.nextBattle],[5,5,3]);
});

test('a battle ends after two quiet days and reports the winner of fights between countries',()=>{
 const s=ledger([1,-1]);
 hits(s,[[0,0,1,true],[0,2,1,true],[1,-1,0]]);
 s.units=[{id:1,owner:1,province:0},{id:2,owner:2,province:0}];
 s.tick=BATTLE_QUIET_TICKS-1;hits(s,[]);assert.equal(s.battles.length,2);
 s.tick=BATTLE_QUIET_TICKS;hits(s,[]);
 assert.deepEqual(s.battles,[]);
 // Region owner 1 took part and wins; the neutral skirmish in region 1 involved one country only.
 assert.deepEqual(s.events,[{tick:BATTLE_QUIET_TICKS,key:'battle',player:1,province:0,sides:[0,1,2]}]);
 // Without a participating owner, the country with the most troops left there wins.
 const battle={id:9,region:1,start:0,last:0,sides:[{owner:0,losses:0},{owner:2,losses:0}]};
 assert.equal(battleWinner({provinces:[{owner:1},{owner:-1}],units:[{owner:2,province:1},{owner:2,province:1},{owner:0,province:1}]},battle),2);
});

test('three sides fighting in one region form one engine battle and one multi-flag badge',()=>{
 const e=new Engine(createGame([{name:'A',leader:'warden',loadout:['infantry']},{name:'B',leader:'warden',loadout:['infantry']}],42));
 const s=e.state,region=provinceByCode('DEU-3487'),c=MAP[region].center,at={x:c.x,z:c.z+4};
 s.provinces[region].owner=-1;
 const unit=(id,owner,x,z)=>({id,owner,kind:'infantry',x:at.x+x,z:at.z+z,hp:100,province:region,origin:region,target:null,destination:null,route:[],cooldown:0});
 s.units=[unit(1,0,0,0),unit(2,1,1,0),unit(3,1,1.2,.6),unit(4,-1,2,0)];s.nextId=10;
 e.step(1);
 assert.equal(s.battles.length,1);
 assert.deepEqual(s.battles[0].sides.map(side=>side.owner).sort((a,b)=>a-b),[-1,0,1]);
 const [view]=battleViews(s);
 assert.deepEqual(view.sides,[{owner:1,count:2},{owner:-1,count:1},{owner:0,count:1}]);
 assert.equal(view.region,region);
 const x=s.units.reduce((sum,u)=>sum+u.x,0)/s.units.length;assert.ok(Math.abs(view.x-x)<1e-9,'badge sits at the fighting troops');
 assert.ok(validateState(s));
 // Once only one side stands in the region the badge disappears, before the battle formally ends.
 s.units=s.units.filter(u=>u.owner===1);assert.deepEqual(battleViews(s),[]);
});
