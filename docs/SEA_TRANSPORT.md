# Deterministic coastal transport graph

`data/sea-navigation.json` is an offline derivative of the **existing shipped land atlas**, not a new map dataset. Its `atlas` field identifies the decompressed source SHA-256. The source's redistribution limitations in `STATE_REGIONS.md` continue to apply. The original 106 excluded sea regions have not been recovered or reintroduced; this graph derives navigable water conservatively from the complement of the retained land polygons.

## Geometry and legal routes

- Grid cells are 10 simulation map units, 360 × 158. Cardinal edges only; no diagonal shortcuts or longitude wrapping.
- Every edge is checked against **all polygon ring segments**, including small islands and holes. Endpoint sampling alone is insufficient, because it can miss thin land.
- Only water connected to the outer ocean grid is retained. Lakes and straits sealed at this resolution cannot be used. This intentionally sacrifices some routes rather than inventing a passage. The graph is approximate gameplay navigation, not real-world nautical routing.
- Each of 276 coastal management regions has up to four ports on its primary navigable land component. A port specifies an inland point, exact shore crossing, offshore point and certified grid connection. The inland point is approximately 0.03 map units from shore. Every shore crossing is checked to intersect land boundaries only at the declared shore point.
- Disconnected offshore islands do not magically connect to the region's main army. The authoritative land navigator must reach the departure port and must resume from the arrival port.
- Multi-source Dijkstra chooses a deterministic minimum-cost connection between source and destination ports. Only collinear grid points are removed; smoothing never creates unchecked diagonal segments.
- `seaRoute` returns explicit `depart`, `arrive` and `waypoints`, including land → shore → sea → grid → sea → shore → land. Transport must traverse them in order, with no teleportation. The simulation controls embarkation, disembarkation, capacity and combat eligibility.
- `validateSeaLeg` reconstructs canonical routes to reject arbitrary imported paths. `onSeaSegment` validates transport position on its active leg. A bounded cache avoids repeated pathfinding; returned paths are copies so callers cannot corrupt canonical results.

## Reproduce and verify

```sh
npm run prepare:map
node --experimental-strip-types scripts/build-sea.ts
node --experimental-strip-types --test tests/sea.test.mjs
```

Generation uses only local atlas files. The committed graph is consumed directly by browser/Worker/server, so clients share identical edges and port data. Ordinary builds do not regenerate it. When the atlas geometry changes, regenerate the graph and update the source fingerprint assertion. The tests verify every stored sea edge and port against current geometry, cross-channel routing, inland rejection, determinism, cache integrity and saved path/position checks.

## Integrated simulation

Land routes retain priority, including retries around blocked local corridors. Only when no valid land route exists does the planner inspect coastal candidates in the two reachable land components (up to eight nearest-by-land-leg-count coastal regions on each side, deterministic ID ties). Within each pair of coastal regions the sea solver returns its shortest port pair. The planner verifies departure/arrival land flow before accepting it; if either connection fails it tries another region pair rather than exhaustively retrying every port of the same region. This bounded search may conservatively reject a route when its first candidates have unusable shore access; it never invents a shortcut.

A battalion walks to its departure point, switches to the same transport-boat representation for all four kinds, and moves along the stored graph waypoints at its own `seaSpeed` (initially 3 map units per game second). Land-speed upgrades and terrain do not change sea speed. While embarked it cannot attack, be attacked by land battalions, capture, or occupy a land garrison slot. No naval combat or independent ship purchasing is introduced. The final destination reservation still counts toward local training. A full landing region does not prevent arrival. After landing it resumes land movement and captures hostile regions normally.

Transport records store only source, destination, waypoint index and embarkation flag; canonical geometry is reconstructed from the shared graph. Save validation checks exact route continuity and current segment position. Existing v5 land-only saves remain compatible. The authoritative LAN server uses the same engine and graph; rule-version negotiation prevents old clients from silently applying the previous rules.
