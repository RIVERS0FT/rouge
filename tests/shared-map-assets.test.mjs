import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'vite';
import {sharedMapAssets} from '../scripts/shared-map-assets.ts';
import {loadSharedMapAsset} from '../src/platform/sharedMapAsset.ts';

test('shared map downloads reuse the HTTP cache, with explicit development revalidation',async t=>{
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls.push({url,options});return new Response('{"mapId":"test"}');
  });
  assert.deepEqual(await loadSharedMapAsset('/assets/world-hash.json','world map'),{mapId:'test'});
  await loadSharedMapAsset('/src/generated/world.json','world map','no-cache');
  assert.deepEqual(calls,[
    {url:'/assets/world-hash.json',options:{cache:'force-cache'}},
    {url:'/src/generated/world.json',options:{cache:'no-cache'}},
  ]);
});

test('failed downloads and invalid JSON reject startup instead of returning empty map data',async t=>{
  const networkError=new TypeError('offline');
  const fetch=t.mock.method(globalThis,'fetch',async()=>{throw networkError;});
  await assert.rejects(loadSharedMapAsset('/map.json','world map'),error=>{
    assert.equal(error.message,'Failed to download world map');assert.equal(error.cause,networkError);return true;
  });
  fetch.mock.mockImplementation(async()=>new Response('missing',{status:404}));
  await assert.rejects(loadSharedMapAsset('/map.json','world map'),/world map: HTTP 404/);
  fetch.mock.mockImplementation(async()=>new Response('<html>fallback</html>'));
  await assert.rejects(loadSharedMapAsset('/terrain.json','terrain navigation'),/Invalid terrain navigation data/);
});

test('production app and ES worker share hashed JSON URLs without embedding either payload',async t=>{
  const root=await mkdtemp(join(tmpdir(),'rouge-shared-assets-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'src/generated'),{recursive:true});
  await mkdir(join(root,'src/platform'),{recursive:true});
  const world={mapId:'shared-world-payload-must-not-be-javascript'},terrain={mapId:'shared-terrain-payload-must-not-be-javascript'};
  await Promise.all([
    writeFile(join(root,'src/generated/world.json'),JSON.stringify(world)),
    writeFile(join(root,'src/generated/terrain-navigation.json'),JSON.stringify(terrain)),
    writeFile(join(root,'src/generated/world.js'),"export {default} from './world.json' with {type:'json'};"),
    writeFile(join(root,'src/platform/sharedMapAsset.ts'),await readFile(new URL('../src/platform/sharedMapAsset.ts',import.meta.url))),
    writeFile(join(root,'index.html'),'<script type="module" src="/main.ts"></script>'),
    writeFile(join(root,'main.ts'),`
      import world from './src/generated/world.js';
      import terrain from './src/generated/terrain-navigation.json' with {type:'json'};
      import workerUrl from './worker.ts?worker&url';
      console.log(world,terrain,new Worker(workerUrl,{type:'module'}));
    `),
    writeFile(join(root,'worker.ts'),`
      import world from './src/generated/world.js';
      import terrain from './src/generated/terrain-navigation.json' with {type:'json'};
      self.postMessage({world,terrain});
    `),
  ]);
  const result=await build({
    root,configFile:false,base:'./',logLevel:'silent',plugins:[sharedMapAssets(root)],
    worker:{format:'es',plugins:()=>[sharedMapAssets(root)]},
    build:{target:'es2022',write:false},
  });
  const output=result.output;
  const json=output.filter(file=>file.fileName.endsWith('.json'));
  assert.equal(json.length,2,'each asset is emitted once, even when it is small enough to inline');
  for(const name of ['world','terrain-navigation'])assert.equal(json.filter(file=>new RegExp(`^assets/${name}-[\\w-]+\\.json$`).test(file.fileName)).length,1);
  const app=output.find(file=>file.type==='chunk'&&file.isEntry);
  const worker=output.find(file=>/^assets\/worker-.*\.js$/.test(file.fileName));
  assert.ok(app);assert.ok(worker);
  const workerCode=String(worker.type==='asset'?worker.source:worker.code);
  for(const [fileName,code]of [[app.fileName,app.code],[worker.fileName,workerCode]]){
    assert.doesNotMatch(code,/shared-(?:world|terrain)-payload-must-not-be-javascript/);
    assert.doesNotMatch(code,/data:application\/json/);
    assert.match(code,/await /,'module must finish loading data before advertising readiness');
    for(const asset of json){
      const basename=asset.fileName.split('/').at(-1);
      assert.ok(code.includes(basename),`${fileName} references ${basename}`);
      const assetReference=code.match(new RegExp(`new URL\\(["']([^"']*${basename.replaceAll('.','\\.')})["'],\\s*import\\.meta\\.url\\)`));
      assert.ok(assetReference,'relative-base assets resolve against the module, not the page');
      const actual=new URL(assetReference[1],`https://example.test/rouge/${fileName}`).href;
      assert.equal(actual,`https://example.test/rouge/${asset.fileName}`);
    }
  }
  for(const asset of json)assert.deepEqual(JSON.parse(String(asset.source)),asset.fileName.includes('terrain-navigation-')?terrain:world);

  // Run the emitted worker body, holding both fetch responses. This catches
  // production-only serialization of top-level awaits, not just source intent.
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const execute=new AsyncFunction('fetch','self',workerCode.replaceAll('import.meta.url',JSON.stringify(`https://example.test/rouge/${worker.fileName}`)));
  const requests=[],messages=[];
  const completed=execute((url,options)=>new Promise(resolve=>requests.push({url,options,resolve})),{postMessage:message=>messages.push(message)});
  assert.equal(requests.length,2,'both map downloads start before either response resolves');
  assert.deepEqual(messages,[],'worker cannot start before the map downloads complete');
  for(const request of requests){
    assert.equal(request.options.cache,'force-cache');
    request.resolve(new Response(JSON.stringify(request.url.includes('terrain-navigation-')?terrain:world)));
  }
  await completed;
  assert.deepEqual(messages,[{world,terrain}]);
});
