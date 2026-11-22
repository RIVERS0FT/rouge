import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/game/engine.ts';
import {runAiTurn} from '../src/game/ai.ts';
import {MAP} from '../src/game/map.ts';
import {BALANCE} from '../src/game/balance.ts';
import {stats} from '../src/game/content.ts';

const AI=BALANCE.ai;
const base=createGame([
 {name:'Human',leader:'warden',loadout:['infantry']},
 {name:'AI',leader:'warden',loadout:['infantry'],ai:true},
 {name:'Rival',leader:'warden',loadout:['infantry'],ai:true},
],31,'ai-planner');
const playable=id=>MAP[id].playable;
const span=(a,b)=>Math.hypot(MAP[a].center.x-MAP[b].center.x,MAP[a].center.z-MAP[b].center.z);
const nearestFirst=(to,ids)=>[...ids].sort((a,b)=>span(a,to)-span(b,to)||a-b);

/** A blank campaign: every region neutral and empty except the listed owners and troops.
 * `rest` owns every region not listed. Troops: [owner, region, count, extra unit fields]. */
function world({owners={},rest=-1,troops=[],armies=[]}={}){
 const s=structuredClone(base);s.units=[];s.armies=structuredClone(armies);s.battles=[];
 for(const p of s.provinces){p.owner=playable(p.id)?rest:-1;p.production=0;p.kind='infantry';p.capture=0;p.captor=-1;delete p.march;delete p.construction;}
 for(const [id,owner] of Object.entries(owners))s.provinces[id].owner=owner;
 for(const [owner,region,count,extra] of troops)for(let i=0;i<count;i++)s.units.push({id:s.nextId++,owner,kind:'infantry',...MAP[region].center,hp:stats(s.players[owner],'infantry').hp,province:region,origin:region,target:null,destination:null,route:[],cooldown:0,...extra});
 return s;
}
/** The orders one AI turn issues, each accepted. */
function plan(s,actor=1){const actions=[];runAiTurn(s,actor,action=>{actions.push(action);return {ok:true};});return actions;}
const marches=actions=>actions.filter(a=>a.type==='march');

const home=MAP.find(p=>p.playable&&p.neighbors.filter(playable).length>=3);
const around=nearestFirst(home.id,home.neighbors.filter(playable));

test('a neutral garrison is attacked only once the strength clears the neutral ratio, with the whole garrison',()=>{
 const neutral=around.map(n=>[-1,n,5]);
 assert.ok(4<AI.neutralAttackRatio*5&&5>=AI.neutralAttackRatio*5);
 assert.deepEqual(marches(plan(world({owners:{[home.id]:1},troops:[[1,home.id,4],...neutral]}))),[]);
 assert.deepEqual(marches(plan(world({owners:{[home.id]:1},troops:[[1,home.id,5],...neutral]}))),[{type:'march',from:home.id,to:around[0],fraction:1}]);
});

test('an empty neighbour gets a small detachment, not the whole garrison',()=>{
 const s=world({owners:{[home.id]:1},troops:[[1,home.id,8],...around.slice(1).map(n=>[-1,n,5])]});
 assert.deepEqual(marches(plan(s)),[{type:'march',from:home.id,to:around[0],fraction:.25}]);
 assert.equal(Math.max(1,Math.floor(8*.25)),AI.detachment);
});

// A target with two neighbours whose marches end within the muster window.
const pincer=MAP.flatMap(x=>{
 if(!x.playable)return [];
 const [a,b]=nearestFirst(x.id,x.neighbors.filter(playable));
 return b!==undefined&&span(b,x.id)<=1.4*span(a,x.id)?[{target:x.id,a,b}]:[];
})[0];

test('neighbouring garrisons combine against a target neither could take alone',()=>{
 const {target,a,b}=pincer,rival=[2,target,6];
 assert.ok(5<AI.attackRatio*6&&10>=AI.attackRatio*6);
 assert.deepEqual(marches(plan(world({owners:{[target]:2},rest:1,troops:[rival,[1,a,5],[1,b,5]]}))),[
  {type:'march',from:a,to:target,fraction:1},{type:'march',from:b,to:target,fraction:1},
 ]);
 assert.deepEqual(marches(plan(world({owners:{[target]:2},rest:1,troops:[rival,[1,a,5]]}))),[]);
});

