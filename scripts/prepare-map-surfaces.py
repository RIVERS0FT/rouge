#!/usr/bin/env python3
"""Offline, reproducible visual assets. Requires Pillow and NumPy, not at runtime.
Download the two official archives recorded below, then pass their local paths.
No navigation, elevation, collision, coastline, or simulation data is generated.
"""
import argparse, hashlib, io, json, math, subprocess, zipfile
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "relief": {"name": "Natural Earth 1:50m Shaded Relief", "version": "3.2.0",
        "page": "https://www.naturalearthdata.com/downloads/50m-raster-data/50m-shaded-relief/",
        "url": "https://naturalearth.s3.amazonaws.com/50m_raster/SR_50M.zip"},
    "ocean": {"name": "Natural Earth 1:50m Ocean Bottom", "version": "3.2.0",
        "page": "https://www.naturalearthdata.com/downloads/50m-raster-data/50m-ocean-bottom/",
        "url": "https://naturalearth.s3.amazonaws.com/50m_raster/OB_50M.zip"},
}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def source(path, info):
    data = path.read_bytes()
    info["archiveSha256"] = digest(data)
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        tif = next(name for name in archive.namelist() if name.lower().endswith(".tif"))
        tfw = next(name for name in archive.namelist() if name.lower().endswith(".tfw"))
        affine = [float(v) for v in archive.read(tfw).decode().split()]
        expected = [1/30, 0, 0, -1/30, -180+1/60, 90-1/60]
        assert all(abs(a-b) < 1e-9 for a,b in zip(affine, expected)) and len(affine) == 6
        pixels = archive.read(tif)
        info.update(tifSha256=digest(pixels), worldFile=affine, size=[10800,5400])
        image = Image.open(io.BytesIO(pixels))
        assert image.size == (10800,5400)
        return image.copy()

def project(image, width, bounds):
    """Area-filter longitude, then inverse-Miller resample each output pixel center.
    The source TFW describes pixel centers, not image edges. Keeping the half-pixel
    convention prevents shifts at the coast, crop edges and date line.
    """
    height = round(width * (bounds["bottom"]-bounds["top"])/(bounds["right"]-bounds["left"]))
    rows = np.asarray(image.resize((width,5400),Image.Resampling.LANCZOS),dtype=np.float32)
    z = bounds["top"]+(np.arange(height)+.5)*(bounds["bottom"]-bounds["top"])/height
    latitude = np.arctan(np.sinh(-z * math.pi/180*.8/10)) / (.8*math.pi/180)
    y = (90-latitude)*30-.5
    low = np.floor(y).astype(int)
    ratio = (y-low)[:,None]
    if rows.ndim == 3:
        ratio=ratio[:,:,None]
    result = rows[low]*(1-ratio)+rows[np.minimum(low+1,5399)]*ratio
    return Image.fromarray(np.uint8(np.clip(np.rint(result),0,255)))

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--relief",type=Path,required=True)
    parser.add_argument("--ocean",type=Path,required=True)
    args=parser.parse_args()
    config=json.loads(subprocess.check_output(["node","--experimental-strip-types","--input-type=module","-e",
        "import {WORLD_BOUNDS,CROP_ID,PROJECTION_ID} from './src/game/geo.ts'; console.log(JSON.stringify({bounds:WORLD_BOUNDS,crop:CROP_ID,projection:PROJECTION_ID}));"],cwd=ROOT))
    outputs={}
    destination=ROOT/"src/assets/map"
    destination.mkdir(parents=True,exist_ok=True)
    for kind in ["relief","ocean"]:
        image=source(getattr(args,kind),SOURCES[kind])
        if kind == "ocean":
            # The original green channel describes the illustrated depth/relief.
            # It is a visual tone, NOT a bathymetric measurement or movement cost.
            image=image.getchannel("G").point(lambda v: round(max(0,min(1,(v-145)/45))*255))
        for width in ([4096,2048] if kind == "relief" else [2048,1024]):
            projected=project(image,width,config["bounds"])
            filename=f"natural-earth-{kind}-{width}.webp"
            path=destination/filename
            projected.save(path,"WEBP",quality=90,method=6)
            outputs[filename]={"width":projected.width,"height":projected.height,"bytes":path.stat().st_size,"sha256":digest(path.read_bytes())}
    audit={"license":"public-domain","terms":"https://www.naturalearthdata.com/about/terms-of-use/",
        "use":"visual shading only; no simulation data",**config,"sources":SOURCES,"outputs":outputs}
    (ROOT/"data/map-surfaces-audit.json").write_text(json.dumps(audit,indent=2)+"\n")
    print(json.dumps(outputs,indent=2))

if __name__ == "__main__":
    main()
