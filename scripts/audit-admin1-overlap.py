"""Audit only: never changes map IDs, state geometry, ownership, or save data.
Requires shapely==2.1.2 pyproj==3.7.2 pyshp==3.0.3.
Download official NE zip (14 MB) into --source-dir then run this script.
All intersections use EPSG:6933 equal-area meters, after clipping to map view.
"""
import argparse,json,gzip,hashlib,time
from pathlib import Path
import shapefile,shapely
from shapely.geometry import shape,MultiPolygon,Polygon,box
from shapely.ops import transform
from pyproj import Transformer
p=argparse.ArgumentParser();p.add_argument('--source-dir',type=Path,default=Path('artifacts/admin1'));p.add_argument('--output',type=Path,default=Path('data/admin1-overlap-audit.json'));a=p.parse_args()
assert hashlib.sha256((a.source_dir/'ne_10m_admin_1_states_provinces.zip').read_bytes()).hexdigest()=='efc59726337323058f9446210adc96673179cd344e053666ee3d28cb58ba2b05','Unreviewed NE source revision'
root=Path(__file__).resolve().parents[1];atlas_path=root/'data/state-regions-1.13.7.json.gz';raw=gzip.decompress(atlas_path.read_bytes());atlas=json.loads(raw)
project=Transformer.from_crs('EPSG:4326','EPSG:6933',always_xy=True).transform
clip=box(-180,-58.64,180,74)
invalid={'source':0,'projected':0}
def projected(g):
 if not g.is_valid: invalid['source']+=1
 g=transform(project,shapely.make_valid(g).intersection(clip))
 if not g.is_valid: invalid['projected']+=1
 return shapely.make_valid(g)
old=[projected(MultiPolygon([Polygon(poly[0],poly[1:]) for poly in s['geometry']])) for s in atlas['provinces']]
reader=shapefile.Reader(str(a.source_dir/'ne_10m_admin_1_states_provinces.shp'));features=[];geoms=[]
for sr in reader.iterShapeRecords():
 d=sr.record.as_dict();g=projected(shape(sr.shape.__geo_interface__))
 features.append({'id':d['adm1_code'],'name':d['name'],'nameZh':d['name_zh'],'country':d['adm0_a3']});geoms.append(g)
tree=shapely.STRtree(old);state_hits=[[] for g in old];rows=[]
for i,(f,g) in enumerate(zip(features,geoms)):
 area=g.area;hits=[]
 if area:
  for j in tree.query(g,predicate='intersects'):
   j=int(j);overlap=g.intersection(old[j]).area
   if overlap>1:
    hits.append({'stateId':j,'code':atlas['provinces'][j]['code'],'areaKm2':round(overlap/1e6,5),'fraction':round(overlap/area,8)})
    state_hits[j].append((i,overlap))
 hits.sort(key=lambda h:(-h['areaKm2'],h['stateId']))
 rows.append({**f,'areaKm2':round(area/1e6,5),'coveredFraction':round(sum(h['areaKm2'] for h in hits)/(area/1e6),8) if area else 0,'overlaps':hits,'dominantStateId':hits[0]['stateId'] if hits else None,'materialCrossing':sum(h['fraction']>=.01 for h in hits)>1})
 if i%500==0:print('admin',i,flush=True)
states=[]
for j,(s,g,hits) in enumerate(zip(atlas['provinces'],old,state_hits)):
 assigned=[i for i,r in enumerate(rows) if r['dominantStateId']==j]
 merged=shapely.union_all([geoms[i] for i in assigned]) if assigned else Polygon()
 covered=shapely.union_all([geoms[i].intersection(g) for i,_ in hits]) if hits else Polygon()
 states.append({'id':j,'code':s['code'],'name':s['name'],'areaKm2':round(g.area/1e6,5),'admin1CoveredFraction':round(covered.area/g.area,8) if g.area else 0,'dominantAssignedAdmin1':[features[i]['id'] for i in assigned],'maxOverlapReconstructionIoU':round(g.intersection(merged).area/g.union(merged).area,8) if not g.union(merged).is_empty else 1,'symDifferenceKm2':round(g.symmetric_difference(merged).area/1e6,5),'intersectingAdmin1Count':len(hits)})
summary={'admin1Count':len(rows),'admin1InView':sum(r['areaKm2']>0 for r in rows),'materialCrossingsAt1Percent':sum(r['materialCrossing'] for r in rows),'admin1WithNoOverlap':sum(r['areaKm2']>0 and not r['overlaps'] for r in rows),'statesWithNoDominantAssignedAdmin1':sum(not s['dominantAssignedAdmin1'] for s in states),'statesReconstructionIoUAbove99Percent':sum(s['maxOverlapReconstructionIoU']>=.99 for s in states),'statesReconstructionIoUAbove95Percent':sum(s['maxOverlapReconstructionIoU']>=.95 for s in states),'areaWeightedCoverage':sum(s['areaKm2']*s['admin1CoveredFraction'] for s in states)/sum(s['areaKm2'] for s in states)}
output={'schema':1,'auditOnly':True,'sourceUrl':'https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_1_states_provinces.zip','sourceVersion':(a.source_dir/'ne_10m_admin_1_states_provinces.VERSION.txt').read_text().strip(),'sourceZipSha256':hashlib.sha256((a.source_dir/'ne_10m_admin_1_states_provinces.zip').read_bytes()).hexdigest(),'atlasSha256':hashlib.sha256(raw).hexdigest(),'measurement':'EPSG:6933 equal-area intersections, clipped to -180,-58.64,180,74. Existing reference placement is approximate Miller; no alignment fitted. Dominant assignment is diagnostic only, NEVER an approved map replacement.','validityRepairs':invalid,'summary':summary,'focus':[r for r in rows if r['name'] in ['Hunan','Hubei']],'states':states,'admin1':rows}
a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n');print(json.dumps(summary,indent=2));print(json.dumps(output['focus'],ensure_ascii=False,indent=2))
