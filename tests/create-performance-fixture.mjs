// Reproducible synthetic load. This is not an organically played campaign.
import {createGame} from '../src/game/engine.ts';
import {makeAISetups} from '../src/game/spawns.ts';
import {MAP,provinceByCode} from '../src/game/map.ts';
import {PROVINCE_CAP,stats} from '../src/game/content.ts';
import {regionCapacity,reconcileGrouping} from '../src/game/territoryEconomy.ts';
import {encodeSave,SAVE_PREFIX} from '../src/game/save.ts';
const players=Number(process.argv[2]??16),regions=Number(process.argv[3]??0);
const state=createGame([{name:'Performance Commander',leader:'warden',loadout:['infantry']},...makeAISetups(players-1,77)],77,`frame-profile-${players}-${regions}`);
const focus=provinceByCode('DEU-3487');
if(regions){
 state.units=[];for(const p of state.provinces){p.owner=-1;p.production=0;}
 const candidates=MAP.filter(p=>p.playable&&regionCapacity(p.id)===PROVINCE_CAP).sort((a,b)=>Math.hypot(a.center.x-MAP[focus].center.x,a.center.z-MAP[focus].center.z)-Math.hypot(b.center.x-MAP[focus].center.x,b.center.z-MAP[focus].center.z));
 for(const [i,p] of candidates.slice(0,regions).entries()){
  const owner=i%players;state.provinces[p.id].owner=owner;
  for(let n=0;n<PROVINCE_CAP;n++)state.units.push({id:state.nextId++,owner,kind:'infantry',...p.center,hp:stats(state.players[owner],'infantry').hp,province:p.id,origin:p.id,target:null,destination:null,route:[],cooldown:0});
 }
 state.grouping=reconcileGrouping(state);
}
console.log(JSON.stringify({key:SAVE_PREFIX+'frame-profile',value:encodeSave(state,'Frame profile fixture'),focus,activeFocus:state.provinces.find(p=>p.owner===0).id,units:state.units.length,players}));
