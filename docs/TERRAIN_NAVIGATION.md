# Terrain-only shared flow navigation

## Physical navigation, not administrative routes

`build-terrain-navigation.py` first dissolves **all** Natural Earth administrative polygons into continuous land. It clips to the game viewport, retains islands/lake holes, and triangulates land and water with constrained Delaunay triangles. Shared triangle edges form the navigation links. No province ID, management group or flag survives in this atlas.

`TerrainNavigator` builds reverse integration fields per destination triangle and movement-speed profile. Troops use the terrain corridor, with line-of-sight shortcuts on each surface. Territory-click orders use the destination town as the arrival coordinate.

Short direct land marches take the clear land segment. Longer journeys compare travel times using land speed, sea speed and the formation's boarding and landing costs. A coastal crossing can beat a long continental detour. Spawn generation uses a separate land-only query to verify a walkable exit. Surface changes use physical shoreline edges. Same-surface shortcuts use interval-union clipping against exact triangles.

This is shortest-path integration on the terrain graph, not a claim of a mathematically exact continuous shortest path. Greedy string pulling has bounded lookahead (64 raw points) to cap long-route planning costs. It does not model moving units as obstacles or add crowd separation.

## Simulation

Each dispatched army stores one versioned coordinate route and its current segment. Its battalions retain their own positions and use the terrain locally to form up, fight and enter the destination. Over water, the entire army shares one ship and a coastal transition. Administrative borders do not form physical obstacles. Formed armies begin capturing their ordered target after at least one battalion enters the town around its anchor.

When friendly columns block one another, the longest-waiting army has priority, with army ID breaking ties. A yielding formation checks clearance before stepping aside. A blocked coastal formation can use another accessible berth, and a blocked ship can replan from its actual position. Boarding reserves a circular hull with radius 0.6. A destination town within landing range can receive battalions directly on an island too small for a marching formation. At most two formations start a route recovery per tick. Each formation waits at least 480 ticks between attempts.

Attack arrows start at the current formation and follow its remaining route, including local detours. Shared directed segments merge; arrows branch where the routes split. Strategic, terrain and spectator views use the same route data.

Capacity applies to final garrisons, not crossing a boundary during travel. Production counts physical occupants/reservations and cannot create units just because the grouping changes. Sea mode is mirrored in `transport` for rendering/combat; it is not the old province-port route protocol.

The save validator checks route geometry, destination and terrain revision, along with formation phases and battalion membership. The server and local Worker plan movement and send shared route points once per army. Ordered deltas can reuse those points until the route changes. Group split/merge or ownership changes do not invalidate physical flow fields. Replacing terrain requires a new atlas revision and validated route state.

## Assets, bounds and performance

The source atlas is generated offline with Python/Shapely 2.1+, not rebuilt in a browser or in routine CI. `data/terrain-navigation.json.gz` is unpacked by `prepare:map`. Binary base64 arrays avoid TypeScript inferring hundreds of thousands of nested literal arrays. The current atlas has about 308k physical triangles. Runtime coordinates, links, centers and spatial index use packed arrays; at most four destination/profile fields are cached (~15MB of field arrays at this triangle count).

Vite emits the terrain and administrative JSON as two content-hashed assets instead of embedding them in both JavaScript bundles. After the minimal start menu paints, the game graph starts both downloads concurrently. The main thread and ES module simulation worker use the same URLs and `force-cache` to reuse those downloads; development revalidates regenerated data. Top-level await keeps each graph from using incomplete data, and HTTP/network/JSON failures reject startup so the menu can offer a reload. This shares download bytes, not parsed objects or navigation indexes across threads. Node tests and the LAN server continue reading local JSON without HTTP.

Local checks: Channel route planning roughly 0.5 seconds cold in the execution environment; Hubei→Hunan legal direct segment roughly 1ms. These are not mobile-device or frame-rate guarantees. All line segments must remain on their declared land/water surface and save/reload must reproduce movement. Browser/mobile runtime still requires CI/device verification.
