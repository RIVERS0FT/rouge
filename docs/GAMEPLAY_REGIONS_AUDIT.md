# Locked gameplay-region partition: geographic audit

## Result and scope

The retained Natural Earth source has **4,596 indivisible Admin1 atoms**. The derived `data/gameplay-region-partition.json.gz` contracts these into **1,162 locked preprocessed regions**, of which **1,158 have source area within the map view** and four are outside it. This reduces the total region count by **74.72%**. Every atom occurs exactly once; no source atom is cut, deleted, or duplicated. Runtime crop-connectivity checks confirm the same 1,162 total / 1,158 playable counts for this partition, with no additional split. They would split a source-connected group if its only connecting border were outside a future viewport.

The grouping is Victoria-3-reference-guided, but **does not establish that every operational region approximately reproduces a Victoria 3 state shape**. The measured correspondence is uneven, and unsplittable modern Admin1 boundaries make some reference regions impossible to represent separately. Treat the shape requirement as partially met, not as a certified global match.

## Baseline and improvement

The original source archive and its original `initialGroups` remain unchanged. A deterministic greedy optimization derives a separate partition:

| Metric | Original partition | Optimized partition |
| --- | ---: | ---: |
| Pre-crop groups | 1,327 | 1,162 |
| Groups with source area in view | 1,323 | 1,158 |
| Reference targets with no assigned group | 16 | 15 |
| Reference targets with multiple groups | 182 | 135 |
| Reference targets with exactly one group | 477 | 525 |
| Median best-single-assigned-group IoU | 0.759495 | 0.761241 |
| Target-area-weighted mean best-single-group IoU | 0.753936 | 0.758191 |
| Targets reaching single-group IoU 0.75 | 353 | 355 |
| Targets reaching single-group IoU 0.90 | 75 | 75 |

All scores are unsimplified-source geographic proxies, as explained below. There are 675 reference targets. Zero-assignment targets count as zero in scores.

The general optimization accepted **165 merges** and **one whole-atom transfer**, followed by **one explicit user-directed Baikonur → Karaganda merge**. The table reports the final partition. The override is recorded separately in `data/gameplay-region-overrides.json`, fixes both complete input member sets and still requires physical connectivity. Natural Earth labels Baikonur `KAB`, unlike the existing Karaganda group’s `KAZ`; this is the only explicitly permitted cross-label exception and does not edit either source label. General optimizer merges require a real source adjacency, the same modern-country label, the same reference hint, and a union IoU strictly above the better constituent IoU. Missing-target recovery considers whole atoms and whole groups, requires at least 25% source-area overlap and 0.10 target IoU, a positive net change in the sum of donor/recipient best-single-group IoUs, retained donor representation, and a connected donor remainder. These explicit conservative thresholds avoid forcing weak, unrelated matches. This is a deterministic local heuristic, **not a proof of a global optimum**.

The accepted transfer moves `RUS-2354` from reference target 569 to previously unrepresented target 139. Recipient IoU becomes **0.340828**. Donor best-group IoU **falls from 0.422460 to 0.353204**; combined unweighted IoU gains **0.271572**. Recovery therefore has a real local tradeoff, not a claim of improvement for every target. The overall area-weighted score also improves, but transfer selection optimizes unweighted net IoU.

## Current partition details

- 515 groups contain multiple atoms; 647 are singletons. The largest contains 131 atoms.
- 135 targets remain fragmented; the maximum is 29 groups for one target.
- Of those fragmented targets, 90 span multiple modern-country labels, 59 have disconnected same-country components, and 28 have additional groups whose eligible merges would not improve IoU. These categories overlap. There are 43 groups beyond the minimum same-country connected-component partition; the IoU constraint intentionally preserves them.
- Best-single-group IoU at least 0.50 / 0.75 / 0.90 / 0.95: **565 / 355 / 75 / 7** targets.
- Combining all groups assigned to each target gives median IoU **0.776029** and target-area-weighted mean **0.768382**. This is a diagnostic union, **not** one selectable gameplay region.

