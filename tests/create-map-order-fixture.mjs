// Deterministic territories for UI ownership and map-order regression coverage.
import {createGame} from '../src/game/engine.ts';
import {MAP,provinceByCode} from '../src/game/map.ts';
import {stats} from '../src/game/content.ts';
import {makeAISetups} from '../src/game/spawns.ts';
import {reconcileGrouping} from '../src/game/territoryEconomy.ts';
import {encodeSave,SAVE_PREFIX} from '../src/game/save.ts';
const state=createGame([{name:'Panel Commander',leader:'warden',loadout:['infantry']},...makeAISetups(1,77)],77,'map-order-qa');
const source=provinceByCode('DEU-3487'),target=provinceByCode('DEU-1574'),enemy=provinceByCode('USA-3521');
state.units=[];for(const p of state.provinces){p.owner=-1;p.production=0;}
for(const [region,owner] of [[source,0],[enemy,1]]){
 state.provinces[region].owner=owner;state.provinces[region].kind=state.players[owner].loadout[0];
}
for(let i=0;i<12;i++)state.units.push({id:state.nextId++,owner:0,kind:'infantry',...MAP[source].center,hp:stats(state.players[0],'infantry').hp,province:source,origin:source,target:null,destination:null,route:[],cooldown:0});
state.grouping=reconcileGrouping(state);
console.log(JSON.stringify({key:SAVE_PREFIX+'map-order-qa',value:encodeSave(state,'Map order fixture'),source,target,enemy,country:state.players[1].country,centers:{source:MAP[source].center,target:MAP[target].center}}));