test('a strong garrison attacks on its own when the nearest neighbour is too weak to wait for',()=>{
 const outlier=MAP.flatMap(x=>{
  if(!x.playable)return [];
  const near=nearestFirst(x.id,x.neighbors.filter(playable)),far=near.find(id=>span(id,x.id)>1.6*span(near[0],x.id));
  return far!==undefined?[{target:x.id,near:near[0],far}]:[];
 })[0];
 assert.ok(outlier);
 const {target,near,far}=outlier;
 assert.deepEqual(marches(plan(world({owners:{[target]:2},rest:1,troops:[[2,target,6],[1,near,2],[1,far,10]]}))),[{type:'march',from:far,to:target,fraction:1}]);
});

test('front regions send what their reserve can spare to the main effort',()=>{
 // Regions within two steps of `from` that avoid the blocked ones.
 const reach=(from,blocked)=>{
  const steps=new Map([[from,0]]),queue=[from];
  for(const r of queue)if(steps.get(r)<2)for(const n of MAP[r].neighbors)if(playable(n)&&!blocked.includes(n)&&!steps.has(n)){steps.set(n,steps.get(r)+1);queue.push(n);}
  return steps;
 };
 let setup;
 for(const x of MAP){
  if(!x.playable||setup)continue;
  const [staging]=nearestFirst(x.id,x.neighbors.filter(playable));
  if(staging===undefined||span(staging,x.id)>20)continue;
  for(const [donor,steps] of reach(staging,[x.id])){
   if(!steps||MAP[donor].neighbors.includes(x.id))continue;
   const rival=MAP[donor].neighbors.find(y=>playable(y)&&y!==x.id&&y!==staging&&!MAP[staging].neighbors.includes(y)&&!MAP[x.id].neighbors.includes(y)&&reach(staging,[x.id,y]).has(donor));
   if(rival!==undefined){setup={target:x.id,staging,donor,rival};break;}
  }
 }
 assert.ok(setup);
 const {target,staging,donor,rival}=setup;
 const s=world({owners:{[target]:2,[rival]:2},rest:1,troops:[[2,target,8],[2,rival,11],[1,staging,6],[1,donor,12]]});
 s.provinces[target].construction={kind:'market',level:3};
 // The donor keeps six of twelve against eleven rivals next door; the other six join the effort.
 assert.equal(Math.ceil(AI.reserveRatio*11),6);
 assert.deepEqual(marches(plan(s)),[{type:'march',from:donor,to:staging,fraction:.5}]);
});

test('a region facing another enemy keeps a reserve when it attacks elsewhere',()=>{
 const [weak,enemy]=around,s=world({owners:{[weak]:-1,[enemy]:2},rest:1,troops:[[1,home.id,8],[-1,weak,2],[2,enemy,10]]});
 // Ten rival battalions next door: half of their strength stays home, so only a quarter marches.
 assert.equal(Math.ceil(AI.reserveRatio*10),5);
 assert.deepEqual(marches(plan(s)),[{type:'march',from:home.id,to:weak,fraction:.25}]);
});

test('a threatened region keeps its garrison and a safe neighbour reinforces it',()=>{
 const [enemy,helper]=around,army={id:41,owner:2,to:home.id,formed:0,size:6};
 const s=world({owners:{[home.id]:1,[enemy]:2,[helper]:1},troops:[[1,home.id,3],[1,helper,6],[2,enemy,6,{army:41,armyStatus:'queued'}]],armies:[army]});
 const orders=marches(plan(s));
 assert.ok(orders.length>=1);
 assert.equal(orders[0].from,helper);assert.equal(orders[0].to,home.id);
 assert.ok(orders.every(order=>order.from!==home.id));
});

test('an attack that has fallen far behind is called back to the nearest own region',()=>{
 const [target]=around,army={id:7,owner:1,to:target,formed:0,size:3};
 const s=world({owners:{[home.id]:1,[target]:2},troops:[[2,target,10],[1,target,3,{army:7,armyStatus:'field',target}]],armies:[army]});
 assert.ok(3<AI.retreatBelow*10);
 assert.deepEqual(plan(s).filter(a=>a.type==='armyMarch'),[{type:'armyMarch',army:7,to:home.id}]);
 // Strong enough to stay: no recall.
 const holding=world({owners:{[home.id]:1,[target]:2},troops:[[2,target,4],[1,target,3,{army:7,armyStatus:'field',target}]],armies:[army]});
 assert.ok(3>=AI.retreatBelow*4);
 assert.deepEqual(plan(holding).filter(a=>a.type==='armyMarch'),[]);
});

