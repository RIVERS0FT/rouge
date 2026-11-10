/** Run after prepare:map. Derive every safe land-linked candidate and a maximum
 * non-overlapping allocation offline, so opening setup never runs pathfinding. */
import {writeFile} from 'node:fs/promises';
import {MAP,INITIAL_TERRITORY_GROUPING} from '../src/game/map.ts';
import {MAP_ID} from '../src/game/content.ts';
import {TerrainNavigator,TERRAIN_REVISION} from '../src/game/terrain-navigation.ts';
import {maximumMatching} from '../src/game/spawnMatching.ts';
const groups=INITIAL_TERRITORY_GROUPING.groups,groupOf=id=>INITIAL_TERRITORY_GROUPING.atomToGroup[MAP[id].code];
const groupIndex=new Map(groups.map((g,i)=>[g.id,i]));
const eligible=id=>MAP[id].playable&&groups[groupIndex.get(groupOf(id))].atoms.length<=12&&MAP[id].bounds.right-MAP[id].bounds.left>=6&&MAP[id].bounds.bottom-MAP[id].bounds.top>=6;
const nav=new TerrainNavigator(),reachable=new Map();
function reach(a,b){const key=`${a}:${b}`;if(reachable.has(key))return reachable.get(key);const plan=nav.plan(MAP[a].center,MAP[b].center),ok=!!plan&&plan.points.every(p=>!p.sea);reachable.set(key,ok);return ok;}
const neighbors=MAP.map(p=>eligible(p.id)?p.neighbors.filter(id=>eligible(id)&&groupOf(id)!==groupOf(p.id)&&reach(p.id,id)&&reach(id,p.id)):[]);
const graph=groups.map(()=>[]),edges=new Map();
for(const p of MAP)for(const other of neighbors[p.id]){
 if(other<=p.id)continue;
 const a=groupIndex.get(groupOf(p.id)),b=groupIndex.get(groupOf(other));
 // Both regions can expand outside their initial pair, even at full capacity.
 if(!neighbors[p.id].some(n=>groupOf(n)!==groupOf(other))||!neighbors[other].some(n=>groupOf(n)!==groupOf(p.id)))continue;
 const key=a<b?`${a}:${b}`:`${b}:${a}`;if(edges.has(key))continue;
 edges.set(key,[p.id,other]);graph[a].push(b);graph[b].push(a);
}
graph.forEach(list=>list.sort((a,b)=>a-b));
const matching=maximumMatching(graph),pairs=[];
for(let a=0;a<matching.length;a++){const b=matching[a];if(b>a)pairs.push(edges.get(`${a}:${b}`));}
const data={mapId:MAP_ID,terrainRevision:TERRAIN_REVISION,eligibleGroups:graph.filter(g=>g.length).length,candidatePairs:edges.size,pairs};
await writeFile(new URL('../data/spawn-sites.json',import.meta.url),JSON.stringify(data)+'\n');
console.log(`Spawn sites: ${pairs.length} non-overlapping pairs from ${edges.size} legal group links (${data.eligibleGroups} eligible groups).`);
