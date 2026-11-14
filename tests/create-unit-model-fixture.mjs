// Three isolated garrisons keep model counts observable without combat or AI.
import {createGame} from '../src/game/engine.ts';
import {MAP,provinceByCode,pointInProvince} from '../src/game/map.ts';
import {KINDS,stats} from '../src/game/content.ts';
import {regionCapacity,reconcileGrouping} from '../src/game/territoryEconomy.ts';
import {TerrainNavigator} from '../src/game/terrain-navigation.ts';
import {encodeSave,SAVE_PREFIX} from '../src/game/save.ts';
const state=createGame([{name:'Human',leader:'warden',loadout:['infantry']},{name:'Opponent',leader:'warden',loadout:['infantry']}],77,'unit-models');
const marching=process.argv.includes('--marching'),navigator=new TerrainNavigator();
state.units=[];
for(const province of state.provinces){province.owner=-1;province.production=0;}
const regions=[{code:'USA-3521',owner:0},{code:'BRA-1311',owner:1},{code:'AUS-2655',owner:-1}];
for(const {code,owner} of regions){
 const id=provinceByCode(code),province=MAP[id];
 if(regionCapacity(id)<KINDS.length)throw Error('Insufficient fixture capacity');
 state.provinces[id].owner=owner;
 for(const [i,kind] of KINDS.entries()){
  const x=province.center.x+Math.cos(i*Math.PI/4)*3,z=province.center.z+Math.sin(i*Math.PI/4)*3;
  if(!pointInProvince(id,x,z))throw Error('Fixture unit is outside its province');
  const destination=marching&&owner===0?province.neighbors.find(candidate=>MAP[candidate]?.playable):undefined;
  const travel=destination===undefined?null:navigator.plan({x,z},MAP[destination].center);
  if(marching&&owner===0&&!travel)throw Error('Marching fixture has no route');
  state.units.push({id:state.nextId++,owner,kind,x,z,hp:stats(state.players[owner],kind).hp,province:id,origin:id,target:destination??null,destination:destination??null,route:[],cooldown:0,...(travel?{travel}:{})});
 }
}
state.grouping=reconcileGrouping(state);
console.log(JSON.stringify({key:SAVE_PREFIX+'unit-models',value:encodeSave(state,'Unit model fixture'),regions:regions.map(({code,owner})=>({code,owner,capacity:regionCapacity(provinceByCode(code))})),count:KINDS.length,total:state.units.length}));
