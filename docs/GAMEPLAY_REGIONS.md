# Locked gameplay regions, map v3

> 地图 v3 历史记录。[v4 增量](STATE_REGION_CONSOLIDATION.md)与[当前 v5 增量、存档及联机规则](STATE_REGION_REFERENCE_1_15.md)另见说明。

## Actual operational map

`sourceMap.ts` retains all 4,596 complete Natural Earth Admin1 features, stable source IDs, polygon rings, holes, islands, and real shared-edge topology. `data/gameplay-region-partition.json.gz` records the reproducible, reference-guided preprocessing partition without editing that source archive. Source geometry remains public-domain Natural Earth; the reference is a placement/partition hint, not replacement pixel geometry.

The runtime crop validation confirms **1,162 total base regions, 1,158 playable**, with no extra connectivity splits. Each playable region has 12 slots (13,896 total) and rate 1 (1,158 total). Regenerated spawn data lists 652 eligible single-region starts, and retains 312 historical pairs only to restore old save identities.

The same `territoryGrouping.ts` partition kernel creates both kinds of merge:

1. Preprocessing applies the derived connected partition with `locked:true`. The complete membership is retained in `PREPROCESSED_GROUPING.lockedParts`.
2. `map.ts` materializes those groups as the operational base map. Their `sourceAtoms` preserve the original member IDs; each group has exactly one runtime province record, ownership/capture state, training queue and garrison budget. Any original member's location/search code resolves to that whole region, never a separately actionable administrative fragment.
3. In-game merges use the same group records, deterministic IDs, connectivity validation and partition operations, with base regions as their input atoms. Those groups can split only into complete base regions. Repeated merges/splits cannot create a raw-atom command target or mint resources. The generic kernel also carries preprocessing lock floors through additional merges, rejecting any partial locked-member split.

All current selection, target commands, production, garrisons, capture, country territory counts and victory calculations address the operational map. In-game grouping retains each base region's authoritative resource ledger and can reconcile ownership changes without subdividing a locked base. This distinction prevents deleting production progress or moving troops when editing a management group.

Each playable base region receives capacity 12 and production rate 1. The earlier rule distributed one group's capacity/production among raw administrative records; that rule is removed. New campaigns assign each human and AI one whole eligible region, five troops, capacity 12 and production rate 1. The 652 possible starts have a verified bidirectional land exit; smaller games use a seeded, farthest-first allocation. This is a map capacity, not a claim that all 652 seats can run smoothly. Existing campaigns keep their territories and units. Every other playable region starts with five neutral infantry and never replenishes them. Remote neutral guards remain in the state but skip idle movement and collision work until forces approach; a full cell of padding wakes them before attack or contact. LAN reconnects receive every guard, while ordered updates send only changed or removed neutral units. Independent terrain and town-footprint constraints still apply; very small regions may not physically fit five non-overlapping footprints.

## Explicit Baikonur → Karaganda grouping

`data/gameplay-region-overrides.json` pins the complete singleton `KAB+00?` and existing Karaganda member set `KAZ-3197`, `KAZ-3203`, `KAZ-3251`, `KAZ-3252`. The offline builder applies this explicit user-requested merge after the general optimizer. It verifies exact membership and real connectivity; any later input change fails rather than silently extending the request. All other partition records are unchanged, covered by a baseline hash regression.

Baikonur touches only Qyzylorda (`KAZ-3197`), not the original Qaraghandy atom (`KAZ-3203`). Qyzylorda was already inside the Karaganda gameplay region, so the combined region is connected. The original `KAB` and `KAZ` source labels remain intact. The renderer removes the shared enclave seam, retains all original polygons and holes, and uses the same external neighbors. Searching either name or source code picks one region named Karaganda with one queue, capacity 12, production rate 1 and one territory count. No extra surrounding region is absorbed.

