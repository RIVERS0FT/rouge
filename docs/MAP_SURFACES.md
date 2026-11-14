# Land relief and ocean surface

These are **visual-only** surfaces. Gameplay geography, elevation, sea/land mask,
pathfinding, collision, entity state and save/LAN identity remain unchanged.
Existing land triangles and coastline lines cover the same flat sea plane in both
2D and 3D. No shader changes a vertex, infers a coastline or makes water walkable.

## Ocean appearance and cost

The sea now represents the **water surface**, not ocean-bottom relief or depth.
A deep teal base carries soft, irregular grain at four scales and subdued,
noise-warped static ripples, like the supplied historical-map reference. The
existing faint geographic graticule stays above the water and below the land.
The 2D view remains quiet behind political colors, coastlines and text. In the
close, tilted 3D view, a gently broken sky/sun highlight follows the camera angle
using the renderer's existing view-transition uniform. It is an optical effect,
not a reflection render pass. This does not depict measured depth or real waves.

- The shader in `src/render/oceanSurface.ts` is original procedural artwork.
  Ocean Bottom images are no longer loaded or bundled.
- Grain and ripples together change linear base brightness by at most 26.5%; the
  ripple contribution alone is at most 2.5%. Near-view reflection is separately
  bounded and fades away in the 2D view. Screen-space derivative filtering removes
  subpixel waves on distant views and small/mobile screens instead of shimmering.
- Every noise octave wraps at the date line; integer longitude ripple frequencies
  also match across the repeated atlas.
- There is no sea texture allocation, network request, animation clock, CPU wave
  update, extra mesh or draw call. Existing menu, hidden-tab and paused-render
  suspension remains effective. Movement does not depend on the cosmetic shader.

## Coastal relief shadow

The real coastline also carries a soft shadow fading five CSS pixels offshore.
One instanced ribbon uses two triangles per source coastal segment; shared
endpoints form miter joins instead of overlapping round caps. A screen-sized
mask combines the strongest contribution, so intricate shores and small islands
cannot accumulate black patches. Subpixel islands fade their shadow strength
with their connected coastline's projected extent. The mask updates only when the camera, viewport
or longitude-wrap mode changes. A sea-plane composite lies below the opaque
land, whose depth masks the inland half. Internal and political boundaries never
cast this shadow. The mask texture costs four bytes per drawing-buffer pixel,
without a depth buffer. The renderer releases it and the shared geometry/materials
on disposal. No new image download, animation clock or simulation change is added.

## Land source and permission

Land shading uses [Natural Earth II 1:10m with Shaded Relief](https://www.naturalearthdata.com/downloads/10m-raster-data/10m-natural-earth-2/),
[official high-resolution archive](https://naturalearth.s3.amazonaws.com/10m_raster/NE2_HR_LC_SR.zip).
The download page advertises 3.2.0; the archive's bundled VERSION.txt says 2.0.0.
Both values and the exact downloaded hashes are retained in the audit. The source is public domain under
[Natural Earth terms](https://www.naturalearthdata.com/about/terms-of-use/).
Made with Natural Earth; original contributors include Tom Patterson and Nathaniel
Vaughn Kelso. `data/map-surfaces-audit.json` records archive/TIFF SHA-256 hashes,
world-file registration, crop, output dimensions, byte counts and hashes.

The 21600 × 10800 RGB equirectangular source covers ±180° longitude and ±90° latitude.
Its TFW describes pixel centers at −179.9916666667°, +89.9916666667° with 1/60°
spacing. The generator validates that transform, area-filters longitude, then
inverse-Miller samples output pixel centers using the game's `WORLD_BOUNDS` and
`CROP_ID`. North is V=1. Date-line copies share textures; longitude repeats and
latitude clamps. Geographic relief only modulates actual land triangles, not sea
or polygon holes. Brightness uses a scalar 0.65–1.15 multiplier with 206/255 neutral,
retaining political hue and the separate coastline/border/label draw order.

## Loading and mobile cost

The full pyramid has 650 WebP files totaling 10,519,512 bytes. Only one coarse
atlas loads at startup: desktop 2048 × 904, compact 1024 × 452. Projected texel
density selects 2048, 4096, 8192 or 16384 world-width levels, with hysteresis.
Each tile has 512 content pixels and a two-pixel gutter on all sides. Longitude
gutters wrap; latitude gutters clamp. Partial bottom rows retain true crop coordinates.

The shader uses a page table and a single-channel texture array. At most 48
desktop / 24 compact tiles reside on the GPU (12.2 / 6.1 MiB), plus the coarse
atlas and page table. Visible fine tiles take priority; resident parent tiles and
the permanent coarse atlas fill gaps. Tiles outside the working set are evicted.
No full 16384 texture is allocated. Rotation retains the compact choice and base.

Four worker requests run concurrently. OffscreenCanvas decodes pixels off the UI
thread; the renderer uploads changed array layers only. Stale requests are
cancelled; batches update the map together. A bounded Cache Storage cache and
content-versioned URLs reuse downloaded tiles across refreshes. Storage failures
fall back to HTTP; missing tiles retain coarse shading without blocking input.
Failure of the coarse image retains playable flat political colours and water.
Disposal aborts fetches and releases the worker, bitmaps and GPU storage.

## Reproduce land assets

Normal builds use committed assets, without downloading source TIFFs or requiring
Python imaging libraries. To regenerate, install NumPy and Pillow, download the
relief archive above, then run:

```sh
python scripts/prepare-map-surfaces.py --source /path/to/NE2_HR_LC_SR.zip
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
Depth separation now scales with camera distance and viewport height: it remains
at its original safe value far away, but projects to less than half a CSS pixel
at the closest terrain zoom. Coast, country, internal and selection edges use
one scale so tiny islands do not gain a second floating outline. No border
colors, widths or classification rules change. The browser evidence waits for
the campaign to finish loading and captures Greenland, a hole-bearing Hungarian
region and Fiji in addition to desktop/phone strategic and terrain views.
