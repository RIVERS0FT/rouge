"""Reproduce the gameplay partition audit from committed artifacts; stdlib only.
Uses original, unsimplified source-area overlap measurements, NOT runtime polygons.
Run from repository root: python scripts/audit-gameplay-regions.py
"""
import gzip, hashlib, json, statistics
from collections import Counter, defaultdict
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def read(name):
    b = (ROOT / 'data' / name).read_bytes()
    return json.loads(gzip.decompress(b) if name.endswith('.gz') else b)
base = read('natural-earth-admin1-base.json.gz')
audit = read('admin1-overlap-audit.json')
atlas = read('state-regions-1.13.7.json.gz')
atoms = {a['id']: a for a in audit['admin1']}
source = {a['id']: a for a in base['provinces']}
targets = {s['id']: s for s in audit['states']}
assert len(targets) == len(atlas['provinces'])
partition = read('gameplay-region-partition.json.gz')
assert partition['sourceSha256'] == hashlib.sha256((ROOT / 'data' / 'natural-earth-admin1-base.json.gz').read_bytes()).hexdigest(), 'Partition source checksum mismatch'
selected_groups = [{'id': g['id'], 'atomIds': g['sourceIds'], 'legacyHint': g['legacyHint'], 'reason': g['reason']} for g in partition['groups']]
assigned = [a for g in selected_groups for a in g['atomIds']]
assert len(assigned) == len(set(assigned)) == len(source) == len(atoms)
assert set(assigned) == set(source) == set(atoms)
by_target = defaultdict(list)
groups = []
for g in selected_groups:
    aa = [atoms[a] for a in g['atomIds']]
    assert len({source[a]['country'] for a in g['atomIds']}) == 1
    remaining = set(g['atomIds']); queue = [min(remaining)]; remaining.remove(queue[0])
    for atom in queue:
        for n in source[atom]['neighbors']:
            code = base['provinces'][n]['id']
            if code in remaining: remaining.remove(code); queue.append(code)
    assert not remaining, 'Disconnected partition group'
    area = sum(a['areaKm2'] for a in aa)
    hits = defaultdict(float)
    for a in aa:
        for h in a['overlaps']:
            hits[h['stateId']] += h['areaKm2']
    hint = g['legacyHint']
    overlap = hits[hint] if hint is not None else 0
    iou = overlap / (area + targets[hint]['areaKm2'] - overlap) if hint is not None and area else 0
    row = {'id': g['id'], 'targetId': hint, 'atomCount': len(aa), 'inView': area > 0, 'areaKm2': round(area, 5), 'targetIntersectionKm2': round(overlap, 5), 'targetIoUProxy': round(iou, 6), 'reason': g['reason']}
    groups.append(row)
    if hint is not None:
        by_target[hint].append(row)
rows = []
for i, s in targets.items():
    gg = by_target[i]
    largest = max(gg, key=lambda g: g['areaKm2'], default=None)
    best = max(gg, key=lambda g: g['targetIoUProxy'], default=None)
    area = sum(g['areaKm2'] for g in gg)
    overlap = sum(g['targetIntersectionKm2'] for g in gg)
    rows.append({'id': i, 'code': s['code'], 'assignedGroupCount': len(gg), 'assignedAtomCount': sum(g['atomCount'] for g in gg), 'targetAreaKm2': s['areaKm2'], 'assignedAreaKm2': round(area, 5), 'largestGroupId': largest['id'] if largest else None, 'largestGroupShareOfAssignedArea': round(largest['areaKm2'] / area, 6) if area else 0, 'bestSingleAssignedGroupId': best['id'] if best else None, 'bestSingleAssignedGroupIoUProxy': best['targetIoUProxy'] if best else 0, 'assignedTargetRecallProxy': round(overlap / s['areaKm2'], 6) if s['areaKm2'] else 0, 'allAssignedGroupsIoUProxy': round(overlap / (area + s['areaKm2'] - overlap), 8) if area + s['areaKm2'] - overlap else 0})
weights = sum(r['targetAreaKm2'] for r in rows)
summary = {'retainedSourceAtoms': len(source), 'lockedPreprocessedGroups': len(groups), 'groupsWithSourceAreaInView': sum(g['inView'] for g in groups), 'groupsOutsideView': sum(not g['inView'] for g in groups), 'groupCountReductionFraction': round(1 - len(groups) / len(source), 6), 'multiAtomGroups': sum(g['atomCount'] > 1 for g in groups), 'singletonGroups': sum(g['atomCount'] == 1 for g in groups), 'largestGroupAtomCount': max(g['atomCount'] for g in groups), 'reasons': dict(Counter(g['reason'] for g in groups)), 'referenceTargetCount': len(rows), 'targetsWithoutAssignedGroup': sum(r['assignedGroupCount'] == 0 for r in rows), 'targetsWithExactlyOneAssignedGroup': sum(r['assignedGroupCount'] == 1 for r in rows), 'targetsFragmentedIntoMultipleGroups': sum(r['assignedGroupCount'] > 1 for r in rows), 'maxGroupsPerTarget': max(r['assignedGroupCount'] for r in rows), 'medianBestSingleAssignedGroupIoUProxy': round(statistics.median(r['bestSingleAssignedGroupIoUProxy'] for r in rows), 6), 'areaWeightedBestSingleAssignedGroupIoUProxy': round(sum(r['targetAreaKm2'] * r['bestSingleAssignedGroupIoUProxy'] for r in rows) / weights, 6), 'medianAllAssignedGroupsIoUProxy': round(statistics.median(r['allAssignedGroupsIoUProxy'] for r in rows), 6), 'areaWeightedAllAssignedGroupsIoUProxy': round(sum(r['targetAreaKm2'] * r['allAssignedGroupsIoUProxy'] for r in rows) / weights, 6)}
for cutoff in [.5, .75, .9, .95]:
    summary['targetsBestSingleAssignedGroupIoUAtLeast' + str(cutoff)] = sum(r['bestSingleAssignedGroupIoUProxy'] >= cutoff for r in rows)
output = {'schema': 1, 'auditOnly': True, 'measurement': 'Original unsimplified Natural Earth atoms: sum disjoint atom areas/intersections from admin1-overlap-audit.json; EPSG:6933, clipped to [-180,-58.64,180,74]. Source simplification at 0.015 degrees is not remeasured. Reference has approximate Miller georeferencing; no alignment fitted. IoU is a geographic diagnostic, not an official Victoria 3 match certification.', 'inputsSha256': {name: hashlib.sha256((ROOT / 'data' / name).read_bytes()).hexdigest() for name in ['natural-earth-admin1-base.json.gz', 'admin1-overlap-audit.json', 'state-regions-1.13.7.json.gz', 'gameplay-region-partition.json.gz']}, 'summary': summary, 'optimization': partition['summary'], 'remainingFragmentation': partition['remainingFragmentation'], 'targets': rows, 'groups': groups}
# Detailed rows are reproducible from retained source measurements; keep the
# committed report compact and write the full diagnostic to ignored artifacts.
(ROOT / 'artifacts').mkdir(exist_ok=True)
(ROOT / 'artifacts' / 'gameplay-regions-audit-full.json').write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n')
compact = {k: v for k, v in output.items() if k not in ('targets', 'groups')}
(ROOT / 'data' / 'gameplay-regions-audit.json.gz').write_bytes(gzip.compress((json.dumps(compact, ensure_ascii=False, separators=(',', ':')) + '\n').encode(),mtime=0))
print(json.dumps(summary, indent=2))
