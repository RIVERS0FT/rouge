// A valid high-population QA save, not a claimed organically played campaign.
import {regionCapacity,reconcileGrouping} from '../src/game/territoryEconomy.ts';
import {createGame} from '../src/game/engine.ts';
import {MAP,provinceByCode} from '../src/game/map.ts';
import {PROVINCE_CAP,stats} from '../src/game/content.ts';
import {TerrainNavigator,terrainSegment} from '../src/game/terrain-navigation.ts';
import {encodeSave,SAVE_PREFIX} from '../src/game/save.ts';
const state=createGame([{name:'容量回归演示',leader:'warden',loadout:['infantry']},{name:'Opponent',leader:'steward',loadout:['infantry']}],77,'capacity-qa');
const marching=process.argv.includes('--marching'),navigator=new TerrainNavigator();
state.units=[];for(const p of state.provinces){p.owner=-1;p.production=0;}
const adjacent=p=>p.neighbors.find(candidate=>MAP[candidate]?.playable&&terrainSegment(p.center,MAP[candidate].center,false));
const playerRegions=MAP.filter(p=>p.playable&&regionCapacity(p.id)===12&&p.code!=='USA-3521'&&(!marching||adjacent(p)!==undefined)).slice(0,50);
if(playerRegions.length!==50)throw Error('Insufficient capacity fixture regions');
for(const [region,owner] of [...playerRegions.map(p=>[p.id,0]),[provinceByCode('USA-3521'),1]]){
 state.provinces[region].owner=owner;
 const p=MAP[region],destination=marching&&owner===0?adjacent(p):undefined;
 const travel=destination===undefined?null:navigator.plan(p.center,MAP[destination].center);
 if(marching&&owner===0&&!travel)throw Error(`No marching fixture route from ${p.code}`);
 for(let k=0;k<PROVINCE_CAP;k++){state.units.push({id:state.nextId++,owner,kind:'infantry',...p.center,hp:stats(state.players[owner],'infantry').hp,province:region,origin:region,target:destination??null,destination:destination??null,route:[],cooldown:0,...(travel?{travel}:{})});}
}
state.grouping=reconcileGrouping(state);
console.log(JSON.stringify({key:SAVE_PREFIX+'capacity-qa',value:encodeSave(state,'Capacity regression fixture')}));
