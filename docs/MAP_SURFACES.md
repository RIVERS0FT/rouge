# Natural Earth land shading and ocean artwork

These are **visual-only** map surfaces. No gameplay geography, elevation, sea/land
mask, movement cost, pathfinding, collision, entity state or save/LAN identity changes.
The previous near-view decorative displacement remains unchanged.

## Official sources and permission

- [Natural Earth 1:50m Shaded Relief 3.2.0](https://www.naturalearthdata.com/downloads/50m-raster-data/50m-shaded-relief/),
  [official S3 archive](https://naturalearth.s3.amazonaws.com/50m_raster/SR_50M.zip).
  Gray land shading derived from downsampled SRTM Plus, with flat water.
- [Natural Earth 1:50m Ocean Bottom 3.2.0](https://www.naturalearthdata.com/downloads/50m-raster-data/50m-ocean-bottom/),
  [official S3 archive](https://naturalearth.s3.amazonaws.com/50m_raster/OB_50M.zip).
  Illustrated depth and submarine relief derived from CleanTOPO2, extending beneath land.
- Both are public domain under [Natural Earth terms](https://www.naturalearthdata.com/about/terms-of-use/).
  Modification and redistribution are permitted. Made with Natural Earth;
  original contributors include Tom Patterson and Nathaniel Vaughn Kelso.

`data/map-surfaces-audit.json` records the source archive/TIFF SHA-256 hashes,
world-file affine transforms, exact crop, output dimensions, byte counts and hashes.
The publication includes this audit, this document and third-party notices.

## Alignment and appearance

The source rasters are 10800 × 5400 equirectangular images, covering ±180° longitude
and ±90° latitude. The supplied TFW positions **pixel centers** at
−179.9833333333°, +89.9833333333° with 1/30° spacing. We validate that transform,
area-filter longitude, then inverse-Miller sample at output pixel centers using the
same `WORLD_BOUNDS`/`CROP_ID` as the game. North is texture V=1, south V=0.
There is no arbitrary stretching, latitude-linear texture interpolation across
large triangles, or cropped-edge offset. The already-projected textures use one
cheap sample per land/sea fragment. Date-line copies share local UVs and textures;
longitude repeats, latitude clamps.

Land grayscale modulates all existing linear RGB ownership channels equally, with
206/255 as neutral and a bounded 0.65–1.15 brightness multiplier. The original
political vertex colors and selection fill remain intact. Only actual land triangles
receive this texture: no land shading leaks onto ocean or into polygon holes.
Separate coastlines, national/management borders, selection glow, province labels,
country titles and units retain their existing draw order and rules.

The sea's original Ocean Bottom green channel is remapped to a subdued deep
blue-gray / shelf teal palette. Its real geographic shelf and submarine relief provide
coastal transitions without a fabricated glow around every island. Graticules are
quieter. The land mesh occludes sea artwork; no new geometry or coastline is inferred.
These are illustrated tones, **not numeric depth or elevation**. Source scale,
compression and 50m/10m shoreline differences limit close-up precision. Tiny islands
may have no terrain detail. This does not make the terrain traversable or physically 3D.

## Loading and mobile cost

- Desktop: relief 4096 × 1808 (597,008 bytes), ocean 2048 × 904 (526,468 bytes).
- Compact: relief 2048 × 904 (159,428 bytes), ocean 1024 × 452 (127,890 bytes).
- Coarse-pointer devices, short screens below 700 CSS px, GPUs below a 4096 texture
  limit, or a reported memory budget ≤4 GB choose compact once. Rotation does not
  fetch the other pair. Each route downloads two images, not all four.
- At ordinary RGBA storage with mipmaps, total texture storage is approximately
  47 MiB desktop / 12 MiB compact. Decoded browser images can add temporary memory.
- Images are separate content-hashed WebP assets, not JS or main-thread base64.
  Loading starts after the initial map frame, with async image decode and low fetch
  priority. Menu, game creation, simulation and input never await the artwork.
- Loading failure leaves playable flat land/sea colors. No retry loop, canvas pixel
  processing, extra geometry, extra render pass, continuously animated water, or
  per-frame CPU shading. Images/textures are released when the renderer is disposed.

## Reproduce assets

Normal installs/builds use the committed assets and do **not** download source TIFFs
or need Python imaging packages. To intentionally regenerate them, download the two
archives above and, with Python, NumPy and Pillow installed, run:

```sh
python scripts/prepare-map-surfaces.py --relief /path/to/SR_50M.zip --ocean /path/to/OB_50M.zip
node --experimental-strip-types --test tests/map-surfaces.test.mjs
```

The generator obtains current projection bounds directly from `src/game/geo.ts`.
A crop change requires regeneration; the regression test rejects stale bounds.
Pillow/libwebp versions can change compressed bytes; commit the new assets and audit
together after verifying appearance. Production builds require no external map host.

## Verification

Unit coverage checks exact crop/UV orientation, geographic round trips, TFW center
registration, source/output hashes, asset budgets, low-memory choice and bounded
neutral relief. Browser acceptance checks desktop and touch artwork loading,
province selection/ownership color, country names/borders, Himalayan alignment
screenshots, orientation without duplicate downloads, and graceful image failure.
Screenshots are reviewed alongside post-deployment main acceptance, following the
repository's PR squash → main deploy → main test workflow.
