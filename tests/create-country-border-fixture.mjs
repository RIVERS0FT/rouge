import {createGame} from '../src/game/engine.ts';
import {MAP,BOUNDS,TERRITORY_TOPOLOGY,provinceByCode} from '../src/game/map.ts';
import {createTerritoryGrouping} from '../src/game/territoryGrouping.ts';
import {encodeSave,SAVE_PREFIX} from '../src/game/save.ts';
import {buildBorderEdges,classifyBorder} from '../src/render/territoryBorders.ts';
const state=createGame([{name:'Human',leader:'warden',loadout:['infantry']},{name:'AI country',leader:'warden',loadout:['infantry'],ai:true}],17,'border-review');
state.units=[];for(const p of state.provinces){p.owner=-1;p.production=0;}
// Two adjacent human territories, two adjacent AI territories and many neutral
// territories: one fixed view contains both border strengths without a battle.
const selected=provinceByCode('FRA-5275'),human=[selected,MAP[selected].neighbors[0]];
for(const id of human)state.provinces[id].owner=0;
const ai=MAP.find(p=>p.playable&&!human.includes(p.id)&&MAP[selected].neighbors.includes(p.id)&&p.neighbors.some(n=>!human.includes(n)));
if(!ai)throw Error('Missing adjacent country fixture');
const aiIds=[ai.id,ai.neighbors.find(n=>!human.includes(n))];for(const id of aiIds)state.provinces[id].owner=1;
state.grouping=createTerritoryGrouping(TERRITORY_TOPOLOGY);
const owners=state.provinces.map(p=>p.owner),groups=MAP.map(p=>state.grouping.atomToGroup[p.code]);
const counts={country:0,internal:0,coast:0,hidden:0};for(const edge of buildBorderEdges(MAP,BOUNDS))counts[classifyBorder(edge,owners,groups)]++;
console.log(JSON.stringify({key:SAVE_PREFIX+'border-review',value:encodeSave(state,'Country border fixture'),selectedCode:MAP[selected].code,aiCode:ai.code,counts}));
