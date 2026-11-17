// A single tactical viewport contains one completed instance of each facility.
import {TOWNS} from '../src/game/buildings.ts';
import {CONSTRUCTION_KINDS} from '../src/game/construction.ts';
import {createGame} from '../src/game/engine.ts';
import {MAP,provinceByCode} from '../src/game/map.ts';
import {encodeSave,SAVE_PREFIX} from '../src/game/save.ts';
import {reconcileGrouping} from '../src/game/territoryEconomy.ts';

const name='Modern buildings fixture';
const selectedCode='DEU-1599';
const sites=[selectedCode,'DEU-1600','DEU-3488'].map(provinceByCode);
const far=provinceByCode('AUS-2655');
if(new Set(sites).size!==CONSTRUCTION_KINDS.length||sites.some(id=>!MAP[id]?.playable||TOWNS[id].length<2)||!MAP[far]?.playable)throw Error('Modern-building fixture needs three independent ground anchors and a distant opponent');
const center=MAP[sites[0]].center;
if(sites.some(id=>Math.hypot(MAP[id].center.x-center.x,MAP[id].center.z-center.z)>25))throw Error('Facility anchors are no longer in the same tactical viewport');

const state=createGame([{name:'Human',leader:'warden',loadout:['infantry']},{name:'Opponent',leader:'warden',loadout:['infantry']}],27,'modern-buildings');
state.units=[];
for(const p of state.provinces){p.owner=-1;p.production=0;}
for(const [i,kind] of CONSTRUCTION_KINDS.entries()){
 const p=state.provinces[sites[i]];
 p.owner=0;p.kind='infantry';p.construction={kind,level:1};
}
state.provinces[far].owner=1;state.provinces[far].kind='infantry';
state.grouping=reconcileGrouping(state);
console.log(JSON.stringify({key:SAVE_PREFIX+'modern-buildings',value:encodeSave(state,name),selectedCode,name}));
