import {createGame} from '../src/game/engine.ts';
import {MAP,provinceByCode} from '../src/game/map.ts';
import {reconcileGrouping} from '../src/game/territoryEconomy.ts';
import {encodeSave,SAVE_PREFIX} from '../src/game/save.ts';
const state=createGame([{name:'Karaganda review',leader:'warden',loadout:['infantry']},{name:'Other',leader:'steward',loadout:['infantry']}],42,'baikonur-review');
state.units=[];for(const p of state.provinces){p.owner=-1;p.production=0;}
const region=provinceByCode('KAZ-3203');state.provinces[region].owner=0;state.provinces[provinceByCode('CHN-1808')].owner=1;state.grouping=reconcileGrouping(state);
console.log(JSON.stringify({key:SAVE_PREFIX+'baikonur-review',value:encodeSave(state,'Baikonur merge fixture'),region,regionCount:MAP.length,savePrefix:SAVE_PREFIX}));
