import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {WORLD_BOUNDS,CROP_ID,PROJECTION_ID,project,unproject} from '../src/game/geo.ts';
import {surfaceUv,compactSurface,reliefMultiplier,RELIEF_MIDPOINT} from '../src/render/mapSurfaceConfig.ts';
import {surfaceLevel,surfaceTiles} from '../src/render/surfaceLod.ts';
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
  assert.deepEqual(value.size,[21600,10800]);assert.match(value.archiveSha256,/^[a-f0-9]{64}$/);
  assert.ok(Math.abs(value.worldFile[4]+180-1/120)<1e-9);assert.ok(Math.abs(value.worldFile[5]-90+1/120)<1e-9);
 }
});
test('bundled raster bytes, dimensions and budgets are recorded with public-domain provenance',()=>{
 let bytes=0,tiles=0;
 for(const [name,entry] of Object.entries(audit.outputs)){
  const buffer=readFileSync(new URL('../src/assets/map/ne2/'+name,import.meta.url));
  assert.equal(createHash('sha256').update(buffer).digest('hex'),entry.sha256);assert.equal(buffer.length,entry.bytes);
  assert.equal(buffer.subarray(0,4).toString(),'RIFF');assert.equal(buffer.subarray(8,12).toString(),'WEBP');
  if(entry.kind==='tile'){assert.equal(entry.width,516);assert.equal(entry.height,516);tiles++;}
  else assert.equal(entry.height,Math.round(entry.width*(WORLD_BOUNDS.bottom-WORLD_BOUNDS.top)/3600));
  bytes+=entry.bytes;
 }
 assert.equal(tiles,648);assert.ok(bytes<12_000_000);assert.equal(audit.ocean.externalAssets,false);assert.equal(audit.ocean.simulationChanged,false);assert.equal(audit.license,'public-domain');
});

test('surface LOD uses hysteresis, visible tiles and continuous date-line wrapping',()=>{
 assert.equal(surfaceLevel(2400,2048,16384,2048),2048);
 assert.equal(surfaceLevel(3200,2048,16384,2048),4096);
 assert.equal(surfaceLevel(3000,2048,16384,4096),4096);
 assert.equal(surfaceLevel(30000,2048,16384,8192),16384);
 const level=audit.levels.at(-1),seam=surfaceTiles(level,{left:1780,right:1820,top:-50,bottom:50},0);
 assert.deepEqual([...new Set(seam.map(tile=>tile.x))].sort((a,b)=>a-b),[0,31]);
 assert.ok(seam.every(tile=>tile.y>=0&&tile.y<level.rows));
 const world=surfaceTiles(level,WORLD_BOUNDS,1);assert.equal(world.length,level.columns*level.rows);
 assert.equal(new Set(world.map(tile=>tile.key)).size,world.length);
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
