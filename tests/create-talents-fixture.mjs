import {createGame} from '../src/game/engine.ts';
import {encodeSave,SAVE_PREFIX} from '../src/game/save.ts';
const state=createGame([{name:'Queued choices',leader:'warden',loadout:['infantry']},{name:'Opponent',leader:'steward',loadout:['infantry']}],42,'queued-talents');
Object.assign(state.players[0],{level:3,xp:0,funds:120,drafts:2,choices:['fieldMedicine','forwardMarksmen','entrenchment']});
console.log(JSON.stringify({key:SAVE_PREFIX+'queued-talents',value:encodeSave(state,'Queued talent choices')}));
