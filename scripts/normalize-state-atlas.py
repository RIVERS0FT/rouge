"""Node shared raster edges before topology-preserving simplification.
Usage: python scripts/normalize-state-atlas.py --input artifacts/state-reference --output data
Input: prepare-state-reference.py output. Excludes source IDs >=3000 (sea regions).
No state history or country ownership is imported. Requires Shapely 2.1.2.
"""
from pathlib import Path
import json, math, bisect, hashlib, gzip, time, argparse
import shapely
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import polylabel
start= time.monotonic()
parser=argparse.ArgumentParser();parser.add_argument('--input',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args();root=args.input;out=args.output;out.mkdir(parents=True,exist_ok=True)
d=json.loads((root/'world.json').read_text())
rad=math.pi/180; top=-math.asinh(math.tan(.8*74*rad))/(.8*rad)*10; scale=3600/8192
selected=[(i,p) for i,p in enumerate(d['provinces']) if p['sourceId']<3000]
ids={old:new for new,(old,_) in enumerate(selected)}
def inverse(p):
 x=(p[0]+180)/360*8192;z=-math.asinh(math.tan(p[1]*rad*.8))/(.8*rad)*10
 return (round(x), round((z-top)/scale))
def forward(p):
 x,y=p;z=top+y*scale
 return [round(x/8192*360-180,7),round(math.atan(math.sinh(-z*rad*.8/10))/(.8*rad),7)]
rings=[[[[inverse(v) for v in ring] for ring in poly] for poly in p['geometry']] for _,p in selected]
rows={};cols={}
for region in rings:
 for poly in region:
  for ring in poly:
   for x,y in ring:
    rows.setdefault(y,set()).add(x);cols.setdefault(x,set()).add(y)
rows={k:sorted(v) for k,v in rows.items()};cols={k:sorted(v) for k,v in cols.items()}
def noded(ring):
 out=[]
 for a,b in zip(ring,ring[1:]):
  out.append(a)
  if a[1]==b[1]:
   lo,hi=sorted((a[0],b[0])); arr=rows[a[1]];vals=arr[bisect.bisect_right(arr,lo):bisect.bisect_left(arr,hi)]
   if a[0]>b[0]: vals=vals[::-1]
   out.extend((x,a[1]) for x in vals)
  elif a[0]==b[0]:
   lo,hi=sorted((a[1],b[1])); arr=cols[a[0]];vals=arr[bisect.bisect_right(arr,lo):bisect.bisect_left(arr,hi)]
   if a[1]>b[1]: vals=vals[::-1]
   out.extend((a[0],y) for y in vals)
  else: raise ValueError('Not a raster edge')
 return out+[out[0]]
g=[MultiPolygon([Polygon(noded(p[0]),[noded(r) for r in p[1:]]) for p in region]) for region in rings]
valid=shapely.coverage_is_valid(g)
print('noded cover valid',valid,'t',time.monotonic()-start,flush=True)
assert valid
simplified=shapely.coverage_simplify(g,tolerance=.65,simplify_boundary=True)
assert shapely.coverage_is_valid(simplified)
new=[]
for i,((old,p),geom) in enumerate(zip(selected,simplified)):
 parts=sorted([geom] if geom.geom_type=='Polygon' else list(geom.geoms),key=lambda p:p.area,reverse=True)
 geometry=[[list(map(forward,poly.exterior.coords))]+[list(map(forward,h.coords)) for h in poly.interiors] for poly in parts]
 anchor=polylabel(parts[0],tolerance=.5)
 p=dict(p,geometry=geometry,center=forward((anchor.x,anchor.y)),neighbors=[ids[n] for n in p['neighbors'] if n in ids]);new.append(p)
d['provinces']=new;d['landRegionsOnly']=True
for p in new:
 if p['code']=='STATE_MAZOVIA':p['name']=['马佐夫舍','Mazovia']
raw=json.dumps(d,ensure_ascii=False,separators=(',',':')).encode()
(out/'state-regions-1.13.7.json.gz').write_bytes(gzip.compress(raw,mtime=0))
audit=json.loads((root/'audit.json').read_text());audit.update(regions=len(new),excludedSeaRegions=106,vertices=sum(len(r) for p in new for poly in p['geometry'] for r in poly),coverageValid=True,outputSha256=hashlib.sha256(raw).hexdigest(),simplificationTolerancePixels=.65,untranslated=sum(p['name'][0]==p['name'][1] for p in new))
(out/'state-regions-audit.json').write_text(json.dumps(audit,indent=2))
print(audit['regions'],audit['vertices'],len(raw),time.monotonic()-start)
