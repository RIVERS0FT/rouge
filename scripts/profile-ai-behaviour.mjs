// AI behaviour benchmark (docs/AI.md): what AI countries achieve, how much they keep on the
// march and what that costs per simulation step. Headless Node, not browser FPS.
//
//   node --experimental-strip-types scripts/profile-ai-behaviour.mjs --scenario=organic|full
//     --days=200 --seed=77 --policy=current|legacy|duel [--swap] [--phases]
//     [--set=ai.attackRatio=1.1,ai.reserveRatio=0.25] [--output=file.json]
//
// organic: 1 idle player + 100 AI from the normal opening. full: the 100-AI fully occupied fixture.
// policy legacy replays the AI as it was before 2026-11-22 (kept here only as a reference
// opponent); duel gives odd AI seats the legacy policy and even seats the current one (--swap flips).
// --set overrides balance values for one run (tuning); --phases splits the step time.
// The run imports src/ when it starts: to keep editing while it runs, run it from a copy.
import {writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {Engine,createGame} from '../src/game/engine.ts';
import {makeAISetups} from '../src/game/spawns.ts';
import {MAP} from '../src/game/map.ts';
import {BALANCE} from '../src/game/balance.ts';
import {DT,STATS} from '../src/game/content.ts';
import {runAiTurn} from '../src/game/ai.ts';
import {countryActions} from '../src/game/countryActions.ts';
import {isRegionGarrison} from '../src/game/capacity.ts';
import {regionCapacity} from '../src/game/territoryEconomy.ts';
import {aiTalentChoice} from '../src/game/talentBuilds.ts';
import {createFullyOccupiedFixture} from '../tests/fully-occupied-fixture.mjs';

const options=Object.fromEntries(process.argv.slice(2).map(arg=>{const [key,...value]=arg.replace(/^--/,'').split('=');return [key,value.length?value.join('='):'true'];}));
const scenario=options.scenario??'organic',policy=options.policy??'current',seed=Number(options.seed??77),days=Number(options.days??200);
if(!['organic','full'].includes(scenario)||!['current','legacy','duel'].includes(policy))throw new Error('Unknown --scenario or --policy');
// Tuning only: --set=ai.attackRatio=1.1,ai.reserveRatio=0.25 overrides balance values for this run.
for(const entry of (options.set??'').split(',').filter(Boolean)){
 const [path,value]=entry.split('='),keys=path.split('.'),last=keys.pop();let target=BALANCE;
 for(const key of keys)target=target[key];
 if(!target||!(last in target)||!Number.isFinite(Number(value)))throw new Error(`Unknown balance value ${path}`);
 target[last]=Number(value);
}
const state=scenario==='full'?createFullyOccupiedFixture(seed).state:createGame([{name:'Idle player',leader:'warden',loadout:['infantry']},...makeAISetups(100,seed)],seed,`ai-behaviour-${seed}`);
const engine=new Engine(state),s=()=>engine.state;
const groupOf=id=>policy!=='duel'?policy:(id%2===1)!==(options.swap==='true')?'legacy':'current';

// The pre-2026-11-22 policy, unchanged: every region with four ready battalions sends all of them
// to the neighbour holding the fewest troops of any owner, with a random upgrade above 160 funds.
const LEGACY={attackWith:4,upgradeAbove:160};
function legacyRandom(st){let x=st.rng;x^=x<<13;x^=x>>>17;x^=x<<5;st.rng=x>>>0;return st.rng/4294967296;}
function legacyTurn(scheduled){
 const st=s(),actors=new Set(scheduled.map(p=>p.id)),territories=new Map(),garrisons=new Map(),occupants=new Uint32Array(MAP.length);
 for(const v of st.provinces)if(MAP[v.id].playable&&actors.has(v.owner)){const ids=territories.get(v.owner)??[];ids.push(v.id);territories.set(v.owner,ids);}
 for(const u of st.units){occupants[u.province]++;if(!actors.has(u.owner)||st.provinces[u.province]?.owner!==u.owner||!isRegionGarrison(u,u.owner,u.province))continue;const units=garrisons.get(u.province)??[];units.push(u);garrisons.set(u.province,units);}
 for(const p of scheduled.filter(p=>territories.has(p.id))){
  if(p.choices.length)engine.command(p.id,countryActions.talent(aiTalentChoice(st,p)));
  if(p.funds>LEGACY.upgradeAbove)engine.command(p.id,countryActions.upgrade(p.loadout[Math.floor(legacyRandom(st)*p.loadout.length)],STATS[Math.floor(legacyRandom(st)*3)]));
  for(const id of territories.get(p.id)??[]){
   const province=st.provinces[id];if(province.march)continue;
   const units=garrisons.get(id)??[];
   if(units.length<Math.min(LEGACY.attackWith,regionCapacity(province.id))||!units.length)continue;
   const neighbors=MAP[province.id].neighbors,targets=neighbors.filter(n=>st.provinces[n].owner!==p.id).sort((a,b)=>occupants[a]-occupants[b]);
   let destination=targets[0]??neighbors.filter(n=>MAP[n].neighbors.some(m=>st.provinces[m].owner!==p.id))[0];
   if(destination===undefined){
    const candidates=[],center=MAP[province.id].center;
    for(const m of MAP)if(m.playable&&st.provinces[m.id].owner!==p.id){
     const distance=Math.hypot(m.center.x-center.x,m.center.z-center.z);let index=0;
     while(index<candidates.length&&(candidates[index].distance<distance||(candidates[index].distance===distance&&candidates[index].id<m.id)))index++;
     if(index<4){candidates.splice(index,0,{id:m.id,distance});if(candidates.length>4)candidates.pop();}
    }
    destination=candidates.find(m=>engine.navigation.plan(center,MAP[m.id].center))?.id;
   }
   if(destination!==undefined)engine.command(p.id,countryActions.march(province.id,destination));
  }
 }
}

const interval=Math.max(1,Math.round(BALANCE.ai.intervalDays/DT));
let aiMs=0;
engine.ai=function(){
 const start=performance.now(),st=s(),scheduled=st.players.filter(p=>p.ai&&(p.id+interval-1)%interval===(st.tick-interval)%interval);
 for(const p of scheduled)if(groupOf(p.id)==='legacy')legacyTurn([p]);else runAiTurn(st,p.id,action=>engine.command(p.id,action));
 aiMs+=performance.now()-start;
};
const phases={};
if(options.phases==='true')for(const method of ['prepareTick','clearBuildings','updatePrepared','finishTick','separate','releaseMarches']){
 const original=engine[method];phases[method]=0;
 engine[method]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{phases[method]+=performance.now()-start;}};
}

