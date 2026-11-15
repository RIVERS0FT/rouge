# Smooth unit presentation

Movement, combat, pathfinding, collision, save data and LAN frames are unchanged.
Only the renderer stores short-lived position history keyed by unit ID.

- Terrain models sample a 100 ms delayed
  snapshot timeline. Linear interpolation supplies uniform steps between the
  usual 100 ms updates, rather than repeatedly accelerating toward the latest
  position. The 2× local speed's 50 ms snapshots use the same presentation clock.
- No extrapolation: if a packet is late or the game pauses, positions reach the
  last authoritative snapshot and stop. A late packet resumes from that endpoint
  without jumping into a retroactively started segment. Additional network delay
  can still produce a visible pause; this does not predict unconfirmed movement.
- Camera easing follows the display refresh rate; perceptible 3D unit movement
  can draw at up to 60 fps. Subpixel movements use an adaptive interval (16.7–100 ms),
  targeting at most 0.25 CSS pixel per frame when the device keeps up. Stationary
  maps sleep after an exact final-position frame, including in terrain view.
  Covered menus/dialogs keep their existing frozen backdrop and LAN keeps running.
- Validate each complete snapshot segment once against buildings and physical
  land/sea boundaries. If two valid endpoints would cut a corner through a house,
  inlet or island, snap to the confirmed endpoint instead of drawing through it.
  This intentionally favors legal placement over smoothing an unknown detour.
- Spawned units appear immediately; dead IDs are removed immediately. Campaign
  changes, tick rollback/load, >500 ms gaps, large corrections, ownership/class
  changes and embark/disembark transitions discard incompatible history. World
  wrapping and camera-mode switches happen after sampling the canonical position.
- The 2D map hides every army, including transports. It allocates no unit sprite
  batch or texture and keeps no hidden unit interpolation tracks. Switching into
  3D initializes models at the latest authoritative positions, even while paused.

## Reproducible regression checks

`tests/unit-motion.test.mjs` feeds 100 ms snapshots at 4 map units/s and samples
60 fps. After startup, all 54 measured frame deltas equal 0.06666667 map units
(spread <1e-9); the prior strategic 100 ms cap only allowed 10 position updates/s.
It also covers frame-rate independence, 2× cadence, irregular arrivals, silence,
same-tick updates, reset cases, immutable input and bounded history.

`tests/unit-motion-terrain.test.mjs` checks real terrain and house constraints.
`tests/browser/unit-motion.spec.ts` drives the real WebGL renderer clock at both
320 (2D) and 80 (3D) camera distances, asserts zero 2D instances and tracks,
reads the 3D instance matrices for intermediate/final positions, and checks idle/modal render counts.
The existing unit-mode browser suite covers repeated zoom, touch and viewport
changes. These tests establish interpolation and scheduling, not a guaranteed
physical 60 fps on every phone, browser or software-rendered CI runner.

## Strategic map

The 2D army counters were removed on 2026-11-15 at the user's request. Army-only
snapshot changes no longer redraw this view. Territory, capture, labels, selection
and camera changes retain their normal rendering, while full simulation continues.
