/** Offline Natural Earth Admin1 atlas. Complete real administrative atoms. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {applyReviewedStateIslands} from './apply-reviewed-state-islands.mjs';
import {applyPacificGameplayRegions} from './apply-pacific-gameplay-regions.mjs';
import {applyAdjacentIslandMergers} from './apply-adjacent-island-gameplay-regions.mjs';
import {repartitionUserIslands} from './apply-user-island-gameplay-regions.mjs';
import {repartitionGlobalIslands} from './apply-global-island-gameplay-regions.mjs';
import {applyEuropeSmallMergers} from './apply-europe-small-gameplay-regions.mjs';
import {repartitionEurope} from './apply-europe-gameplay-regions.mjs';
import {repartitionAsiaArabia} from './apply-asia-arabia-gameplay-regions.mjs';
import {repartitionSoutheastAsia} from './apply-southeast-asia-gameplay-regions.mjs';
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
const thaiGroups=repartitionThailand(source,philippineGroups,thaiRegions);
const seaRegions=JSON.parse(await readFile(new URL('data/southeast-asia-gameplay-regions.json',root)));
const southeastAsianGroups=repartitionSoutheastAsia(source,thaiGroups,seaRegions);
const asiaArabia=JSON.parse(await readFile(new URL('data/asia-arabia-gameplay-regions.json',root)));
const asiaArabianGroups=repartitionAsiaArabia(source,southeastAsianGroups,asiaArabia);
const europeanRegions=JSON.parse(await readFile(new URL('data/europe-gameplay-regions.json',root)));
const largerEuropeanGroups=repartitionEurope(source,asiaArabianGroups,europeanRegions);
const smallEuropeanMergers=JSON.parse(await readFile(new URL('data/europe-small-gameplay-regions.json',root)));
const europeGroups=applyEuropeSmallMergers(source,largerEuropeanGroups,smallEuropeanMergers);
const islandRegions=JSON.parse(await readFile(new URL('data/global-island-gameplay-regions.json',root)));
const globalIslandGroups=repartitionGlobalIslands(source,europeGroups,islandRegions);
const selectedIslandRegions=JSON.parse(await readFile(new URL('data/user-island-gameplay-regions.json',root)));
const reviewedIslandGroups=repartitionUserIslands(source,globalIslandGroups,selectedIslandRegions);
const adjacentIslands=JSON.parse(await readFile(new URL('data/adjacent-island-gameplay-regions.json',root)));
const priorGroups=applyAdjacentIslandMergers(source,reviewedIslandGroups,adjacentIslands);
const pacificPlan=JSON.parse(await readFile(new URL('data/pacific-gameplay-regions.json',root)));
const stateReference=JSON.parse(gunzipSync(await readFile(new URL('data/state-regions-1.13.7.json.gz',root))));
const pacificGroups=applyPacificGameplayRegions(source,priorGroups,pacificPlan,stateReference);
const indianPlan=JSON.parse(await readFile(new URL('data/indian-ocean-gameplay-regions.json',root)));
const indianGroups=applyReviewedStateIslands(source,pacificGroups,indianPlan,stateReference,{label:'Indian Ocean',reason:'victoria-3-reviewed-indian-ocean-region'});
const atlanticPlan=JSON.parse(await readFile(new URL('data/atlantic-gameplay-regions.json',root)));
const atlanticGroups=applyReviewedStateIslands(source,indianGroups,atlanticPlan,stateReference,{label:'Atlantic',reason:'victoria-3-reviewed-atlantic-region'});
const africaPlan=JSON.parse(await readFile(new URL('data/africa-gameplay-regions.json',root)));
const africaGroups=applyReviewedStateIslands(source,atlanticGroups,africaPlan,stateReference,{label:'Africa',reason:'victoria-3-reviewed-africa-region',allowNewAttachments:false});
const southAmericaPlan=JSON.parse(await readFile(new URL('data/south-america-gameplay-regions.json',root)));
const southAmericaGroups=applyReviewedStateIslands(source,africaGroups,southAmericaPlan,stateReference,{label:'South America',reason:'victoria-3-reviewed-south-america-region',allowNewAttachments:false});
const northAmericaPlan=JSON.parse(await readFile(new URL('data/north-america-gameplay-regions.json',root)));
const finalGroups=applyReviewedStateIslands(source,southAmericaGroups,northAmericaPlan,stateReference,{label:'North America',reason:'victoria-3-reviewed-north-america-region',allowNewAttachments:false});
// Keep the source partition as provenance, and ship only operational membership
// in the shared atlas. Audit/optimization logs never enter either JS bundle.
const atlas={...source,sourceRevision:'Natural Earth 5.1.1 / Admin1 10m',provinces:source.provinces.map((p,id)=>({...p,code:p.id,sourceId:id})),gameplayGroups:finalGroups.map(g=>({id:g.id,atomIds:g.sourceIds,legacyHint:g.legacyHint,reason:g.reason,...(g.displayName?{displayName:g.displayName}:{}),...(g.islandAttachments?{islandAttachments:g.islandAttachments}:{}),...(g.anchorAtomId?{anchorAtomId:g.anchorAtomId}:{}),...(g.searchAliases?{searchAliases:g.searchAliases}:{})}))};
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
