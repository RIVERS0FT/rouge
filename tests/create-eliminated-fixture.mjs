import {createGame,Engine} from '../src/game/engine.ts';
import {countryActions} from '../src/game/countryActions.ts';
import {MAP,provinceByCode} from '../src/game/map.ts';
import {reconcileGrouping} from '../src/game/territoryEconomy.ts';
import {encodeSave,SAVE_PREFIX} from '../src/game/save.ts';
const state=createGame([0,1,2].map(id=>({name:`Country ${id+1}`,leader:'warden',loadout:['infantry'],ai:id!==0})),45,'eliminated-ui');
for(const p of state.provinces)if(p.owner===0)p.owner=-1;
state.units=state.units.filter(u=>u.owner!==0);
state.players[0].choices=['industry'];state.players[0].drafts=1;
// A marching army and a separate fight between the surviving AI countries.
const source=provinceByCode('DEU-3487'),battle=provinceByCode('DEU-1574');
state.provinces[source].owner=1;state.provinces[battle].owner=2;
state.grouping=reconcileGrouping(state);
state.units=state.units.filter(u=>u.province!==source&&u.province!==battle);
for(const [owner,region,count] of [[1,source,6],[1,battle,4],[2,battle,5]]){
 const template=state.units.find(u=>u.owner===owner);
 for(let i=0;i<count;i++)state.units.push({...template,...MAP[region].center,id:state.nextId++,province:region,origin:region});
}
const engine=new Engine(state);
if(!engine.command(1,countryActions.march(source,battle)).ok)throw Error('Fixture march failed');
engine.state.battles.push({id:engine.state.nextBattle++,region:battle,start:0,last:0,sides:[{owner:1,losses:0},{owner:2,losses:0}]});
if(engine.state.winner!==null)throw Error('Fixture must not declare a global winner');
console.log(JSON.stringify({key:SAVE_PREFIX+'eliminated-ui',value:encodeSave(engine.state,'Eliminated country fixture'),sourceCode:MAP[source].code,battleCode:MAP[battle].code,battleRegion:battle,army:engine.state.armies[0].id}));
