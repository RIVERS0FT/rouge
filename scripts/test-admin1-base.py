"""Offline consistency/partition tests, standard library only; GIS checks run in generator."""
import gzip,json,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
raw=gzip.decompress((root/'data/natural-earth-admin1-base.json.gz').read_bytes());data=json.loads(raw);audit=json.loads((root/'data/natural-earth-admin1-base-audit.json').read_text());overlap=json.loads((root/'data/admin1-overlap-audit.json').read_text())
assert hashlib.sha256(raw).hexdigest()==audit['summary']['outputSha256'];assert data['mapId']=='earth-natural-earth-admin1-511-v1'
units=data['provinces'];by_id={p['id']:p for p in units};assert len(units)==len(by_id)==4596
assert by_id['CHN-1807']['name'][1]=='Hubei' and by_id['CHN-1808']['name'][1]=='Hunan'
assert len(data['initialGroups'])==1327
seen=set()
for i,p in enumerate(units):
 assert p['geometry']
 for poly in p['geometry']:
  for ring in poly:assert len(ring)>=4 and ring[0]==ring[-1]
 assert len(p['neighbors'])==len(set(p['neighbors']))
 for j in p['neighbors']:assert j!=i and i in units[j]['neighbors']
for g in data['initialGroups']:
 ids=g['atomIds'];assert ids and g['id']=='group:'+min(ids)
 assert not seen.intersection(ids);seen.update(ids)
 assert len({by_id[i]['country'] for i in ids})==1
 if len(ids)>1:
  assert g['reason']=='confident-connected-same-country'
  for i in ids:
   p=by_id[i];assert p['legacyGroupHint']==g['legacyHint'] and p['legacyOverlapFraction']>=.5 and p['legacyOverlapMargin']>=.1
  reached={ids[0]};queue=[ids[0]];allowed=set(ids)
  while queue:
   for j in by_id[queue.pop()]['neighbors']:
    key=units[j]['id']
    if key in allowed and key not in reached:reached.add(key);queue.append(key)
  assert reached==allowed
assert seen==set(by_id)
assert audit['summary']['emptyLegacyGroups']==16
assert overlap['summary']['materialCrossingsAt1Percent']==1872
print('PASS: 4596 whole units, stable IDs, 1327 disjoint complete groups, country isolation, conservative confidence, land connectivity, reciprocal adjacency and closed rings')