const ticks=Math.round(days/DT),owners=Int32Array.from(s().provinces.map(p=>p.owner)),flips=new Map(),groups={};
for(const p of s().players)if(p.ai)groups[groupOf(p.id)]??={seats:0,captures:0,lost:0};
for(const p of s().players)if(p.ai)groups[groupOf(p.id)].seats++;
let stepMs=0,aiDeaths=0,captures=0,alive=new Map(s().units.map(u=>[u.id,u.owner]));
/** Captures by winner group → previous holder group (or neutral / player). */
const seized={};
const holderGroup=owner=>owner<0?'neutral':s().players[owner]?.ai?groupOf(owner):'player';
const samples={moving:[],empty:[],armies:[]};
for(let t=0;t<ticks&&s().winner===null;t++){
 const start=performance.now();engine.step();stepMs+=performance.now()-start;
 const st=s();
 for(const p of st.provinces)if(p.owner!==owners[p.id]){
  captures++;flips.set(p.id,(flips.get(p.id)??0)+1);
  const key=`${holderGroup(p.owner)}<-${holderGroup(owners[p.id])}`;seized[key]=(seized[key]??0)+1;
  if(st.players[p.owner]?.ai)groups[groupOf(p.owner)].captures++;
  if(st.players[owners[p.id]]?.ai)groups[groupOf(owners[p.id])].lost++;
  owners[p.id]=p.owner;
 }
 if(st.tick%20===0){const now=new Map(st.units.map(u=>[u.id,u.owner]));for(const [id,owner] of alive)if(!now.has(id)&&st.players[owner]?.ai)aiDeaths++;alive=now;}
 if(st.tick%100===0){
  let ai=0,moving=0;const stationed=new Set();
  for(const u of st.units){if(!st.players[u.owner]?.ai)continue;ai++;if(u.target!==null||u.travel)moving++;else stationed.add(u.owner*4096+u.province);}
  samples.moving.push(moving/Math.max(1,ai));samples.armies.push(st.armies.length);
  samples.empty.push(st.provinces.filter(p=>st.players[p.owner]?.ai&&!stationed.has(p.owner*4096+p.id)).length);
 }
}
const st=s(),mean=values=>values.reduce((sum,value)=>sum+value,0)/Math.max(1,values.length),round=(value,digits=2)=>+value.toFixed(digits);
for(const [group,data] of Object.entries(groups)){
 const seats=st.players.filter(p=>p.ai&&groupOf(p.id)===group).map(p=>p.id),set=new Set(seats);
 data.regions=st.provinces.filter(p=>set.has(p.owner)&&MAP[p.id].playable).length;
 data.aliveSeats=new Set(st.provinces.filter(p=>set.has(p.owner)).map(p=>p.owner)).size;
 data.units=st.units.filter(u=>set.has(u.owner)).length;
 const players=seats.map(id=>st.players[id]);
 data.avgFunds=round(mean(players.map(p=>p.funds)),0);
 data.avgUpgradeLevels=round(mean(players.map(p=>Object.values(p.upgrades).reduce((sum,kind)=>sum+kind.attack+kind.health+kind.speed,0))),1);
 data.avgLeaderLevel=round(mean(players.map(p=>p.level)),1);
 const buildings={};for(const p of st.provinces)if(set.has(p.owner)&&p.construction)buildings[p.construction.kind]=(buildings[p.construction.kind]??0)+p.construction.level;
 data.buildingLevels=buildings;
}
const steps=st.tick,report={scenario,policy,seed,...(options.set?{set:options.set}:{}),days:round(steps*DT,1),
 avgStepMs:round(stepMs/steps),aiMsPerStep:round(aiMs/steps,3),
 avgMovingShare:round(mean(samples.moving),3),avgArmies:round(mean(samples.armies),0),avgEmptyAiRegions:round(mean(samples.empty),0),
 captures,seized,aiUnitDeaths:aiDeaths,regionsFlipped3Plus:[...flips.values()].filter(n=>n>=3).length,unitsEnd:st.units.length,winner:st.winner,groups,
 ...(options.phases==='true'?{phasesMsPerStep:{
  prepareAndFormations:round((phases.prepareTick-phases.clearBuildings)/steps),clearBuildings:round(phases.clearBuildings/steps),
  combat:round((phases.updatePrepared-phases.finishTick)/steps),collision:round(phases.separate/steps),marchRelease:round(phases.releaseMarches/steps),
  ai:round(aiMs/steps),censusEconomyRest:round((phases.finishTick-phases.separate-phases.releaseMarches-aiMs)/steps)}}:{})};
console.log(JSON.stringify(report));
if(options.output){await mkdir(dirname(options.output),{recursive:true});await writeFile(options.output,JSON.stringify(report,null,1));}
// --dump=file writes the final campaign state, for exact before/after comparisons of engine changes.
if(options.dump){await mkdir(dirname(options.dump),{recursive:true});await writeFile(options.dump,JSON.stringify(st));}
