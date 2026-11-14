import {MARCH_INTERVAL_TICKS} from '../src/game/engine.ts';
import {MAP} from '../src/game/map.ts';
import {encodeSave,SAVE_PREFIX} from '../src/game/save.ts';
import {garrisonFixture} from './helpers/garrison-fixture.mjs';
const {e,from,to}=garrisonFixture();
e.state.players[0].flag={type:'custom',pattern:'solid',colors:['#a15632','#ffffff','#111111'],shapes:[{kind:'rect',x:2,y:3,width:14,height:15,color:'#889977'}]};
if(!e.command(0,{type:'march',from,to,fraction:1}).ok)throw Error('Cannot create departing garrison fixture');
e.step(5*MARCH_INTERVAL_TICKS);
console.log(JSON.stringify({key:SAVE_PREFIX+'garrison-qa',value:encodeSave(e.state,'Garrison regression fixture'),selectedCode:MAP[from].code,selected:from,neutralCode:MAP.find(p=>p.playable&&p.visible&&e.state.provinces[p.id].owner===-1).code}));
