"""Independent terrain navmesh: dissolve all administrative borders first.
Requires Shapely >=2.1, produces land/water triangles with certified shared edges.
"""
import gzip,json,math,hashlib,time,base64,struct
from pathlib import Path
import shapely
from shapely.geometry import Polygon,MultiPolygon,box
root=Path(__file__).resolve().parents[1]
source=root/'data/natural-earth-admin1-base.json.gz'
x=json.load(gzip.open(source));t=time.time()
def project(p):
 lon,lat=p;return (lon*10,-math.asinh(math.tan(.8*lat*math.pi/180))/(.8*math.pi/180)*10)
top=project([0,74])[1];bounds=box(-1800,top,1800,top+3600/(16384/7232))
parts=[]
for province in x['provinces']:
 for rings in province['geometry']:
  p=Polygon([project(v) for v in rings[0]],[[project(v) for v in r] for r in rings[1:]])
  if not p.is_valid:p=shapely.make_valid(p)
  parts.append(p)
print('union',len(parts),flush=True)
land=shapely.union_all(parts).intersection(bounds)
print('coords',shapely.count_coordinates(land),flush=True)
land=land.simplify(1e-6,preserve_topology=True)
print('clean coords',shapely.count_coordinates(land),flush=True)
water=bounds.difference(land)
print('dissolved',time.time()-t,flush=True)
triangles=[];surfaces=[]
for geom,surface in [(land,1),(water,2)]:
 for part in shapely.get_parts(geom):
  if part.geom_type!='Polygon':continue
  for tri in shapely.get_parts(shapely.constrained_delaunay_triangles(part)):
   coords=list(tri.exterior.coords)[:3]
   if tri.area<1e-9:continue
   triangles.append([[float(a),float(b)] for a,b in coords]);surfaces.append(surface)
print('triangles',len(triangles),time.time()-t,flush=True)
# Shared physical coast edges also connect land↔water. No province IDs survive.
edgeIndex={};edges=[[] for _ in triangles]
def key(p):return (round(p[0],7),round(p[1],7))
for i,tri in enumerate(triangles):
 for j,a in enumerate(tri):
  b=tri[(j+1)%3];ka,kb=key(a),key(b);k=tuple(sorted([ka,kb]))
  if k in edgeIndex:
   other,oa,ob=edgeIndex[k];edges[i].append([other,*a,*b]);edges[other].append([i,*oa,*ob])
  else:edgeIndex[k]=(i,a,b)
vertices=[];vertexIndex={};indices=[]
for tri in triangles:
 row=[]
 for point in tri:
  k=key(point)
  if k not in vertexIndex:vertexIndex[k]=len(vertices);vertices.append(point)
  row.append(vertexIndex[k])
 indices.append(row)
def packed(fmt,values):
 return base64.b64encode(struct.pack('<'+fmt*len(values),*values)).decode()
result={'format':3,'revision':hashlib.sha256(source.read_bytes()).hexdigest(),'mapId':x['mapId'],'bounds':[-1800,top,1800,top+3600/(16384/7232)],'vertices':packed('d',[v for p in vertices for v in p]),'triangles':packed('I',[v for p in indices for v in p]),'surface':packed('B',surfaces),'neighbors':packed('i',[v for row in edges for v in ([e[0] for e in row]+[-1]*(3-len(row)))])}
out=root/'data/terrain-navigation.json.gz'
with gzip.GzipFile(filename=str(out),mode='wb',mtime=0) as f:f.write(json.dumps(result,separators=(',',':')).encode())
(root/'src/generated/terrain-navigation.json').write_text(json.dumps(result,separators=(',',':')))
print('saved',out.stat().st_size,time.time()-t,flush=True)
