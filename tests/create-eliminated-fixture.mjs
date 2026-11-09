import {createGame} from '../src/game/engine.ts';
import {encodeSave,SAVE_PREFIX} from '../src/game/save.ts';
const state=createGame([0,1,2].map(id=>({name:`Faction ${id}`,leader:'warden',loadout:['infantry'],ai:false})),45,'eliminated-ui');
for(const p of state.provinces)if(p.owner===0)p.owner=-1;
state.units=state.units.filter(u=>u.owner!==0);
state.players[0].choices=['industry'];state.players[0].drafts=1;
if(state.winner!==null)throw Error('Fixture must not declare a global winner');
console.log(JSON.stringify({key:SAVE_PREFIX+'eliminated-ui',value:encodeSave(state,'Eliminated faction fixture')}));
