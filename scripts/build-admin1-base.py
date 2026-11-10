"""Generate a NEW MAP candidate from whole Natural Earth Admin1 features.
Not a save migration, not a replacement of legacy world.json. See audit documentation.
"""
import argparse,gzip,json,hashlib,time
from pathlib import Path
import shapefile,shapely
from shapely.geometry import shape,MultiPolygon,mapping,Polygon
p=argparse.ArgumentParser();p.add_argument('--source-dir',type=Path,default=Path('artifacts/admin1'));p.add_argument('--output-dir',type=Path,default=Path('data'));p.add_argument('--tolerance',type=float,default=.015);a=p.parse_args();started=time.monotonic()
ziphash=hashlib.sha256((a.source_dir/'ne_10m_admin_1_states_provinces.zip').read_bytes()).hexdigest();assert ziphash=='efc59726337323058f9446210adc96673179cd344e053666ee3d28cb58ba2b05'
reader=shapefile.Reader(str(a.source_dir/'ne_10m_admin_1_states_provinces.shp'));records=[]
for sr in reader.iterShapeRecords():
 d=sr.record.as_dict();g=shapely.make_valid(shape(sr.shape.__geo_interface__))
 if g.geom_type=='GeometryCollection':g=MultiPolygon([part for part in g.geoms if part.geom_type=='Polygon'])
 records.append((d,g))
records.sort(key=lambda x:x[0]['adm1_code']);assert len({d['adm1_code'] for d,g in records})==len(records)
original=[g for d,g in records];assert shapely.coverage_is_valid(original),'Source is not valid shared coverage'
simplified=shapely.coverage_simplify(original,tolerance=a.tolerance,simplify_boundary=True)
assert shapely.coverage_is_valid(simplified),'Simplification broke shared boundaries'
# Do not round: even common-grid rounding invalidates this coastline coverage.
# Shared-edge simplification itself is verified valid; preserve its float coordinates.
assert all(g.is_valid and not g.is_empty for g in simplified)
print('simplified',sum(shapely.get_num_coordinates(g) for g in simplified),flush=True)
audit=json.loads((a.output_dir/'admin1-overlap-audit.json').read_text());hints={r['id']:r for r in audit['admin1']}
tree=shapely.STRtree(simplified);neighbors=[[] for _ in records]
for i,g in enumerate(simplified):
 for j in tree.query(g,predicate='intersects'):
  j=int(j)
  if j<=i:continue
  if g.boundary.intersection(simplified[j].boundary).length>1e-8:neighbors[i].append(j);neighbors[j].append(i)
provinces=[]
for i,((d,orig),g) in enumerate(zip(records,simplified)):
 if g.geom_type=='Polygon':g=MultiPolygon([g])
 anchor=max(g.geoms,key=lambda p:p.area).representative_point();r=hints[d['adm1_code']]
 provinces.append({'id':d['adm1_code'],'name':[d['name_zh'] or d['name'],d['name']],'country':d['adm0_a3'],'center':[anchor.x,anchor.y],'neighbors':sorted(neighbors[i]),'geometry':mapping(g)['coordinates'],'legacyGroupHint':r['dominantStateId'],'legacyOverlapFraction':r['overlaps'][0]['fraction'] if r['overlaps'] else 0,'legacyOverlapMargin':(r['overlaps'][0]['fraction']-(r['overlaps'][1]['fraction'] if len(r['overlaps'])>1 else 0)) if r['overlaps'] else 0,'legacyMatchStatus':'outside-view' if not r['areaKm2'] else 'unmatched' if not r['overlaps'] else 'crossing' if r['materialCrossing'] else 'matched'})
# Mapping audit flags source groups spanning multiple modern source country labels; no auto reassignment.
groups=[]
for state in audit['states']:
 members=[p for p in provinces if p['legacyGroupHint']==state['id']];countries=sorted({p['country'] for p in members})
 groups.append({'legacyId':state['id'],'legacyCode':state['code'],'members':[p['id'] for p in members],'countries':countries,'flags':(['empty'] if not members else [])+(['cross-country'] if len(countries)>1 else [])})
# Conservative playable groups: no weak match, country jump or disconnected forced union.
seen=set();initial_groups=[]
for i,p in enumerate(provinces):
 if i in seen:continue
 eligible=p['legacyGroupHint'] is not None and p['legacyOverlapFraction']>=.5 and p['legacyOverlapMargin']>=.1
 component=[];queue=[i];seen.add(i)
 while queue:
  j=queue.pop();component.append(j)
  if not eligible:continue
  for k in neighbors[j]:
   q=provinces[k]
   if k not in seen and q['legacyGroupHint']==p['legacyGroupHint'] and q['country']==p['country'] and q['legacyOverlapFraction']>=.5 and q['legacyOverlapMargin']>=.1:
    seen.add(k);queue.append(k)
 ids=sorted(provinces[j]['id'] for j in component)
 initial_groups.append({'id':'group:'+ids[0],'atomIds':ids,'legacyHint':p['legacyGroupHint'],'reason':'confident-connected-same-country' if eligible else 'unmatched-singleton' if p['legacyGroupHint'] is None else 'low-confidence-singleton'})
initial_groups.sort(key=lambda g:g['id'])
result={'format':1,'mapId':'earth-natural-earth-admin1-511-v1','source':'Natural Earth 1:10m Admin 1 v5.1.1','sourceUrl':audit['sourceUrl'],'sourceZipSha256':ziphash,'coordinateSystem':'OGC:CRS84','legacyCompatibility':'New map; NOT compatible with legacy pixel-map saves or positions. Group hints are provisional, not migration.','simplification':{'method':'Shapely coverage_simplify shared-edge Visvalingam, unrounded coordinates','toleranceDegrees':a.tolerance},'provinces':provinces,'initialGroups':initial_groups}
raw=json.dumps(result,ensure_ascii=False,separators=(',',':')).encode();gz=gzip.compress(raw,mtime=0)
summary={'initialPlayableGroups':len(initial_groups),'lowConfidenceSingletons':sum(g['reason']=='low-confidence-singleton' for g in initial_groups),'unmatchedSingletons':sum(g['reason']=='unmatched-singleton' for g in initial_groups),'sourceFeatures':len(original),'baseUnits':len(provinces),'originalVertices':sum(int(shapely.get_num_coordinates(g)) for g in original),'simplifiedVertices':sum(int(shapely.get_num_coordinates(g)) for g in simplified),'originalPolygonParts':sum(len(g.geoms) if g.geom_type=='MultiPolygon' else 1 for g in original),'simplifiedPolygonParts':sum(len(g.geoms) if g.geom_type=='MultiPolygon' else 1 for g in simplified),'coverageValid':True,'rawBytes':len(raw),'gzipBytes':len(gz),'outputSha256':hashlib.sha256(raw).hexdigest(),'emptyLegacyGroups':sum(not g['members'] for g in groups),'crossCountryLegacyGroups':sum('cross-country' in g['flags'] for g in groups),'unassignedInView':[p['id'] for p in provinces if p['legacyMatchStatus']=='unmatched'],'outsideView':[p['id'] for p in provinces if p['legacyMatchStatus']=='outside-view'],'isolatedAdmin1':sum(not p['neighbors'] for p in provinces),'generationSeconds':round(time.monotonic()-started,3)}
(a.output_dir/'natural-earth-admin1-base.json.gz').write_bytes(gz);(a.output_dir/'natural-earth-admin1-base-audit.json').write_text(json.dumps({'summary':summary,'groups':groups},ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in summary.items() if k not in ('unassignedInView',)},indent=2))
