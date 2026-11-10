# Locked gameplay regions, map v2

## Actual operational map

`sourceMap.ts` retains all 4,596 complete Natural Earth Admin1 features, stable source IDs, polygon rings, holes, islands, and real shared-edge topology. `data/gameplay-region-partition.json.gz` records the reproducible, reference-guided preprocessing partition without editing that source archive. Source geometry remains public-domain Natural Earth; the reference is a placement/partition hint, not replacement pixel geometry.

The runtime crop validation confirms **1,163 total base regions, 1,159 playable**, with no extra connectivity splits. Each playable region has 12 slots (13,908 total) and rate 1 (1,159 total). Regenerated spawn matching provides 312 disjoint two-region starts.

The same `territoryGrouping.ts` partition kernel creates both kinds of merge:

1. Preprocessing applies the derived connected partition with `locked:true`. The complete membership is retained in `PREPROCESSED_GROUPING.lockedParts`.
2. `map.ts` materializes those groups as the operational base map. Their `sourceAtoms` preserve the original member IDs; each group has exactly one runtime province record, ownership/capture state, training queue and garrison budget. Any original member's location/search code resolves to that whole region, never a separately actionable administrative fragment.
3. In-game merges use the same group records, deterministic IDs, connectivity validation and partition operations, with base regions as their input atoms. Those groups can split only into complete base regions. Repeated merges/splits cannot create a raw-atom command target or mint resources. The generic kernel also carries preprocessing lock floors through additional merges, rejecting any partial locked-member split.

All current selection, target commands, production, garrisons, capture, faction territory counts and victory calculations address the operational map. In-game grouping retains each base region's authoritative resource ledger and can reconcile ownership changes without subdividing a locked base. This distinction prevents deleting production progress or moving troops when editing a management group.

Each playable base region receives capacity 12 and production rate 1. The earlier rule distributed one group's capacity/production among raw administrative records; that rule is removed. Every faction still receives two whole regions, five troops in each, total capacity 24 and production 2. Spawn sites are regenerated against the new map and independently certified land routes.

## Geometry and future unlock

Rendering tessellates the retained source polygons. Shared sides within one base region are removed from both borders and selection/glow, not from the source data. Coastlines, holes and island outlines remain. Picking any retained component returns its base-region ID.

Unlocking the preprocessing floor in a future ruleset does not require recovering or redrawing geometry: all original features and merged membership remain available. It does require choosing a new partition/map identity and an explicit ownership, queue, capacity, unit-target, save and network migration policy. This release deliberately does **not** provide an unsafe unlock command or claim an implemented lossless migration. A kernel regression proves that the same retained topology can create an unlocked partition and split it without recreating geometry.

## Physical routing

The terrain navigation atlas and its revision are unchanged. Route fields know land/water triangle topology, not administrative borders, group membership or ownership. Region centers are only order destinations. A group merge/split does not invalidate a terrain path.

The larger regions exposed a pre-existing crowd stall at intermediate land waypoints. Troops may now advance a land-to-land waypoint within 1.2 map units only when their current position connects to the next certified land corridor. They retain that position, do not teleport, cannot skip a coastline transition, and their saved route remains validated.

## Saves and synchronization

Map identity is `earth-natural-earth-admin1-511-regions-v2`; LAN rules identity is `admin1-locked-game-regions-v5`. The save schema stays version 5, but uses the separate prefix `rouge.save.natural-earth-admin1.regions.v2.`. Old raw-atom v1 and historical pixel-map campaigns are rejected as `incompatibleMap`; their stored bytes remain untouched. Automatic migration would need a policy for conflicting owners, independent training queues and overcrowded merged garrisons, so no lossless conversion is claimed.

Current-map saves and full/delta LAN snapshots preserve the base-region records, dynamic grouping and lock metadata. Their validators use the exact operational map identity and cardinality. Stable source IDs and the versioned preprocessing manifest make a future explicit migration possible.

## Reproduction and audit

Run `npm run prepare:map` to verify/extract the source and build the small `src/generated/gameplay-map.json` tooling manifest. It contains actual runtime IDs/counts/neighbors and source lineage, not duplicate geometry. Browser tests, deployment identity and HTTPS acceptance read that manifest rather than incorrectly interpreting raw source indices as gameplay indices.

Run `node --experimental-strip-types scripts/build-spawn-sites.mjs` after any partition update. The partition optimization and measured shape limitations are in [GAMEPLAY_REGIONS_AUDIT.md](GAMEPLAY_REGIONS_AUDIT.md). Matching is partial: complete modern administrative units cannot reconstruct every historical reference shape, and same-country/land-connectivity constraints leave some fragmented or missing targets. Counts alone are not evidence of shape equivalence.
