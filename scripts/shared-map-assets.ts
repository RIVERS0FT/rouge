import {dirname,isAbsolute,resolve} from 'node:path';
import {normalizePath,type Plugin} from 'vite';

/** Keep the existing synchronous Node imports, but make the two browser module
 * graphs fetch the same JSON assets. Virtual IDs avoid running Vite's JSON
 * transform on loader code. ?url&no-inline is deliberately NOT intercepted. */
export function sharedMapAssets(root:string):Plugin{
  const generated=resolve(root,'src/generated');
  const world=resolve(generated,'world.json'),terrain=resolve(generated,'terrain-navigation.json');
  const worldId='\0rouge:shared-map-world',terrainId='\0rouge:shared-map-terrain';
  const dataId='\0rouge:shared-map-data';
  const helper=normalizePath(resolve(root,'src/platform/sharedMapAsset.ts'));
  return{
    name:'rouge-shared-map-assets',
    enforce:'pre',
    resolveId(source,importer){
      if(source===dataId)return dataId;
      if(source.includes('?')||source.startsWith('\0'))return null;
      const path=isAbsolute(source)?resolve(source):importer&&source.startsWith('.')?resolve(dirname(importer),source):null;
      if(path===world||path===resolve(generated,'world.js'))return worldId;
      if(path===terrain)return terrainId;
      return null;
    },
    load(id){
      if(id===worldId)return `export {world as default} from ${JSON.stringify(dataId)};`;
      if(id===terrainId)return `export {terrain as default} from ${JSON.stringify(dataId)};`;
      if(id!==dataId)return null;
      // Rollup/Vite hashes the same source bytes to the same output filename in
      // the app and worker builds, with URLs relative to each emitted module.
      // Start both downloads before awaiting. Separate top-level awaits would
      // become serial downloads when Rollup flattens the production modules.
      return `import worldUrl from ${JSON.stringify(normalizePath(world)+'?url&no-inline')};\n`+
        `import terrainUrl from ${JSON.stringify(normalizePath(terrain)+'?url&no-inline')};\n`+
        `import {loadSharedMapAsset} from ${JSON.stringify(helper)};\n`+
        `const cache=import.meta.env.DEV?'no-cache':'force-cache';\n`+
        `export const [world,terrain]=await Promise.all([loadSharedMapAsset(worldUrl,'world map',cache),loadSharedMapAsset(terrainUrl,'terrain navigation',cache)]);\n`;
    },
  };
}
