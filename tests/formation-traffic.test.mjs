import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,MARCH_INTERVAL_TICKS} from '../src/game/engine.ts';
import {provinceAt,provinceByCode,MAP} from '../src/game/map.ts';
import {stats} from '../src/game/content.ts';
import {updateFormations} from '../src/game/armyMovement.ts';
import {TerrainNavigator,TERRAIN_REVISION} from '../src/game/terrain-navigation.ts';
import {decodeSave,encodeSave} from '../src/game/save.ts';

// Four adjacent formations from the Bohemia queue, all ordered to the Rif.
function queue(rows=[
  [1649,143.22519,-546.74136,2.08037,1,141.21593,-543.40861],
  [3450,141.16484,-546.91306,2.21964,2,138.53363,-543.44359],
  [1521,141.34678,-543.52562,-.07957,1,141.21593,-543.40861],
  [665,140.02906,-544.54186,-.33036,1,383.48284,-628.02903],
 ],targetCode='ESP-5815'){
 const state=createGame(['A','B'].map(name=>({name,leader:'steward',loadout:['infantry']})),45);
 state.tick=13878;state.units=[];state.players[0].upgrades.infantry.speed=8;
 const target=provinceByCode(targetCode),nav=new TerrainNavigator();
 state.provinces[target].owner=1;
 for(const [id,x,z,heading,columns,gx,gz,count=4] of rows){
  const from=provinceAt(x,z),goal={x:gx,z:gz},tail=nav.plan(goal,MAP[target].center,3,5,false,20);
  const route={index:1,revision:TERRAIN_REVISION,points:[{x,z,sea:false},...tail.points]};
  state.provinces[from].owner=0;state.nextArmy=Math.max(state.nextArmy,id+1);
  state.armies.push({id,owner:0,to:target,size:count,formed:0,formation:{phase:'march',from,position:{x,z},route,heading,columns,lastContact:0}});
  for(let i=0;i<count;i++){
   const forward=(Math.floor((count-1)/columns)/2-Math.floor(i/columns)),side=i%columns-(columns-1)/2;
   const px=x+Math.cos(heading)*forward-Math.sin(heading)*side,pz=z+Math.sin(heading)*forward+Math.cos(heading)*side;
   state.units.push({id:state.nextId++,owner:0,origin:from,province:provinceAt(px,pz),x:px,z:pz,kind:'infantry',hp:stats(state.players[0],'infantry').hp,
    army:id,armyStatus:'formed',target,destination:target,assault:target,route:[],cooldown:0});
  }
 }
 return state;
}

test('a Senegal boarding queue and a vessel at the coastal bend reach the Cape Verde town',()=>{
 const shore={x:-150.3361975799993,z:-119.74457427875518};
 const state=queue([
  [3811,-147.6859030989485,-117.26624967237004,-2.38971,2,shore.x,shore.z],
  [3901,-148.28089525755678,-122.53371432966713,2.10264,1,-150.1305533227277,-119.39014294093573],
  [4325,-146.20756019790963,-115.8838321280123,-2.38971,2,shore.x,shore.z],
 ],'CPV-5041');
 const target=state.armies[0].to,nav=new TerrainNavigator();
 const water=[
  [-151.06339755999934,-120.16860245996388],[-152.39003058999913,-119.38946596640052],
  [-155.01126827337285,-119.47882277845753],[-162.971627816666,-115.25954462920144],
  [-163.51124640999927,-114.07390084438713],[-235.16651984999925,-150.22105037790107],
 ].map(([x,z])=>({x,z,sea:true}));
 for(const a of state.armies){
  const f=a.formation;f.blockedSince=state.tick-50;
  const turn=a.id===3901?[{x:-150.1305533227277,z:-119.39014294093573,sea:false}]:[];
  f.route.points=[{...f.position,sea:false},...turn,{...shore,sea:false},...water,{...MAP[target].center,sea:false}];
 }
 const lead=structuredClone(state.armies[0]),f=lead.formation;lead.id=state.nextArmy++;
 f.phase='sea';f.position={x:-162.893475904676,z:-115.14157311292608};f.route.index=6;
 state.armies.push(lead);
 for(const u of state.units.filter(u=>u.army===state.armies[0].id)){
  state.units.push({...u,...f.position,id:state.nextId++,army:lead.id,armyStatus:'sea',transport:{from:f.from,to:target,index:f.route.index,embarked:true}});
 }
 let restored=false;
 for(let i=0;i<3600&&state.armies.some(a=>a.formation.phase!=='enter');i++){
  state.tick++;updateFormations(state,nav,MARCH_INTERVAL_TICKS,(owner,k)=>stats(state.players[owner],k),()=>{},()=>{});
  if(!restored&&state.armies.some(a=>a.formation.replannedAt===state.tick)){
   Object.assign(state,decodeSave(encodeSave(state,'Coast')).state);restored=true;
  }
 }
 assert.ok(restored);assert.ok(state.armies.every(a=>a.formation.phase==='enter'));
 assert.ok(state.units.every(u=>u.province===target&&!u.transport));
});

