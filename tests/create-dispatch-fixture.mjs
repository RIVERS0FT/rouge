// All event kinds, tied timestamps and long mixed-language names without AI churn.
import {createGame} from '../src/game/engine.ts';
import {MAP} from '../src/game/map.ts';
import {encodeSave,SAVE_PREFIX} from '../src/game/save.ts';
const names=['ABCDEFGHIJKLMNOPQRSTUVWX','卡拉达尔比亚联合共和国','قائد الحدود'];
const state=createGame(names.map(name=>({name,leader:'warden',loadout:['infantry']})),77,'dispatch-qa');
const longest=language=>MAP.filter(p=>p.playable).reduce((a,b)=>b.name[language].length>a.name[language].length?b:a).index;
const regions=[longest(0),longest(1)];
state.tick=120060;
state.events=[
 {tick:20,key:'capture',player:0,province:regions[0]},
 {tick:40,key:'level',player:1},
 {tick:120000,key:'level',player:0},
 {tick:120020,key:'capture',player:1,province:regions[0]},
 {tick:120020,key:'victory',player:2},
 {tick:120040,key:'capture',player:0,province:regions[1]},
];
console.log(JSON.stringify({
 saves:[{key:SAVE_PREFIX+'dispatch-qa',value:encodeSave(state,'Dispatch fixture')},{key:SAVE_PREFIX+'dispatch-empty',value:encodeSave({...state,events:[]},'Empty dispatch fixture')}],
 names,regions:regions.map(id=>MAP[id].name)
}));
