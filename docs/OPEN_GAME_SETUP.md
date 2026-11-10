# Open game setup and physical map capacity

## Rules and UI

- No configured four-faction or four-human ceiling remains. Solo AI is an integer input with its current range inside the input; LAN host setup and lobby also use numeric inputs.
- A LAN game needs at least two currently connected human players. AI and retained offline seats do not satisfy this threshold. Seats survive stream disconnection for reconnect; open/close broadcasts update the lobby and the authoritative start check counts active authenticated streams. Replacing a stream cannot double-count a seat or let a stale close remove the replacement.
- Every faction starts with two complete initial management groups, ten units, 120 gold, total capacity 24 and production 2. The eligible groups retain the previous size/land-footprint rules. Their representative provinces have bidirectional land corridors and routes outside the starting pair.
- `scripts/build-spawn-sites.mjs` builds the eligible undirected group graph and runs maximum-cardinality blossom matching. The current map has 1,333 legal group links and 293 disjoint two-group starts. These are physical placements, not an arbitrary replacement player limit. At a crowded start an expansion exit may be enemy-owned.
- Seeded allocation picks a first site and then distant sites from that disjoint pool. Every advertised count works for every seed; choosing more players preserves the smaller game's initial prefix. Existing saved campaigns keep their positions.
- The startup title/menu are right-anchored, shading is reversed, and home settings work without an active game. Mobile keeps the same composition with local scrolling.

## Safety and scaling

AI count is a safe integer validated at local setup, AI creation, game creation, and each authoritative room mutation. Maximum saves derive from the same available spawn resources. Existing local save version 5 stays compatible. LAN rules identity changes to reject mixed old/new clients.

Sparse reservations avoid a players-by-map array each tick. Ownership, victory, and AI territory counts use one-pass indexes. AI turns are distributed across an 80-tick cycle; each AI still thinks once per cycle. Dynamic colors and actor IDs work beyond four, including simulation and replication regressions for actor 256. Ownership is a continuous proportional bar rather than hundreds of gap-separated columns.

LAN retains same-origin checks, 8 KiB request-body byte limits, per-seat command rate limits, host-only configuration/start and mutation-time race checks. Slow SSE consumers disconnect instead of creating unlimited output queues and may reconnect with the same ticket. Hundreds of concurrent clients are not certified by the physical map capacity.

## Verification

- All advertised 293 starts checked for whole-group non-overlap, equal resource budgets and bidirectional land exits.
- Maximum matching compared against exhaustive brute-force matching on 450 small random graphs, including odd cycles.
- Full 293-faction creation, save round trip and two simulation ticks passed with 3,653 initial units. This is a correctness smoke test, not a sustained load guarantee.
- Real HTTP tests cover six humans, more than four total factions, AI reservations, private talent state, high actor IDs, reconnects, slow clients, request limits and race checks.
- Browser regression coverage was added for right anchoring, settings without a game, number validation, dynamic ranges, and the two-online-human LAN threshold. Local Chromium could not launch in this execution environment (`socket() failed: Operation not permitted`), so these checks must run in the deployed-SHA CI and live acceptance workflow.

## Performance observations

The current map's capacity is a geometry/resource limit, not a claim that every browser or LAN host can run that many players smoothly. Measurements use Node 24.22.1 on cloud Linux x64 / AMD EPYC 9V74, with 9 available logical CPUs. The simulation runs on one JS thread. Each case used seed 42, one human and the remaining factions AI, and 160 ticks (eight simulated seconds). Numbers include initial AI navigation and are not a long-session stress certification. Rendering and hundreds of real network clients are not included.

| Factions | Units after sample | Create ms | Tick median ms | Tick p95 ms | Worst tick ms | Full frame bytes | Delta bytes | Process RSS MiB |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 8 | 168 | 99 | 1.68 | 2.21 | 38.58 | 696,316 | 51,177 | 708 |
| 32 | 765 | 120 | 4.47 | 6.75 | 316.83 | 875,031 | 241,225 | 648 |
| 128 | 2,476 | 294 | 14.65 | 20.03 | 362.43 | 1,501,604 | 912,902 | 680 |
| 293 | 3,597 | 462 | 24.91 | 39.56 | 843.45 | 2,139,450 | 1,625,602 | 738 |

RSS includes loaded terrain/map data and previous test cases, so it is not incremental per-game memory. AI staggering removed the synchronized first-cycle burst (previously ~1.13 seconds at 32 factions and ~7.04 seconds at 293), but single route searches still cause noticeable stalls. A full-capacity game is therefore supported structurally, not recommended as a smooth default.

LAN snapshots share serialized views for clients with no private talent choices and retain per-viewer privacy when needed. Shared bases use object identity rather than only the tick, because commands can mutate the state more than once in a tick. Serialization reuse does not reduce bytes transmitted to each recipient; very large games remain bandwidth-heavy and slower connections may reconnect because of the retained output-buffer guard.

The actual server serializer was also measured with fake byte-counting stream writes in an idle all-human game (not sockets or clients): median shared broadcast times were 2.84 / 29.09 / 72.27 ms for 32 / 128 / 293 recipients, versus 22.28 / 255.33 / 1,053.73 ms for separately encoding the same idle state. Two viewers with pending private choices required exactly three encodes and measured 3.99 / 26.73 / 78.69 ms. At 293 idle humans each frame was 825,237 bytes: roughly 242 MB per full broadcast, so 10 Hz delivery to every recipient would require about 2.42 GB/s before overhead. This exposes a practical network limit, not a verified supported client count.
