import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {WORLD_BOUNDS,CROP_ID,PROJECTION_ID,project,unproject} from '../src/game/geo.ts';
import {surfaceUv,compactSurface,reliefMultiplier,RELIEF_MIDPOINT} from '../src/render/mapSurfaceConfig.ts';
const audit=JSON.parse(readFileSync(new URL('../data/map-surfaces-audit.json',import.meta.url)));

test('visual rasters match the exact Miller crop, orientation and pixel-center registration',()=>{
 assert.deepEqual(audit.bounds,WORLD_BOUNDS);assert.equal(audit.crop,CROP_ID);assert.equal(audit.projection,PROJECTION_ID);
 assert.deepEqual(surfaceUv(WORLD_BOUNDS.left,WORLD_BOUNDS.top),{u:0,v:1});
 assert.deepEqual(surfaceUv(WORLD_BOUNDS.right,WORLD_BOUNDS.bottom),{u:1,v:0});
 for(const [lon,lat] of [[0,0],[86,28],[-70,-20],[140,36],[-155,60]]){
  const p=project(lon,lat),uv=surfaceUv(p.x,p.z);
  const roundTrip=unproject(uv.u*3600-1800,WORLD_BOUNDS.bottom-uv.v*(WORLD_BOUNDS.bottom-WORLD_BOUNDS.top));
  assert.ok(Math.abs(roundTrip.lon-lon)<1e-9);assert.ok(Math.abs(roundTrip.lat-lat)<1e-9);
 }
 for(const value of Object.values(audit.sources)){
  assert.deepEqual(value.size,[10800,5400]);assert.match(value.archiveSha256,/^[a-f0-9]{64}$/);
  assert.ok(Math.abs(value.worldFile[4]+180-1/60)<1e-9);assert.ok(Math.abs(value.worldFile[5]-90+1/60)<1e-9);
 }
});
test('bundled raster bytes, dimensions and budgets are recorded with public-domain provenance',()=>{
 let full=0,compact=0;
 for(const [name,entry] of Object.entries(audit.outputs)){
  const buffer=readFileSync(new URL('../src/assets/map/'+name,import.meta.url));
  assert.equal(createHash('sha256').update(buffer).digest('hex'),entry.sha256);assert.equal(buffer.length,entry.bytes);
  assert.equal(buffer.subarray(0,4).toString(),'RIFF');assert.equal(buffer.subarray(8,12).toString(),'WEBP');
  assert.equal(entry.height,Math.round(entry.width*(WORLD_BOUNDS.bottom-WORLD_BOUNDS.top)/3600));
  if(name==='natural-earth-relief-4096.webp')full+=entry.bytes;else compact+=entry.bytes;
 }
 assert.ok(full<610_000);assert.ok(compact<170_000);assert.equal(audit.ocean.externalAssets,false);assert.equal(audit.ocean.simulationChanged,false);assert.equal(audit.license,'public-domain');
});
test('subtle scalar relief preserves flat political color and stays bounded',()=>{
 assert.equal(reliefMultiplier(RELIEF_MIDPOINT),1);
 assert.equal(reliefMultiplier(0),.65);assert.equal(reliefMultiplier(1),1.15);
 for(let i=0;i<=255;i++)assert.ok(reliefMultiplier(i/255)>=.65&&reliefMultiplier(i/255)<=1.15);
});
test('phones, limited texture hardware and memory use compact atlases without orientation downloads',()=>{
 assert.equal(compactSurface(960,false,8192,8),false);
 for(const params of [[390,true,8192,8],[600,false,8192,8],[960,false,2048,8],[960,false,8192,4]])assert.equal(compactSurface(...params),true);
});