test('the two recovery slots serve older waits even when newer armies occur first in the array',()=>{
 const state=queue(),nav=new TerrainNavigator();state.tick=15000;
 // All three requests are due this tick. The first army has already been served.
 state.armies=state.armies.slice(0,3);
 state.units=state.units.filter(u=>state.armies.some(a=>a.id===u.army));
 for(const [index,a] of state.armies.entries()){
  const id=24*(index+1);for(const u of state.units)if(u.army===a.id)u.army=id;
  a.id=id;a.formation.blockedSince=state.tick-900;
 }
 state.armies[0].formation.replannedAt=state.tick-500;
 updateFormations(state,nav,MARCH_INTERVAL_TICKS,(owner,k)=>stats(state.players[owner],k),()=>{},()=>{});
 assert.deepEqual(state.armies.map(a=>a.formation.replannedAt),[state.tick-500,state.tick,state.tick]);
});

test('a packed friendly queue yields, stays separated, and resumes identically from a save',()=>{
 const state=queue(),initial=state.armies.map(a=>a.formation.position),nav=new TerrainNavigator();
 const step=(s,n)=>{s.tick++;updateFormations(s,n,MARCH_INTERVAL_TICKS,(owner,k)=>stats(s.players[owner],k),()=>{},()=>{});};
 let saved,restoredNav,hadWait=false;
 for(let i=0;i<220;i++){
  step(state,nav);if(saved)step(saved,restoredNav);
  if(state.armies.some(a=>a.formation.blockedSince!==undefined))hadWait=true;
  if(!saved&&state.armies.some(a=>a.formation.yieldPoint)){
   saved=decodeSave(encodeSave(state,'Traffic')).state;restoredNav=new TerrainNavigator();
  }
  for(const [i,a] of state.units.entries())for(const b of state.units.slice(i+1)){
   if(a.army!==b.army)assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=.92-1e-6);
  }
 }
 assert.ok(hadWait&&saved);assert.deepEqual(saved.armies,state.armies);assert.deepEqual(saved.units,state.units);
 for(const [i,a] of state.armies.entries())assert.ok(Math.hypot(a.formation.position.x-initial[i].x,a.formation.position.z-initial[i].z)>1);
});

test('formations that already overlap after a battle can separate and continue marching',()=>{
 const goal=[145.68818,-486.51176];
 const state=queue([
  [1649,148.11458,-526.99117,2.47989,2,...goal,3],
  [1771,146.70666,-527.28925,2.47560,2,...goal],
  [4077,149.48365,-527.40512,2.48188,2,...goal],
  [4445,147.10612,-525.68278,2.48150,2,...goal],
 ]);
 const initial=state.armies.map(a=>a.formation.position),nav=new TerrainNavigator();
 for(let i=0;i<260;i++){
  state.tick++;updateFormations(state,nav,MARCH_INTERVAL_TICKS,(owner,k)=>stats(state.players[owner],k),()=>{},()=>{});
 }
 for(const [i,a] of state.armies.entries())assert.ok(Math.hypot(a.formation.position.x-initial[i].x,a.formation.position.z-initial[i].z)>4);
 for(const [i,a] of state.units.entries())for(const b of state.units.slice(i+1)){
  if(a.army!==b.army)assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=.92-1e-6);
 }
});
