# Terrain-only shared flow navigation

## Physical navigation, not administrative routes

`build-terrain-navigation.py` first dissolves **all** Natural Earth administrative polygons into continuous land. It clips to the game viewport, retains islands/lake holes, and triangulates land and water with constrained Delaunay triangles. Shared triangle edges form the navigation links. No province ID, management group or flag survives in this atlas.

`TerrainNavigator` builds reverse integration/next-triangle fields per destination triangle and movement-speed profile. A certified unobstructed land line goes directly to the destination; otherwise troops follow the terrain corridor, with line-of-sight pulling within each surface. They never visit an intermediate province center merely because they crossed a boundary. Only the destination center is used as the default arrival coordinate for a territory-click order.

Land routes are preferred if connected. Otherwise a land/water field permits coastline transitions and uses land/sea speed for travel-time edge costs. Triangle portals are the only surface-crossing points. Same-surface shortcuts use interval-union clipping against exact triangles, not sparse point sampling that could miss thin islands. Lake water is a physical water surface in this version; there is no special ocean-only trade-port gameplay rule.

This is shortest-path integration on the terrain graph, not a claim of a mathematically exact continuous shortest path. Greedy string pulling has bounded lookahead (64 raw points) to cap long-route planning costs. It does not model moving units as obstacles or add crowd separation.

## Simulation

Units store versioned coordinate `travel` points and segment index. `route` is empty, `target/destination` is the final administrative target, and province membership is updated from actual position. Intermediate boundaries do not cause stopping, detours, hostile-permission rejection or zero-capacity barriers. Combat and existing proximity-based capture still apply when troops actually meet enemies or remain near an administrative center; pathfinding does not deliberately visit those centers.

Capacity applies to final garrisons, not crossing a boundary during travel. Production counts physical occupants/reservations and cannot create units just because the grouping changes. Sea mode is mirrored in `transport` for rendering/combat; it is not the old province-port route protocol.

The new map namespace rejects old pixel-map saves explicitly with `incompatibleMap`. New saves validate coordinate route segments, destination, current on-segment position and terrain revision. The server/worker plans movement; network snapshots include travel, not the static navigation atlas. Group split/merge or ownership changes do not invalidate flow fields. Replacing actual terrain requires a new atlas/revision and new validated route state.

## Assets, bounds and performance

The source atlas is generated offline with Python/Shapely 2.1+, not rebuilt in a browser or in routine CI. `data/terrain-navigation.json.gz` is unpacked by `prepare:map`. Binary base64 arrays avoid TypeScript inferring hundreds of thousands of nested literal arrays. The current atlas has about 308k physical triangles. Runtime coordinates, links, centers and spatial index use packed arrays; at most four destination/profile fields are cached (~15MB of field arrays at this triangle count).

Local checks: Channel route planning roughly 0.5 seconds cold in the execution environment; Hubei→Hunan legal direct segment roughly 1ms. These are not mobile-device or frame-rate guarantees. All line segments must remain on their declared land/water surface and save/reload must reproduce movement. Browser/mobile runtime still requires CI/device verification.
