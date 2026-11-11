# Land relief and ocean surface

These are **visual-only** surfaces. Gameplay geography, elevation, sea/land mask,
pathfinding, collision, entity state and save/LAN identity remain unchanged.
Existing land triangles and coastline lines cover the same flat sea plane in both
2D and 3D. No shader changes a vertex, infers a coastline or makes water walkable.

## Ocean appearance and cost

The sea now represents the **water surface**, not ocean-bottom relief or depth.
A subdued blue-gray base carries three low-contrast, static ripple frequencies.
The 2D view remains quiet behind political colors, coastlines and text. In the
close, tilted 3D view, a gently broken sky/sun highlight follows the camera angle
using the renderer's existing view-transition uniform. It is an optical effect,
not a reflection render pass. This does not depict measured depth or real waves.

- The shader in `src/render/oceanSurface.ts` is original procedural artwork.
  Ocean Bottom images are no longer loaded or bundled.
- Ripples change base brightness by at most 5.5%. Near-view reflection is separately
  bounded and fades away in the 2D view. Screen-space derivative filtering removes
  subpixel waves on distant views and small/mobile screens instead of shimmering.
- Integer longitude frequencies match across the repeated atlas at the date line.
- There is no sea texture allocation, network request, animation clock, CPU wave
  update, extra mesh or draw call. Existing menu, hidden-tab and paused-render
  suspension remains effective. Movement does not depend on the cosmetic shader.

## Land source and permission

Land shading uses [Natural Earth 1:50m Shaded Relief 3.2.0](https://www.naturalearthdata.com/downloads/50m-raster-data/50m-shaded-relief/),
[official archive](https://naturalearth.s3.amazonaws.com/50m_raster/SR_50M.zip).
It is derived from downsampled SRTM Plus, with flat water, and is public domain under
[Natural Earth terms](https://www.naturalearthdata.com/about/terms-of-use/).
Made with Natural Earth; original contributors include Tom Patterson and Nathaniel
Vaughn Kelso. `data/map-surfaces-audit.json` records archive/TIFF SHA-256 hashes,
world-file registration, crop, output dimensions, byte counts and hashes.

The 10800 × 5400 equirectangular source covers ±180° longitude and ±90° latitude.
Its TFW describes pixel centers at −179.9833333333°, +89.9833333333° with 1/30°
spacing. The generator validates that transform, area-filters longitude, then
inverse-Miller samples output pixel centers using the game's `WORLD_BOUNDS` and
`CROP_ID`. North is V=1. Date-line copies share textures; longitude repeats and
latitude clamps. Geographic relief only modulates actual land triangles, not sea
or polygon holes. Brightness uses a scalar 0.65–1.15 multiplier with 206/255 neutral,
retaining political hue and the separate coastline/border/label draw order.

## Loading and mobile cost

Desktop land relief is 4096 × 1808 (597,008 bytes); compact relief is 2048 × 904
(159,428 bytes). Water adds no image or texture. This removes the former ocean
image download (526,468 / 127,890 bytes) and about 9.4 / 2.4 MiB of mipmapped GPU
texture storage. Land texture storage is approximately 37.7 / 9.4 MiB, plus temporary
browser decode memory. Coarse-pointer devices, short screens below 700 CSS px, GPUs
below a 4096 texture limit, or reported memory ≤4 GB choose compact once. Rotation
does not download another size.

The single content-hashed WebP is decoded asynchronously with low fetch priority
after the initial map frame. Input and simulation never await it. Failure leaves
flat land colors with the procedural sea intact. No retry loop or canvas pixel
processing is added. Textures and pending image work are released on disposal.

## Reproduce land assets

Normal builds use committed assets, without downloading source TIFFs or requiring
Python imaging libraries. To regenerate, install NumPy and Pillow, download the
relief archive above, then run:

```sh
python scripts/prepare-map-surfaces.py --relief /path/to/SR_50M.zip
node --experimental-strip-types --test tests/map-surfaces.test.mjs tests/ocean-surface.test.mjs
```

The generator reads projection bounds from `src/game/geo.ts`. Crop changes require
regeneration; tests reject stale bounds. Pillow/libwebp versions may change bytes.
Commit assets and audit together after reviewing appearance. No external map host
is used at runtime. Original source scale limits close-up land detail.

## Verification

Unit tests check exact crop, UV orientation, geographic round trips, source hashes,
asset budgets, compact-device choice, bounded relief, wave filtering and date-line
continuity. Browser tests cover desktop/touch loading, paused redraw suspension,
political color/name/border preservation, coast and near-water screenshots,
orientation without duplicate downloads and missing/slow relief images.
Screenshots accompany post-deployment acceptance in the repository's
PR squash → main deploy → main test workflow.

## Selected territory inner glow

The selected border keeps its fine outline and original ownership fill. The
inner glow now samples the nearest finite boundary into one non-overlapping
land mesh instead of stacking one transparent strip per boundary segment.
This removes bright triangular fans and dark gaps at jagged turns. Adaptive
subdivision keeps curved joins smooth while straight fades stay compact.
Opacity is 0.24 with a squared smooth falloff over two map units. Holes,
islands, dissolved source seams, crop clipping and world repeats use the same
land/border geometry as before. Rebuilding remains in a cancellable worker;
selection changes discard old geometry and stale worker results.
The overlay also interpolates the original terrain triangle heights. It never
resamples a different relief surface that could dip below the land and expose
triangular dark gaps. Squared-distance queries, inherited vertex samples and a
bounded corner tolerance keep the largest coast's rebuild within its budget.
