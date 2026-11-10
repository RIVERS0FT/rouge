// A valid high-population QA save, not a claimed organically played campaign.
import {regionCapacity,reconcileGrouping} from '../src/game/territoryEconomy.ts';
import {createGame} from '../src/game/engine.ts';
import {MAP,provinceByCode} from '../src/game/map.ts';
import {PROVINCE_CAP,stats} from '../src/game/content.ts';
import {encodeSave,SAVE_PREFIX} from '../src/game/save.ts';
const state=createGame([{name:'容量回归演示',leader:'warden',loadout:['infantry']},{name:'Opponent',leader:'steward',loadout:['infantry']}],77,'capacity-qa');
state.units=[];for(const p of state.provinces){p.owner=-1;p.production=0;}
for(const [region,owner] of [...MAP.filter(p=>p.playable&&regionCapacity(p.id)===12&&p.code!=='USA-3521').slice(0,50).map(p=>[p.id,0]),[provinceByCode('USA-3521'),1]]){
 state.provinces[region].owner=owner;
 for(let k=0;k<PROVINCE_CAP;k++){const p=MAP[region];state.units.push({id:state.nextId++,owner,kind:'infantry',...p.center,hp:stats(state.players[owner],'infantry').hp,province:region,origin:region,target:null,destination:null,route:[],cooldown:0});}
}
state.grouping=reconcileGrouping(state);
console.log(JSON.stringify({key:SAVE_PREFIX+'capacity-qa',value:encodeSave(state,'Capacity regression fixture')}));
