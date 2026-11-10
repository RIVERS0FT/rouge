/** Offline Natural Earth Admin1 atlas. Complete real administrative atoms. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),output=new URL('src/generated/world.json',root);
const compressed=await readFile(new URL('data/natural-earth-admin1-base.json.gz',root));
if(createHash('sha256').update(compressed).digest('hex')!=='3206750f49f264d247f1590571365d14d72a0d2aa020c7be5f2d10223db835ff')throw new Error('Natural Earth atlas checksum mismatch');
const source=JSON.parse(gunzipSync(compressed));
if(source.format!==1||source.mapId!=='earth-natural-earth-admin1-511-v1'||source.provinces.length!==4596)throw new Error('Invalid administrative atlas');
const partition=JSON.parse(gunzipSync(await readFile(new URL('data/gameplay-region-partition.json.gz',root))));
if(partition.schema!==1||partition.sourceSha256!==createHash('sha256').update(compressed).digest('hex')||!Array.isArray(partition.groups))throw new Error('Gameplay partition does not match the source atlas');
if(partition.overridesSha256!==createHash('sha256').update(await readFile(new URL('data/gameplay-region-overrides.json',root))).digest('hex'))throw new Error('Gameplay overrides require partition regeneration');
// Keep the source partition as provenance, and ship only operational membership
// in the shared atlas. Audit/optimization logs never enter either JS bundle.
const atlas={...source,sourceRevision:'Natural Earth 5.1.1 / Admin1 10m',provinces:source.provinces.map((p,id)=>({...p,code:p.id,sourceId:id})),gameplayGroups:partition.groups.map(g=>({id:g.id,atomIds:g.sourceIds,legacyHint:g.legacyHint,reason:g.reason}))};
const raw=Buffer.from(JSON.stringify(atlas));await mkdir(new URL('src/generated/',root),{recursive:true});
let old;try{old=await readFile(output);}catch{}
if(!old?.equals(raw))await writeFile(output,raw);
// Node tests and the LAN server read the local JSON without an HTTP dependency.
// Vite replaces this tiny module with a shared, content-hashed asset fetch in
// both browser and worker builds; never embed the atlas in either JS bundle.
// The small declaration keeps tsc from inferring every coordinate.
const moduleText="import atlas from './world.json' with {type:'json'};\nexport default atlas;\n";
await writeFile(new URL('src/generated/world.js',root),moduleText);
await writeFile(new URL('src/generated/world.d.ts',root),"import type {AdminAtlas} from '../game/atlasTypes.ts';\ndeclare const atlas:AdminAtlas;\nexport default atlas;\n");
console.log(`Natural Earth atlas: ${atlas.provinces.length} complete Admin1 atoms; ${atlas.initialGroups.length} approximate initial groups.`);

// Independent physical land/water mesh, generated offline, never on CI.
const terrain=gunzipSync(await readFile(new URL('data/terrain-navigation.json.gz',root)));
const terrainInfo=JSON.parse(terrain);
if(terrainInfo.format!==3||terrainInfo.mapId!==source.mapId||terrainInfo.revision!==createHash('sha256').update(compressed).digest('hex'))throw new Error('Terrain mesh does not match the administrative atlas');
await writeFile(new URL('src/generated/terrain-navigation.json',root),terrain);
