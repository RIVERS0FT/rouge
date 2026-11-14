/** Run after prepare:map. Derive every safe land-linked candidate offline. */
import {writeFile} from 'node:fs/promises';
import {MAP,INITIAL_TERRITORY_GROUPING} from '../src/game/map.ts';
import {MAP_ID} from '../src/game/content.ts';
import {TerrainNavigator,TERRAIN_REVISION} from '../src/game/terrain-navigation.ts';
const groups=INITIAL_TERRITORY_GROUPING.groups,groupOf=id=>INITIAL_TERRITORY_GROUPING.atomToGroup[MAP[id].code];
const groupIndex=new Map(groups.map((g,i)=>[g.id,i]));
const eligible=id=>MAP[id].playable&&groups[groupIndex.get(groupOf(id))].atoms.length<=12&&MAP[id].bounds.right-MAP[id].bounds.left>=6&&MAP[id].bounds.bottom-MAP[id].bounds.top>=6;
const nav=new TerrainNavigator(),reachable=new Map();
function reach(a,b){const key=`${a}:${b}`;if(reachable.has(key))return reachable.get(key);const plan=nav.plan(MAP[a].center,MAP[b].center),ok=!!plan&&plan.points.every(p=>!p.sea);reachable.set(key,ok);return ok;}
const neighbors=MAP.map(p=>eligible(p.id)?p.neighbors.filter(id=>eligible(id)&&groupOf(id)!==groupOf(p.id)&&reach(p.id,id)&&reach(id,p.id)):[]);
const regions=MAP.filter(p=>neighbors[p.id].length>0).map(p=>p.id);
const data={regions,mapId:MAP_ID,terrainRevision:TERRAIN_REVISION};
await writeFile(new URL('../data/spawn-sites.json',import.meta.url),JSON.stringify(data)+'\n');
console.log(`Spawn sites: ${regions.length} eligible single regions with a legal land exit.`);