IoU is intersection area divided by union area; 1 means identical measured coverage and 0 means none. The thresholds are descriptive, not an agreed user acceptance standard.

## Remaining exceptions

- Western Hubei receives the whole modern Hubei atom (`CHN-1807`), IoU about **0.6022**. Eastern Hubei remains unrepresented. Transferring that sole atom would merely make Western Hubei unrepresented instead. Keeping the atom indivisible prevents independently recreating both targets.
- Hunan (`CHN-1808`) is one region, but IoU is only about **0.6442**. A single group does not itself imply shape agreement.
- West Indies improves from 49 to **29** groups but best-single IoU is still **0.1267**. Bahamas remains **18** groups with **0.0950**; Visayas **13** with **0.1400**. Modern-country borders and physical disconnectedness prohibit forced sea bridges.
- The 15 unrepresented targets are North Rhine, Brunswick, Franconia, Bermuda, Lhasa, Dzungaria, Alxa, Nanjing, Northern Anhui, Eastern Hubei, Ruhr, Kolyma, Kurnool, Bundelkhand, and Quetta.
- Bermuda has no recorded positive-area overlap. North Rhine and Brunswick's strongest candidates have only about 22–23% source overlap, below the material-overlap threshold. The strongest candidates for the other missing targets would generally eliminate their donor's last group; some also fail the source-overlap threshold. Full candidate diagnostics appear in `summary.remainingMissingTargets` in the partition artifact and `optimization.remainingMissingTargets` in the audit. These explain why the conservative search stops; they do not establish mathematical impossibility for all possible regroupings.

## Reproduce and validate

Run from the repository root, using only Python's standard library:

```sh
python scripts/build-gameplay-partition.py
python scripts/audit-gameplay-regions.py
```

The first command regenerates `data/gameplay-region-partition.json.gz`, with exact `sourceIds`, reference hints, provenance, accepted operations, baseline/optimized metrics, remaining fragmentation, and missing-target diagnostics. It verifies matching source/reference provenance, the complete one-to-one atom partition, real source-graph connectivity, and same-country membership except the exact, recorded user override.

The second regenerates `data/gameplay-regions-audit.json.gz`. It verifies the partition source SHA-256 and independently checks complete membership, country labels, and connectedness. It records SHA-256 hashes of all five inputs, both baseline and optimized summaries, per-target assigned counts, total assigned area, largest-group share, best single-group IoU, target recall, and all-assigned-group IoU. Per-group rows expose membership counts, area, reason, and target IoU.

The original `scripts/audit-admin1-overlap.py` measured unsimplified Natural Earth geometries against the reference using **EPSG:6933 equal-area intersections**, clipping both to longitude −180…180 and latitude −58.64…74. These scripts sum its saved per-atom areas/intersections over each group. Natural Earth atoms form disjoint coverage, so the sums reconstruct group areas and intersections subject to the saved numerical rounding. No new source download or destructive geometry operation occurs.

**These IoUs are unsimplified-source proxies, not newly measured runtime-polygon IoUs.** Runtime source polygons have shared-edge simplification at 0.015 degrees; this audit does not bound the resulting IoU change. The Victoria reference uses approximate Miller placement, not official georeferenced coordinates, and no alignment has been fitted. Scores therefore combine boundary differences, reference-placement error, and grouping constraints. They cannot isolate visual shape similarity or certify official Victoria 3 boundaries. “In view” uses original clipped source area, not renderer visibility.

The derived partition does not relax the distinction between locked preprocessed regions and later player-created, splittable unions. Original geographic atoms remain intact and traceable, while the gameplay lock floor applies to the new partition.

The committed compressed audit keeps summary metrics, provenance and remaining-target diagnostics. Reproduction also writes every per-target and per-group measurement to `artifacts/gameplay-regions-audit-full.json`; source atoms, overlap measurements and optimization operations remain retained.