test('an idle interior garrison marches to the front region that lacks strength',()=>{
 const {target}=pincer,staging=nearestFirst(target,MAP[target].neighbors.filter(playable))[0];
 const interior=MAP[staging].neighbors.find(id=>playable(id)&&id!==target&&!MAP[id].neighbors.includes(target));
 assert.notEqual(interior,undefined);
 const s=world({owners:{[target]:2},rest:1,troops:[[2,target,20],[1,interior,AI.moveWith]]});
 assert.deepEqual(marches(plan(s)),[{type:'march',from:interior,to:staging,fraction:1}]);
 // Without any shortfall the interior stays put.
 assert.deepEqual(marches(plan(world({owners:{[target]:1},rest:1,troops:[[1,interior,AI.moveWith]]}))),[]);
});

test('upgrades buy the best affordable option, and only above the threshold',()=>{
 const s=world({owners:{[home.id]:1}}),p=s.players[1];
 p.funds=AI.upgradeAbove;assert.deepEqual(plan(s).filter(a=>a.type==='upgrade'),[]);
 p.funds=AI.upgradeAbove+1;assert.deepEqual(plan(s).filter(a=>a.type==='upgrade'),[{type:'upgrade',kind:'infantry',stat:'attack'}]);
 p.upgrades.infantry.attack=1;assert.deepEqual(plan(s).filter(a=>a.type==='upgrade'),[{type:'upgrade',kind:'infantry',stat:'health'}]);
 p.upgrades.infantry.attack=p.upgrades.infantry.health=p.upgrades.infantry.speed=BALANCE.upgrades.maxLevel;
 assert.deepEqual(plan(s).filter(a=>a.type==='upgrade'),[]);
});

const builds=s=>plan(s).filter(a=>a.type==='construct');

test('funds above the threshold buy a market in the safest region, and nothing at or below it',()=>{
 const s=world({owners:{[pincer.target]:2},rest:1}),p=s.players[1];
 const interior=MAP.find(m=>m.playable&&s.provinces[m.id].owner===1&&m.neighbors.every(n=>!MAP[n].playable||s.provinces[n].owner===1));
 p.funds=AI.buildAbove;assert.deepEqual(builds(s),[]);
 // Below the upgrade threshold, so the whole sum is free for building.
 p.funds=Math.min(AI.upgradeAbove,AI.buildAbove+60);
 assert.deepEqual(builds(s),[{type:'construct',province:interior.id,kind:'market',expectedLevel:0}]);
 s.provinces[interior.id].construction={kind:'market',level:1};
 assert.notDeepEqual(builds(s),[{type:'construct',province:interior.id,kind:'market',expectedLevel:0}]);
});

test('a fortress goes where help is under way but still short; a hopeless or contested region gets none',()=>{
 const [enemy]=around,helper=around.find(n=>n!==enemy&&!MAP[n].neighbors.includes(enemy)),army={id:41,owner:2,to:home.id,formed:0,size:8};
 assert.notEqual(helper,undefined);
 const attack=[[1,home.id,3],[2,enemy,8,{army:41,armyStatus:'queued'}]],funds=Math.min(AI.upgradeAbove,AI.buildAbove+60);
 // Three at home and three coming from the helper face eight: help is sent, yet short.
 const s=world({owners:{[home.id]:1,[enemy]:2,[helper]:1},troops:[...attack,[1,helper,3]],armies:[army]});s.players[1].funds=funds;
 assert.ok(marches(plan(s)).some(order=>order.from===helper&&order.to===home.id));
 assert.deepEqual(builds(s),[{type:'construct',province:home.id,kind:'fortress',expectedLevel:0}]);
 s.provinces[home.id].capture=1;
 assert.ok(builds(s).every(order=>order.province!==home.id));
 // Alone, three cannot hold against eight: a fortress would only pass to the captor.
 const hopeless=world({owners:{[home.id]:1,[enemy]:2},troops:attack,armies:[army]});hopeless.players[1].funds=funds;
 assert.deepEqual(builds(hopeless),[]);
});

test('the planner draws no campaign randomness and repeats itself exactly',()=>{
 const s=world({owners:{[home.id]:1},troops:[[1,home.id,9],...around.slice(1).map(n=>[-1,n,3])]}),before=structuredClone(s);
 const first=plan(s);
 assert.ok(first.length>0);
 assert.deepEqual(s,before);
 assert.deepEqual(plan(structuredClone(before)),first);
});