This partition update removes one gameplay account and changes runtime indices. It therefore uses map/save namespace v3 and rejects v2 saves and mixed-map LAN snapshots explicitly. Existing stored v2 bytes remain untouched; no automatic ownership/queue/troop migration is claimed. New games are required. At the time of this partition migration there were 312 paired starts; see above for the current single-region starts.

## Geometry and future unlock

Rendering tessellates the retained source polygons. Shared sides within one base region are removed from both borders and selection/glow, not from the source data. Coastlines, holes and island outlines remain. Picking any retained component returns its base-region ID.

Unlocking the preprocessing floor in a future ruleset does not require recovering or redrawing geometry: all original features and merged membership remain available. It does require choosing a new partition/map identity and an explicit ownership, queue, capacity, unit-target, save and network migration policy. This release deliberately does **not** provide an unsafe unlock command or claim an implemented lossless migration. A kernel regression proves that the same retained topology can create an unlocked partition and split it without recreating geometry.

## Physical routing

The terrain navigation atlas and its revision are unchanged. Route fields know land/water triangle topology, not administrative borders, group membership or ownership. Region centers are only order destinations. A group merge/split does not invalidate a terrain path.

The larger regions exposed a pre-existing crowd stall at intermediate land waypoints. Troops may now advance a land-to-land waypoint within 1.2 map units only when their current position connects to the next certified land corridor. They retain that position, do not teleport, cannot skip a coastline transition, and their saved route remains validated.

## Garrison display and physical capacity

The region-detail **Garrison** number and the units eligible for a new dispatch use the same predicate: the owning country's units in that region with no active order, travel plan or embarked transport. Waiting units still count at the source; each one stops counting as garrison once its individual movement order starts. Friendly arrival counts it once at the destination; attacking units become its garrison after capture. Save/load and LAN snapshots derive troop counts from the same unit state. Total army size includes dispatched units.

Human and AI orders dispatch every available battalion, one every 0.25 simulation seconds per source. Newly trained troops join the source queue until it has sent its final unit. Losing the source closes the queue; redirecting replaces it without resetting its cooldown. Destination capacity does not limit order creation, queued departures or arrival. Multiple sources can send to the same full destination. Arriving troops can put its garrison above 12, and save and LAN snapshots preserve that count.

The **local training** budget still accounts for physical occupants, incoming troops and friendly queued orders. Departing troops do not free production room until they leave. Inbound troops transfer from reservation to presence without being counted twice. Orders into a full region do not generate units or raise its local training budget.

## Saves and synchronization

Map identity is `earth-natural-earth-admin1-511-regions-v3`; LAN rules identity is `admin1-locked-game-regions-buildings-v6`. The save schema stays version 5, but uses the separate prefix `rouge.save.natural-earth-admin1.regions.v3.`. Old pre-merge region v2, raw-atom v1 and historical pixel-map campaigns are rejected as `incompatibleMap`; their stored bytes remain untouched. Automatic migration would need a policy for conflicting owners, independent training queues and overcrowded merged garrisons, so no lossless conversion is claimed.

Current-map saves and full/delta LAN snapshots preserve the base-region records, dynamic grouping and lock metadata. Their validators use the exact operational map identity and cardinality. Stable source IDs and the versioned preprocessing manifest make a future explicit migration possible.

## Reproduction and audit

Run `npm run prepare:map` to verify/extract the source and build the small `src/generated/gameplay-map.json` tooling manifest. It contains actual runtime IDs/counts/neighbors and source lineage, not duplicate geometry. Browser tests, deployment identity and HTTPS acceptance read that manifest rather than incorrectly interpreting raw source indices as gameplay indices.

Run `node --experimental-strip-types scripts/build-spawn-sites.mjs` after any partition update. The partition optimization and measured shape limitations are in [GAMEPLAY_REGIONS_AUDIT.md](GAMEPLAY_REGIONS_AUDIT.md). Matching is partial: complete modern administrative units cannot reconstruct every historical reference shape, and same-country/land-connectivity constraints leave some fragmented or missing targets. Counts alone are not evidence of shape equivalence.
