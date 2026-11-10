# Natural Earth Admin 1 compatibility overlay audit

> 历史实现/数据记录。当前锁定游戏地块、存档与出生规则见 [GAMEPLAY_REGIONS.md](GAMEPLAY_REGIONS.md)，实际形状指标见 [GAMEPLAY_REGIONS_AUDIT.md](GAMEPLAY_REGIONS_AUDIT.md)。

This is a **data audit and new-map candidate only**. It does not overwrite `world.json` or migrate old saves. The final chosen new-map atoms are whole Natural Earth Admin 1 features, not legacy intersection fragments.

## Sources and reproducibility

- Natural Earth 1:10m Admin 1 states/provinces, version 5.1.1, official download: https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_1_states_provinces.zip
- ZIP SHA256: `efc59726337323058f9446210adc96673179cd344e053666ee3d28cb58ba2b05`.
- Natural Earth terms: https://www.naturalearthdata.com/about/terms-of-use/ (public domain).
- Existing atlas: `data/state-regions-1.13.7.json.gz`; its source/license caveats in `STATE_REGIONS.md` still apply. An overlay does not remove those caveats.
- NE labels and boundaries are inherited source data, not a new statement about disputed sovereignty.

```sh
python -m venv /tmp/rouge-gis-venv
/tmp/rouge-gis-venv/bin/pip install shapely==2.1.2 pyproj==3.7.2 pyshp==3.0.3
mkdir -p artifacts/admin1
curl -fL https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_1_states_provinces.zip -o artifacts/admin1/ne_10m_admin_1_states_provinces.zip
unzip -o artifacts/admin1/ne_10m_admin_1_states_provinces.zip -d artifacts/admin1
/tmp/rouge-gis-venv/bin/python scripts/audit-admin1-overlap.py
/tmp/rouge-gis-venv/bin/python scripts/build-admin1-base.py
```

## Quantified incompatibility

The overlap audit uses EPSG:6933 equal-area intersections within the existing map display latitude limits (74 N to 58.64 S). It **does not fit a new georeference**: the legacy atlas expressly describes its Miller placement as approximate. Its mismatch combines different historical partitions, different coastlines and approximate placement, and cannot be attributed solely to projection.

- 4,596 NE features, 4,592 with area in the display extent.
- 1,872 cross two or more legacy regions by at least 1% of their own area in each.
- 168 in-view features have no overlap with the legacy land footprint.
- Whole-feature maximum-overlap assignment would leave 16 old regions without any assigned feature. This is diagnostic only, never an approved replacement rule.
- No legacy region reconstructed that way reaches 99% intersection-over-union (IoU); only 7 reach 95%.
- NE covers 97.3783% of the old land area in this display extent. Missing/coastline remnants must not be silently discarded.

### Hunan and Hubei

The old map contains `STATE_WESTERN_HUBEI` (505), `STATE_EASTERN_HUBEI` (506), and `STATE_HUNAN` (507). NE has one `CHN-1807` Hubei and one `CHN-1808` Hunan.

NE Hubei overlaps west Hubei by 61.8213% of its area, east Hubei by 32.6856%, with smaller overlaps elsewhere. NE Hunan overlaps old Hunan by 66.6766% and old Guangxi by 28.0757%, with smaller overlaps elsewhere. Therefore a whole modern province is not a lossless primitive for the original partition.

## New-map implementation chosen after reviewing the mismatch

The user chose real whole administrative units and permitted adjusting the old game partition. Accordingly `build-admin1-base.py` emits a **new map** instead of compatibility fragments. No old pixel boundaries remain in the generated base geometry. Map ID is `earth-natural-earth-admin1-511-v1`; old map saves and unit positions must be rejected or retained separately, not falsely called migrated.

Each source `adm1_code` is the stable atom ID. Shared boundaries are simplified together using `shapely.coverage_simplify` at 0.015 degrees (an angular simplification tolerance, not a uniform physical distance). All 8,535 polygon components survive. Shared coverage and individual validity are asserted before and after simplification. Coordinates are **not rounded**: experiments with a common 1e-7-degree precision grid broke coverage, so that optimization was rejected.

Initial grouping is conservative, not a forced 675-group reconstruction:

1. Calculate largest overlap with each old region only as a geographic **hint**.
2. A candidate is confident only if its best overlap is at least 50% of its own in-view area and the best-to-second margin is at least 10 percentage points.
3. Merge confident candidates only with the same old hint, the same NE country label, and a positive-length shared boundary path. Corner touches create no adjacency or sea bridge.
4. Low-confidence, unmatched, and outside-view features remain standalone groups. No name-based guess fills them.
5. A multipart administrative unit remains a whole atom, islands included; its polygon components are never independently reassigned.
6. Empty old groups survive only in the audit, not as empty game territory.

Result: 4,596 atoms and 1,327 initial groups, including 314 low-confidence singletons and 172 unmatched/outside-view singletons. Four wholly outside the existing display crop (`ATA+00?`, `ATA+99?`, `GRL-2738`, `NOR-901`) must be excluded from gameplay objectives or made accessible through a separately expanded viewport. Excluding those yields 1,323 playable groups in the current viewport. There are 268 atoms without a shared land boundary; this is not permission to invent bridges.

The raw source has 1,295,320 vertices; the topology-preserving simplified output has 512,409. JSON is 21.61 MB and gzip 7.06 MB. A worker/lazy-loading implementation and an actual device performance test are necessary before claiming mobile performance. The generator itself took about 17 seconds in this environment; that is not a browser load benchmark.

### TypeScript loading contract

```ts
type BaseUnit = {
  id: string; // exact source adm1_code, may contain + or ?
  name: [string, string]; country: string;
  center: [number, number];
  geometry: number[][][][]; // MultiPolygon [polygon][ring][point][lon,lat]
  neighbors: number[]; // indices into the ID-sorted provinces array
  legacyGroupHint: number | null;
  legacyOverlapFraction: number;
  legacyOverlapMargin: number;
  legacyMatchStatus: 'outside-view' | 'unmatched' | 'crossing' | 'matched';
};
type InitialGroup = {
  id: string; // group:<lexicographically smallest atom ID>
  atomIds: string[];
  legacyHint: number | null;
  reason: 'confident-connected-same-country' | 'unmatched-singleton' | 'low-confidence-singleton';
};
// Dataset: {format:1,mapId,source...,provinces:BaseUnit[],initialGroups:InitialGroup[]}
```

`legacyMatchStatus` records raw overlap properties, not grouping confidence: use the exact fraction/margin thresholds or the generated group list. `natural-earth-admin1-base-audit.json` contains the original maximum-overlap group candidates and flags (16 empty, 91 cross-country); those are **not** the conservative playable groups. The generated base dataset's `initialGroups` is authoritative for the proposed new partition.

```sh
/tmp/rouge-gis-venv/bin/python scripts/build-admin1-base.py
python scripts/test-admin1-base.py
```
