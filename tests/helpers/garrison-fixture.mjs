import {createGame,Engine} from '../../src/game/engine.ts';
import {MAP,provinceByCode} from '../../src/game/map.ts';
import {stats} from '../../src/game/content.ts';
import {reconcileGrouping} from '../../src/game/territoryEconomy.ts';

export function garrisonFixture({count=12,fromCode='DEU-3487',toCode='DEU-1574',targetOwner=0}={}){
 const state=createGame([{name:'Garrison QA',leader:'warden',loadout:['infantry']},{name:'Other',leader:'warden',loadout:['infantry']}],21,'garrison-qa');
 state.units=[];for(const p of state.provinces){p.owner=-1;p.production=0;}
 const from=provinceByCode(fromCode),to=provinceByCode(toCode);
 state.provinces[from].owner=0;state.provinces[to].owner=targetOwner;state.provinces[provinceByCode('USA-3521')].owner=1;
 for(let i=0;i<count;i++)state.units.push({id:state.nextId++,owner:0,kind:'infantry',...MAP[from].center,hp:stats(state.players[0],'infantry').hp,province:from,origin:from,target:null,destination:null,route:[],cooldown:0});
 state.grouping=reconcileGrouping(state);
 return {e:new Engine(state),from,to};
}
