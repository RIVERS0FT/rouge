#!/usr/bin/env python3
"""Generate the visual-only NE II 1:10m Miller pyramid (Pillow and NumPy).

Normal builds use the committed WebP pyramid; the source TIFF is never shipped.
No navigation, elevation, collision, coastline or simulation data is generated.
"""
import argparse, hashlib, json, math, subprocess, zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = {"name": "Natural Earth II 1:10m with Shaded Relief", "version": "3.2.0",
          "page": "https://www.naturalearthdata.com/downloads/10m-raster-data/10m-natural-earth-2/",
          "url": "https://naturalearth.s3.amazonaws.com/10m_raster/NE2_HR_LC_SR.zip"}
TILE, GUTTER = 512, 2


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def load_source(path):
    info = {**SOURCE, "archiveSha256": digest(path)}
    cache = ROOT / ".cache/map-source"
    cache.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path) as archive:
        name = "NE2_HR_LC_SR.tif"
        affine = [float(v) for v in archive.read("NE2_HR_LC_SR.tfw").decode().split()]
        expected = [1/60, 0, 0, -1/60, -180+1/120, 90-1/120]
        assert len(affine) == 6 and all(abs(a-b) < 1e-9 for a, b in zip(affine, expected))
        info["archiveVersion"] = archive.read("NE2_HR_LC_SR.VERSION.txt").decode().strip()
        tif = cache / name
        with archive.open(name) as src, tif.open("wb") as out:
            import shutil
            shutil.copyfileobj(src, out, 1024*1024)
    info.update(tifSha256=digest(tif), worldFile=affine, size=[21600, 10800])
    Image.MAX_IMAGE_PIXELS = 300_000_000
    with Image.open(tif) as original:
        assert original.size == (21600, 10800)
        # Keep live political inks; NE II supplies finer physical luminance detail.
        image = original.convert("L")
    return image, info


def project(image, width, bounds):
    height = round(width * (bounds["bottom"]-bounds["top"])/(bounds["right"]-bounds["left"]))
    rows = np.asarray(image.resize((width, image.height), Image.Resampling.LANCZOS))
    result = np.empty((height, width), dtype=np.uint8)
    for start in range(0, height, 64):
        end = min(height, start+64)
        z = bounds["top"]+(np.arange(start, end)+.5)*(bounds["bottom"]-bounds["top"])/height
        latitude = np.arctan(np.sinh(-z*math.pi/180*.8/10))/(.8*math.pi/180)
        y = (90-latitude)*60-.5
        low = np.floor(y).astype(int)
        fraction = (y-low)[:, None]
        value = rows[low]*(1-fraction)+rows[np.minimum(low+1, image.height-1)]*fraction
        result[start:end] = np.rint(value).astype(np.uint8)
    return Image.fromarray(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", "--relief", dest="source", type=Path, required=True)
    args = parser.parse_args()
    config = json.loads(subprocess.check_output(["node", "--experimental-strip-types", "--input-type=module", "-e",
        "import {WORLD_BOUNDS,CROP_ID,PROJECTION_ID} from './src/game/geo.ts';console.log(JSON.stringify({bounds:WORLD_BOUNDS,crop:CROP_ID,projection:PROJECTION_ID}));"], cwd=ROOT))
    image, source = load_source(args.source)
    highest = project(image, 16384, config["bounds"])
    image.close()
    destination = ROOT / "src/assets/map/ne2"
    destination.mkdir(parents=True, exist_ok=True)
    outputs, levels = {}, []

    def save(name, raster, meta):
        target = destination / name
        raster.save(target, "WEBP", quality=90, method=4)
        return name, {"width": raster.width, "height": raster.height, "bytes": target.stat().st_size,
                      "sha256": digest(target), **meta}

    for width in [1024, 2048, 4096, 8192, 16384]:
        height = round(width*(config["bounds"]["bottom"]-config["bounds"]["top"])/3600)
        projected = highest if width == 16384 else highest.resize((width, height), Image.Resampling.LANCZOS)
        if width <= 2048:
            name, entry = save(f"ne2-relief-{width}.webp", projected, {"kind": "fallback", "levelWidth": width})
            outputs[name] = entry
        if width >= 2048:
            array = np.asarray(projected)
            columns, count = math.ceil(width/TILE), math.ceil(height/TILE)
            def tile(at):
                x, y = at
                xs = np.arange(x*TILE-GUTTER, (x+1)*TILE+GUTTER) % width
                ys = np.clip(np.arange(y*TILE-GUTTER, (y+1)*TILE+GUTTER), 0, height-1)
                raster = Image.fromarray(array[np.ix_(ys, xs)])
                return save(f"ne2-{width}-{x}-{y}.webp", raster, {"kind": "tile", "levelWidth": width, "x": x, "y": y})
            with ThreadPoolExecutor(max_workers=2) as pool:
                outputs.update(pool.map(tile, [(x, y) for y in range(count) for x in range(columns)]))
            levels.append({"width": width, "height": height, "columns": columns, "rows": count})
        print(json.dumps({"level": width, "height": height, "outputs": len(outputs)}), flush=True)
    revision = hashlib.sha256(json.dumps(outputs, sort_keys=True).encode()).hexdigest()[:20]
    manifest = {"revision": revision, "source": SOURCE, "tileSize": TILE, "gutter": GUTTER, "levels": levels}
    (destination / "manifest.json").write_text(json.dumps(manifest, indent=2)+"\n")
    audit = {"license": "public-domain", "terms": "https://www.naturalearthdata.com/about/terms-of-use/",
             "use": "visual luminance shading only; no simulation data", **config, "sources": {"relief": source},
             "tileSize": TILE, "gutter": GUTTER, "levels": levels, "assetDirectory": "ne2", "outputs": outputs,
             "ocean": {"implementation": "src/render/oceanSurface.ts", "externalAssets": False, "simulationChanged": False}}
    (ROOT / "data/map-surfaces-audit.json").write_text(json.dumps(audit, indent=2)+"\n")
    print(json.dumps({"files": len(outputs), "bytes": sum(o["bytes"] for o in outputs.values())}), flush=True)


if __name__ == "__main__":
    main()
