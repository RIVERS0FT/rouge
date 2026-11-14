import {MARCH_INTERVAL_TICKS} from '../src/game/engine.ts';
import {MAP} from '../src/game/map.ts';
import {countryActions} from '../src/game/countryActions.ts';
import {regionGarrison} from '../src/game/capacity.ts';
import {encodeSave,SAVE_PREFIX} from '../src/game/save.ts';
import {garrisonFixture} from './helpers/garrison-fixture.mjs';
const {e,from,to}=garrisonFixture();
e.state.players[0].flag={type:'custom',pattern:'solid',colors:['#a15632','#ffffff','#111111'],shapes:[{kind:'rect',x:2,y:3,width:14,height:15,color:'#889977'}]};
// Leave six slots at the friendly destination so full dispatch still leaves
// six units at home once the queue drains; the browser can load a stable count.
const template=e.state.units[0];
for(let i=0;i<6;i++)e.state.units.push({...template,id:e.state.nextId++,...MAP[to].center,province:to,origin:to});
if(!e.command(0,countryActions.march(from,to)).ok)throw Error('Cannot create departing garrison fixture');
e.step(5*MARCH_INTERVAL_TICKS);
if(e.state.provinces[from].march||regionGarrison(e.state,0,from)!==6)throw Error('Garrison fixture did not settle its dispatch queue');
console.log(JSON.stringify({key:SAVE_PREFIX+'garrison-qa',value:encodeSave(e.state,'Garrison regression fixture'),selectedCode:MAP[from].code,selected:from,neutralCode:MAP.find(p=>p.playable&&p.visible&&e.state.provinces[p.id].owner===-1).code}));
