"""Deterministic non-destructive partition optimization. Run from repository root.
No geometry changes: merge touching same-country/same-hint groups when IoU improves;
fill missing targets only with material whole-atom/group transfers and positive net IoU.
"""
import gzip, hashlib, json
from collections import defaultdict, Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; DATA=ROOT/'data'
base=json.loads(gzip.decompress((DATA/'natural-earth-admin1-base.json.gz').read_bytes()))
audit=json.loads((DATA/'admin1-overlap-audit.json').read_bytes())
atoms={a['id']:a for a in base['provinces']}; measured={a['id']:a for a in audit['admin1']}; states={s['id']:s for s in audit['states']}
assert base['sourceZipSha256'] == audit['sourceZipSha256'], 'Source provenance mismatch'
assert hashlib.sha256(gzip.decompress((DATA/'state-regions-1.13.7.json.gz').read_bytes())).hexdigest() == audit['atlasSha256'], 'Reference checksum mismatch'
assert set(atoms) == set(measured), 'Source atom mismatch'
area={a:r['areaKm2'] for a,r in measured.items()}; hits={a:{h['stateId']:h['areaKm2'] for h in r['overlaps']} for a,r in measured.items()}
neighbors={a['id']:{base['provinces'][i]['id'] for i in a['neighbors']} for a in atoms.values()}
def iou(ids,t):
 if t is None:return 0.
 ar=sum(area[a] for a in ids); h=sum(hits[a].get(t,0) for a in ids)
 return h/(ar+states[t]['areaKm2']-h) if ar+states[t]['areaKm2']-h else 0.
def connected(ids):
 if not ids:return False
 seen={min(ids)};queue=list(seen)
 for a in queue:
  for n in sorted(neighbors[a]&ids-seen):seen.add(n);queue.append(n)
 return seen==ids
G={g['id']:{'ids':set(g['atomIds']),'target':g['legacyHint'],'reason':g['reason']} for g in base['initialGroups']}
original={k:{**v,'ids':set(v['ids'])} for k,v in G.items()}; operations=[]
def best(t,exclude=None,replacement=None):
 vals=[iou(g['ids'],t) for k,g in G.items() if g['target']==t and k!=exclude]
 if replacement:vals.append(iou(replacement,t))
 return max(vals,default=0.)
def merge():
 count=0
 while True:
  owner={a:k for k,g in G.items() for a in g['ids']};pairs=set()
  for a,ns in neighbors.items():
   for n in ns:
    x,y=sorted([owner[a],owner[n]])
    if x!=y:pairs.add((x,y))
  options=[]
  for x,y in sorted(pairs):
   g,h=G[x],G[y];t=g['target']
   if t is None or t!=h['target']:continue
   ids=g['ids']|h['ids']
   if len({atoms[a]['country'] for a in ids})!=1:continue
   old=max(iou(g['ids'],t),iou(h['ids'],t));new=iou(ids,t)
   if new>old+1e-9:options.append((-(new-old),x,y,new))
  if not options:break
  neg,x,y,new=min(options);G[x]['ids']|=G[y]['ids'];G[x]['reason']='adjacent-same-country-iou-improvement';del G[y]
  operations.append({'type':'merge','kept':x,'removed':y,'target':G[x]['target'],'localIoUGain':round(-neg,8)});count+=1
 return count
merges=merge();transfers=0
while True:
 missing=[t for t in states if not any(g['target']==t for g in G.values())];options=[]
 for t in missing:
  for k,g in sorted(G.items()):
   donor=g['target']
   if donor is None or donor==t:continue
   choices={tuple(sorted(g['ids']))}|{(a,) for a in g['ids'] if hits[a].get(t,0)>0}
   donor_before=best(donor)
   for choice in sorted(choices):
    moved=set(choice);remain=g['ids']-moved
    if remain and not connected(remain):continue
    if not remain and not any(h['target']==donor for j,h in G.items() if j!=k):continue
    ar=sum(area[a] for a in moved);overlap=sum(hits[a].get(t,0) for a in moved)
    if not ar or overlap/ar<.25:continue
    score=iou(moved,t)
    if score<.1:continue
    donor_after=best(donor,exclude=k,replacement=remain)
    gain=score+donor_after-donor_before
    if gain>1e-9:options.append((-gain,t,k,choice,score,donor_before,donor_after))
 if not options:break
 neg,t,k,choice,score,before,after=min(options);g=G[k];donor=g['target'];moved=set(choice);remain=g['ids']-moved
 if remain:g['ids']=remain;g['reason']='connected-remainder-after-target-recovery'
 else:del G[k]
 key='group:'+min(moved)
 # A group's canonical ID can change after removal of its smallest atom.
 if key in G:
  held=G.pop(key);G['group:'+min(held['ids'])]=held
 G[key]={'ids':moved,'target':t,'reason':'material-overlap-missing-target-recovery'}
 operations.append({'type':'transfer','sourceIds':sorted(moved),'fromTarget':donor,'toTarget':t,'targetIoU':round(score,8),'donorBestIoUBefore':round(before,8),'donorBestIoUAfter':round(after,8),'netIoUGain':round(-neg,8)});transfers+=1
