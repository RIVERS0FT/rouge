import {createGame} from '../src/game/engine.ts';
import {MAP} from '../src/game/map.ts';
import {makeAISetups} from '../src/game/spawns.ts';
import {assignCountryNames} from '../src/game/countryNames.ts';
import {encodeSave,SAVE_PREFIX} from '../src/game/save.ts';
const state=createGame([{name:'Alice 王',leader:'warden',loadout:['infantry']},{name:'Bob 的国',leader:'warden',loadout:['infantry']},...makeAISetups(3)],17,'country-name-review');
state.units=[];for(const p of state.provinces){p.owner=-1;p.production=0;}
// Readable known countries, two human names, AI names, neutral surroundings and
// a disconnected overseas possession. No troops move during the visual check.
const roots=['USA','RUS','CHN','BRA','AUS'];
for(const p of state.provinces){const prefix=MAP[p.id].code.slice(0,3),owner=roots.indexOf(prefix);if(owner>=0&&MAP[p.id].playable)p.owner=owner;}
const extra=MAP.find(p=>p.playable&&p.code.startsWith('FJI'));if(extra)state.provinces[extra.id].owner=0;
for(const p of state.players)delete p.country;
const origins=roots.map(root=>MAP.find(p=>p.playable&&p.code.startsWith(root)));assignCountryNames(state.players,origins);
console.log(JSON.stringify({key:SAVE_PREFIX+'country-name-review',value:encodeSave(state,'Country names fixture'),origins:origins.map(p=>p.code),players:state.players.map(p=>({id:p.id,name:p.name,country:p.country}))}));
