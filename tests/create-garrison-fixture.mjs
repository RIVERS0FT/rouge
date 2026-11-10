import {MAP} from '../src/game/map.ts';
import {encodeSave,SAVE_PREFIX} from '../src/game/save.ts';
import {garrisonFixture} from './helpers/garrison-fixture.mjs';
const {e,from,to}=garrisonFixture();
if(!e.command(0,{type:'march',from,to,fraction:.5}).ok)throw Error('Cannot create departing garrison fixture');
console.log(JSON.stringify({key:SAVE_PREFIX+'garrison-qa',value:encodeSave(e.state,'Garrison regression fixture'),selectedCode:MAP[from].code}));
