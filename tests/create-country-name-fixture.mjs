import {createGame} from '../src/game/engine.ts';
import {MAP} from '../src/game/map.ts';
import {makeAISetups} from '../src/game/spawns.ts';
import {buildCountryLabels} from '../src/render/countryLabels.ts';
import {nearestWorldX} from '../src/game/geo.ts';
import {assignCountryNames} from '../src/game/countryNames.ts';
import {encodeSave,SAVE_PREFIX} from '../src/game/save.ts';
const state=createGame([{name:'Alice 王',leader:'warden',loadout:['infantry']},{name:'Bob 的国',leader:'warden',loadout:['infantry']},...makeAISetups(3)],17,'country-name-review');
state.units=[];for(const p of state.provinces){p.owner=-1;p.production=0;}
// Readable known countries, two human names, AI names, neutral surroundings and
// a disconnected overseas possession. No troops move during the visual check.
const roots=['USA','RUS','CHN','BRA','AUS'];
for(const p of state.provinces){const prefix=MAP[p.id].code.slice(0,3),owner=roots.indexOf(prefix);if(owner>=0&&MAP[p.id].playable){p.owner=owner;p.kind=state.players[owner].loadout[0];}}
const extra=MAP.find(p=>p.playable&&p.code.startsWith('FJI'));if(extra){state.provinces[extra.id].owner=0;state.provinces[extra.id].kind=state.players[0].loadout[0];}
for(const p of state.players)delete p.country;
const origins=roots.map(root=>MAP.find(p=>p.playable&&p.code.startsWith(root)));assignCountryNames(state.players,origins);
const labels=buildCountryLabels(MAP,state.provinces.map(p=>p.owner));
const labelAnchors=Object.fromEntries(labels.map(c=>[c.owner,c.anchor]));
const labelFocusRegions=Object.fromEntries(labels.map(c=>[c.owner,MAP.filter(p=>p.playable).sort((a,b)=>Math.hypot(nearestWorldX(a.center.x,c.anchor.x)-c.anchor.x,a.center.z-c.anchor.z)-Math.hypot(nearestWorldX(b.center.x,c.anchor.x)-c.anchor.x,b.center.z-c.anchor.z))[0].code]));
console.log(JSON.stringify({labelAnchors,labelFocusRegions,key:SAVE_PREFIX+'country-name-review',value:encodeSave(state,'Country names fixture'),origins:origins.map(p=>p.code),players:state.players.map(p=>({id:p.id,name:p.name,country:p.country}))}));
