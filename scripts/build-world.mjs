/** Offline Natural Earth Admin1 atlas. Complete real administrative atoms. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {repartitionThailand} from './apply-thailand-gameplay-regions.mjs';
import {repartitionPhilippines} from './apply-philippines-gameplay-regions.mjs';
import {repartitionSwissRegions} from './apply-swiss-gameplay-regions.mjs';
import {repartitionMaldives} from './apply-maldives-gameplay-regions.mjs';
import {repartitionUkRegions} from './apply-uk-administrative-regions.mjs';
import {repartitionFrenchRegions} from './apply-france-administrative-regions.mjs';
import {consolidateStateRegions,applyCurrentStateMergers,applyAdministrativeGroupOverrides} from './apply-state-region-consolidation.mjs';
const root=new URL('../',import.meta.url),output=new URL('src/generated/world.json',root);
async function writeChanged(path,content){
  const bytes=typeof content==='string'?Buffer.from(content):content;
  let old;try{old=await readFile(path);}catch{}
  if(!old?.equals(bytes))await writeFile(path,bytes);
}
const compressed=await readFile(new URL('data/natural-earth-admin1-base.json.gz',root));
if(createHash('sha256').update(compressed).digest('hex')!=='3206750f49f264d247f1590571365d14d72a0d2aa020c7be5f2d10223db835ff')throw new Error('Natural Earth atlas checksum mismatch');
const source=JSON.parse(gunzipSync(compressed));
if(source.format!==1||source.mapId!=='earth-natural-earth-admin1-511-v1'||source.provinces.length!==4596)throw new Error('Invalid administrative atlas');
const partitionBytes=await readFile(new URL('data/gameplay-region-partition.json.gz',root));
const partition=JSON.parse(gunzipSync(partitionBytes));
if(partition.schema!==1||partition.sourceSha256!==createHash('sha256').update(compressed).digest('hex')||!Array.isArray(partition.groups))throw new Error('Gameplay partition does not match the source atlas');
if(partition.overridesSha256!==createHash('sha256').update(await readFile(new URL('data/gameplay-region-overrides.json',root))).digest('hex'))throw new Error('Gameplay overrides require partition regeneration');
const decisions=JSON.parse(await readFile(new URL('data/state-region-consolidation.json',root)));
const overlapAudit=await readFile(new URL('data/admin1-overlap-audit.json',root));
if(decisions.basePartitionSha256!==createHash('sha256').update(partitionBytes).digest('hex')
 || decisions.overlapAuditSha256!==createHash('sha256').update(overlapAudit).digest('hex'))throw new Error('State-region consolidation requires the pinned base partition and overlap audit');
const historicalGroups=consolidateStateRegions(source,partition.groups,decisions);
const currentDecisions=JSON.parse(await readFile(new URL('data/state-region-1.15.1-overrides.json',root)));
const mergedGroups=applyCurrentStateMergers(source,historicalGroups,currentDecisions,JSON.parse(overlapAudit));
const franceRegions=JSON.parse(await readFile(new URL('data/france-administrative-regions.json',root)));
const franceGroups=repartitionFrenchRegions(source,mergedGroups,franceRegions);
const ukRegions=JSON.parse(await readFile(new URL('data/uk-administrative-regions.json',root)));
const ukGroups=repartitionUkRegions(source,franceGroups,ukRegions);
const adminOverrides=JSON.parse(await readFile(new URL('data/administrative-region-overrides.json',root)));
const gameplayGroups=applyAdministrativeGroupOverrides(source,ukGroups,adminOverrides);
const maldivesRegions=JSON.parse(await readFile(new URL('data/maldives-gameplay-regions.json',root)));
const groupedMaldives=repartitionMaldives(source,gameplayGroups,maldivesRegions);
const swissRegions=JSON.parse(await readFile(new URL('data/swiss-gameplay-regions.json',root)));
const swissGroups=repartitionSwissRegions(source,groupedMaldives,swissRegions);
const philippineRegions=JSON.parse(await readFile(new URL('data/philippines-gameplay-regions.json',root)));
const philippineGroups=repartitionPhilippines(source,swissGroups,philippineRegions);
const thaiRegions=JSON.parse(await readFile(new URL('data/thailand-gameplay-regions.json',root)));
const finalGroups=repartitionThailand(source,philippineGroups,thaiRegions);
// Keep the source partition as provenance, and ship only operational membership
// in the shared atlas. Audit/optimization logs never enter either JS bundle.
const atlas={...source,sourceRevision:'Natural Earth 5.1.1 / Admin1 10m',provinces:source.provinces.map((p,id)=>({...p,code:p.id,sourceId:id})),gameplayGroups:finalGroups.map(g=>({id:g.id,atomIds:g.sourceIds,legacyHint:g.legacyHint,reason:g.reason,...(g.displayName?{displayName:g.displayName}:{}),...(g.islandAttachments?{islandAttachments:g.islandAttachments}:{}),...(g.anchorAtomId?{anchorAtomId:g.anchorAtomId}:{})}))};
const raw=Buffer.from(JSON.stringify(atlas));await mkdir(new URL('src/generated/',root),{recursive:true});
let old;try{old=await readFile(output);}catch{}
if(!old?.equals(raw))await writeFile(output,raw);
// Node tests and the LAN server read the local JSON without an HTTP dependency.
// Vite replaces this tiny module with a shared, content-hashed asset fetch in
// both browser and worker builds; never embed the atlas in either JS bundle.
// The small declaration keeps tsc from inferring every coordinate.
const moduleText="import atlas from './world.json' with {type:'json'};\nexport default atlas;\n";
await writeChanged(new URL('src/generated/world.js',root),moduleText);
await writeChanged(new URL('src/generated/world.d.ts',root),"import type {AdminAtlas} from '../game/atlasTypes.ts';\ndeclare const atlas:AdminAtlas;\nexport default atlas;\n");
console.log(`Natural Earth atlas: ${atlas.provinces.length} complete Admin1 atoms; ${atlas.gameplayGroups.length} locked gameplay groups.`);

// Independent physical land/water mesh, generated offline, never on CI.
const terrain=gunzipSync(await readFile(new URL('data/terrain-navigation.json.gz',root)));
const terrainInfo=JSON.parse(terrain);
if(terrainInfo.format!==3||terrainInfo.mapId!==source.mapId||terrainInfo.revision!==createHash('sha256').update(compressed).digest('hex'))throw new Error('Terrain mesh does not match the administrative atlas');
await writeChanged(new URL('src/generated/terrain-navigation.json',root),terrain);
