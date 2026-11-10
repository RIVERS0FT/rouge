import {createGame} from '../src/game/engine.ts';
import {MAP} from '../src/game/map.ts';
import {encodeSave,SAVE_PREFIX} from '../src/game/save.ts';
import {factionColor} from '../src/game/factionColors.ts';
const flag={type:'custom',pattern:'solid',colors:['#ff0000','#00ff00','#0000ff']};
const setups=Array.from({length:16},(_,id)=>({name:`Palette ${id+1}`,leader:'warden',loadout:['infantry'],ai:false,...(id===0?{flag}:{})}));
const state=createGame(setups,29,'palette-review');
state.events=[0,3,12,15].map(player=>({tick:0,key:'level',player}));
const samples=[0,3,12,15,-1].map(owner=>{
 const province=state.provinces.find(p=>p.owner===owner&&MAP[p.id].playable);
 if(!province)throw Error(`Missing palette fixture owner ${owner}`);
 return {owner,code:MAP[province.id].code,color:factionColor(owner).slice(1),name:owner<0?'Neutral':`Palette ${owner+1}`};
});
console.log(JSON.stringify({key:SAVE_PREFIX+'palette-review',value:encodeSave(state,'Historical palette fixture'),samples}));
