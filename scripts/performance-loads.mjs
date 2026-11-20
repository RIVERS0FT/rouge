import {Engine} from '../src/game/engine.ts';
import {UNITS} from '../src/game/content.ts';
import {validateState} from '../src/game/save.ts';

export async function growLateGame(snapshot){
 const engine=new Engine(snapshot.state);
 // Accelerate training progress only while creating the fixture. Production
 // chooses legal positions and assigns IDs. Measured play uses ordinary ticks.
 // A mature campaign has settled fronts. Let the initial reinforcement wave
 // meet those fronts before saving the 25k workload.
 const reinforced=27000;
 for(let i=0;i<6000&&engine.state.units.length<reinforced;i++){
  for(const region of engine.state.provinces)if(region.owner>=0)region.production=UNITS[region.kind].train;
  engine.step();
  if(engine.state.winner!==null)throw Error('Fixture ended during reinforcement');
 }
 if(engine.state.units.length<reinforced)throw Error('Insufficient reinforcements for the late-game fixture');
 for(let i=0;i<6000&&engine.state.units.length>25450;i++){
  engine.step();
  if(engine.state.winner!==null)throw Error('Fixture ended before the front stabilized');
 }
 if(engine.state.units.length<24500||engine.state.units.length>25450||!validateState(engine.state))throw Error('Invalid late-game fixture');
 return {state:engine.state,canvas:snapshot.canvas};
}

// Deliberate stress loads use the same troops, owners, orders and coordinates
// for both group counts. Positions come from real movement and combat records.
export function formationLoad(snapshot,workload,count){
 const state=structuredClone(snapshot.state),members=new Map();
 for(const u of state.units){
  if(u.army===undefined||u.armyStatus==='queued')continue;
  const units=members.get(u.army);
  if(units)units.push(u);else members.set(u.army,[u]);
 }
 const templates=state.armies.filter(a=>{
  const f=a.formation;if(!f||!members.has(a.id))return false;
  switch(workload){
   case 'march':return f.phase==='march'&&!f.retryAt;
   case 'bottleneck':return f.phase==='march'&&f.retryAt!==undefined;
   case 'landing':return f.phase==='sea'&&!f.route.points[f.route.index].sea;
   case 'battle':return f.phase==='battle'&&f.engaged;
   default:throw Error('Unknown workload '+workload);
  }
 });
 if(!templates.length)throw Error('Fixture has no '+workload+' templates');
 state.units=[];state.armies=[];state.nextId=1;state.nextArmy=1;
 for(const region of state.provinces)delete region.march;
 for(let group=0;group<330;group++){
  const template=templates[group%templates.length],troops=members.get(template.id);
  const groupSize=Math.floor((group+1)*10000/330)-Math.floor(group*10000/330);
  const subdivisions=Math.floor((group+1)*count/330)-Math.floor(group*count/330);
  for(let part=0;part<subdivisions;part++){
   const first=Math.floor(part*groupSize/subdivisions),end=Math.floor((part+1)*groupSize/subdivisions);
   const army=structuredClone(template);
   army.id=state.nextArmy++;army.size=end-first;
   army.formation.columns=Math.min(army.formation.columns,Math.ceil(Math.sqrt(army.size)));
   if(army.formation.readyCount!==undefined)army.formation.readyCount=Math.min(army.size,army.formation.readyCount);
   state.armies.push(army);
   for(let i=first;i<end;i++){
    const unit=structuredClone(troops[i%troops.length]);
    unit.id=state.nextId++;unit.army=army.id;state.units.push(unit);
   }
  }
 }
 if(!validateState(state))throw Error('Invalid '+workload+' fixture with '+count+' formations');
 return {state,canvas:snapshot.canvas};
}
