/** Small tooling manifest of the actual runtime map, not a second geometry copy. */
import {readFile,writeFile} from 'node:fs/promises';
import {MAP,MAP_METADATA} from '../src/game/map.ts';
const manifest={...MAP_METADATA,provinces:MAP.map(p=>({id:p.code,code:p.code,name:p.name,neighbors:p.neighbors,sourceAtoms:p.sourceAtoms,playable:p.playable}))};
const output=new URL('../src/generated/gameplay-map.json',import.meta.url),text=JSON.stringify(manifest)+'\n';
let old;try{old=await readFile(output,'utf8');}catch{}
if(old!==text)await writeFile(output,text);
console.log(`Operational map: ${MAP.length} locked regions, ${MAP_METADATA.playableCount} playable; ${MAP_METADATA.sourceAtomCount} original atoms retained.`);
