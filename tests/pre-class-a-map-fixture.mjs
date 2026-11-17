import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {fileURLToPath} from 'node:url';

/** Isolate exact assertions about the explicitly changed historical layer
 * in that test file's worker. The entire current atlas and all raw data still
 * go through the default runtime tests and reviewed-class-a regressions. */
export function usePreClassAMapFixture() {
 const atlasUrl=new URL('../src/generated/world.json',import.meta.url).href;
 const spawnUrl=new URL('../data/spawn-sites.json',import.meta.url).href;
 const oldSpawnsUrl=new URL('./pre-class-a-spawn-sites.json',import.meta.url);
 const groupsUrl=new URL('../src/generated/gameplay-groups-before-class-a.json',import.meta.url);
 const correctionsUrl=new URL('../data/gameplay-anchor-corrections.json',import.meta.url).href;
 let injected;
 registerHooks({load(url,context,nextLoad){
  // Anchor corrections are the newest layer: the historical atlas predates them.
  if(url===correctionsUrl)return {source:JSON.stringify({schema:1,anchors:[],centers:[]}),format:'json',shortCircuit:true};
  if(url===spawnUrl){
   const before=JSON.parse(readFileSync(oldSpawnsUrl,'utf8'));
   const current=JSON.parse(readFileSync(fileURLToPath(spawnUrl),'utf8'));
   // Map identity is tested against the current protocol; indices must
   // correspond to the isolated partition just like normal production.
   return {source:JSON.stringify({...before,mapId:current.mapId}),format:'json',shortCircuit:true};
  }
  if(url!==atlasUrl)return nextLoad(url,context);
  if(!injected){
   const atlas=JSON.parse(readFileSync(fileURLToPath(atlasUrl),'utf8'));
   const groups=JSON.parse(readFileSync(groupsUrl,'utf8'));
   if(groups.length!==750||atlas.provinces.length!==4596)throw Error('Wrong previous management snapshot');
   injected=JSON.stringify({...atlas,gameplayGroups:groups});
  }
  return {source:injected,format:'json',shortCircuit:true};
 }});
}
