# Modern architecture in tactical view

The four original Rouge modern building meshes are packed unchanged into
`src/render/assets/modern-buildings.glb` with the one common embedded 512×512 atlas.
To regenerate it from the four editable v3 exports (names listed below):
```sh
node scripts/pack-building-models.mjs /path/to/rouge-building-art-v3/assets
```

| Original GLB | Render kind | Triangles |
|---|---|---:|
| town_house.glb | house | 146 |
| market.glb | market | 260 |
| barracks.glb | barracks | 248 |
| fortress.glb | fortress | 180 |

Only the near 3D mode requests the bundle. All meshes share one material and
the available instances are bounded by the pre-existing tactical limit.
Fallback boxes retain the original graphics until the art loads or if it fails.
The original town/obstacle center and yaw, ground level, and 0.50×0.65 footprint
are unchanged. The meshes have no decorative ground slabs and render at a common
0.5 scale within those original footprints. A facility replaces a base
province's first valid town slot; its other slots stay homes. A region with no
valid slot creates no new building. Construction levels, costs, save format,
collision data, and strategic 2D rendering are unchanged.
