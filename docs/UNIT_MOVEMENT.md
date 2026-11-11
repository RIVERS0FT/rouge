# Smooth unit presentation

Movement, combat, pathfinding, collision, save data and LAN frames are unchanged.
Only the renderer stores short-lived position history keyed by unit ID.

- Both strategic sprites and terrain models sample the same 100 ms delayed
  snapshot timeline. Linear interpolation supplies uniform steps between the
  usual 100 ms updates, rather than repeatedly accelerating toward the latest
  position. The 2× local speed's 50 ms snapshots use the same presentation clock.
- No extrapolation: if a packet is late or the game pauses, positions reach the
  last authoritative snapshot and stop. A late packet resumes from that endpoint
  without jumping into a retroactively started segment. Additional network delay
  can still produce a visible pause; this does not predict unconfirmed movement.
- Camera easing and perceptible movement can draw at up to 60 fps in either
  view. Subpixel whole-world movements use an adaptive interval (16.7–100 ms),
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

## Reproducible regression checks

`tests/unit-motion.test.mjs` feeds 100 ms snapshots at 4 map units/s and samples
60 fps. After startup, all 54 measured frame deltas equal 0.06666667 map units
(spread <1e-9); the prior strategic 100 ms cap only allowed 10 position updates/s.
It also covers frame-rate independence, 2× cadence, irregular arrivals, silence,
same-tick updates, reset cases, immutable input and bounded history.

`tests/unit-motion-terrain.test.mjs` checks real terrain and house constraints.
`tests/browser/unit-motion.spec.ts` drives the real WebGL renderer clock at both
320 (2D) and 80 (3D) camera distances, reads the actual instance matrices,
asserts intermediate and final positions, and checks idle/modal render counts.
The existing unit-mode browser suite covers repeated zoom, touch and viewport
changes. These tests establish interpolation and scheduling, not a guaranteed
physical 60 fps on every phone, browser or software-rendered CI runner.

## Strategic counter artwork and antialiasing

The eight army symbols and common transport symbol now use a shared 512×512
supersampled atlas with a pale rim, dark keyline, subtle face shading and stronger
glyph strokes. The manual mip chain downsamples each cell separately and leaves
a transparent border at every useful level, preventing neighbouring glyphs from
bleeding into each other. Trilinear minification and continuous alpha preserve
fractional edge coverage during zoom and subpixel movement; the previous hard
alpha cutoff is removed. There are still no per-unit textures or extra draws.

The existing 7–16 CSS-pixel bounds and 1.5 maximum device-pixel ratio remain to
limit crowding and whole-map GPU cost. The texture including mip levels consumes
about 1.33 MiB of RGBA pixels. `unit-sprite-antialias.spec.ts` checks actual WebGL
coverage, symbol distinctions and mip borders at 7/11/16 pixels, four quarter-pixel
offsets and DPR 1/1.5, and saves native-resolution comparison sheets for inspection.