merges+=merge()
# Normalize canonical IDs and validate full partition and physical connectivity.
rows=[{'id':'group:'+min(g['ids']),'sourceIds':sorted(g['ids']),'legacyHint':g['target'],'reason':g['reason']} for g in G.values()];rows.sort(key=lambda g:g['id'])
all_ids=[a for g in rows for a in g['sourceIds']]
assert len(all_ids)==len(set(all_ids))==len(atoms) and set(all_ids)==set(atoms)
assert len({g['id'] for g in rows})==len(rows)
assert all(connected(set(g['sourceIds'])) and len({atoms[a]['country'] for a in g['sourceIds']})==1 for g in rows)
def metrics(groups):
 by=defaultdict(list)
 for g in groups.values():
  if g['target'] is not None:by[g['target']].append(g)
 scores=[max((iou(g['ids'],t) for g in by[t]),default=0) for t in states]
 import statistics
 return {'groups':len(groups),'inViewGroups':sum(any(area[a]>0 for a in g['ids']) for g in groups.values()),'missingTargets':sum(not by[t] for t in states),'fragmentedTargets':sum(len(by[t])>1 for t in states),'singleGroupTargets':sum(len(by[t])==1 for t in states),'medianBestSingleGroupIoUProxy':round(statistics.median(scores),6),'areaWeightedBestSingleGroupIoUProxy':round(sum(s*states[t]['areaKm2'] for t,s in zip(states,scores))/sum(s['areaKm2'] for s in states.values()),6),'targetsBestSingleIoUAtLeast75Percent':sum(s>=.75 for s in scores),'targetsBestSingleIoUAtLeast90Percent':sum(s>=.9 for s in scores)}
# Diagnose which constraints prevent consolidating remaining target fragments.
remaining=[]
for t in states:
 gg=[g for g in rows if g['legacyHint']==t]
 if len(gg)<=1:continue
 countries={atoms[a]['country'] for g in gg for a in g['sourceIds']}
 samecountry_components=0
 for c in countries:
  todo={a for g in gg for a in g['sourceIds'] if atoms[a]['country']==c}
  while todo:
   queue=[min(todo)];todo.remove(queue[0]);samecountry_components+=1
   for a in queue:
    for n in sorted(neighbors[a]&todo):todo.remove(n);queue.append(n)
 remaining.append({'targetId':t,'code':states[t]['code'],'groups':len(gg),'countries':sorted(countries),'sameCountryConnectedComponents':samecountry_components,'excessGroupsBeyondComponents':len(gg)-samecountry_components})
summary={'before':metrics(original),'after':metrics(G),'acceptedMerges':merges,'acceptedMissingTargetTransfers':transfers,'remainingMissingTargets':[{'id':t,'code':states[t]['code']} for t in states if not any(g['target']==t for g in G.values())]}
for missing in summary['remainingMissingTargets']:
 t=missing['id'];candidates=[]
 for a in atoms:
  overlap=hits[a].get(t,0)
  if not overlap:continue
  g=next(g for g in G.values() if a in g['ids']);donor=g['target'];remain=g['ids']-{a}
  candidates.append({'sourceId':a,'sourceOverlapFraction':round(overlap/area[a],6) if area[a] else 0,'targetIoU':round(iou({a},t),6),'donorTarget':donor,'donorWouldLoseLastGroup':not remain and not any(h is not g and h['target']==donor for h in G.values()),'donorRemainderConnected':connected(remain) if remain else None})
 missing['strongestWholeAtomCandidates']=sorted(candidates,key=lambda c:(-c['targetIoU'],c['sourceId']))[:3]
result={'schema':1,'method':'Whole-source-atom partition only; deterministic greedy positive local IoU merges and net-positive missing-target transfers. Not a global optimum. Original unsimplified area proxies; crop connectivity revalidated at runtime.','sourceSha256':hashlib.sha256((DATA/'natural-earth-admin1-base.json.gz').read_bytes()).hexdigest(),'transferMinimumSourceOverlapFraction':.25,'transferMinimumTargetIoU':.1,'summary':summary,'groups':rows,'operations':operations,'remainingFragmentation':remaining}
(DATA/'gameplay-region-partition.json.gz').write_bytes(gzip.compress((json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n').encode(),mtime=0));print(json.dumps(summary,indent=2))
