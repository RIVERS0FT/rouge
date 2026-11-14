"""Build the reviewed small-fragment overlay from tracked numerical overlap only.

Run from anywhere with Python 3. No GIS dependency or external game assets are
required. Existing base groups are never split; emitted records contain only
Natural Earth source IDs, a prior reference ID, measurements and provenance.
"""
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / 'data'
BASE = DATA / 'natural-earth-admin1-base.json.gz'
PARTITION = DATA / 'gameplay-region-partition.json.gz'
AUDIT = DATA / 'admin1-overlap-audit.json'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def unwrap(path):
    return json.loads(gzip.decompress(path.read_bytes()))


base, partition, audit = unwrap(BASE), unwrap(PARTITION), json.loads(AUDIT.read_bytes())
assert partition['sourceSha256'] == sha(BASE)
assert base['sourceZipSha256'] == audit['sourceZipSha256']
sources = {a['id']: a for a in base['provinces']}
measured = {a['id']: a for a in audit['admin1']}
assert sources.keys() == measured.keys()
groups = {g['id']: g for g in partition['groups']}
by_source = {source: k for k, g in groups.items() for source in g['sourceIds']}
assert len(by_source) == len(sources)
reference = {s['id']: s for s in audit['states']}

# Shared positive-length Natural Earth land borders only. The original map has
# already validated them; no corner touches, water links or newly cut polygons.
land = base['provinces']
edges = {tuple(sorted((by_source[a['id']], by_source[land[i]['id']])))
         for a in land for i in a['neighbors'] if by_source[a['id']] != by_source[land[i]['id']]}
metrics = {}
for key, group in groups.items():
    ids = group['sourceIds']
    area = sum(measured[a]['areaKm2'] for a in ids)
    overlaps = Counter()
    for a in ids:
        for hit in measured[a]['overlaps']:
            overlaps[hit['stateId']] += hit['areaKm2']
    target = group['legacyHint']
    metrics[key] = (
        area, overlaps[target] / area if area else 0,
        max((v for k, v in overlaps.items() if k != target), default=0) / area if area else 0,
        frozenset(sources[a]['country'] for a in ids),
    )

# The reference is approximately georeferenced. A small edge fragment may have
# no majority overlap, but require >=25% overlap with the shared historical
# target and >=20 percentage points over every other target. The adjoining
# primary group must itself have a >=65% overlap. Preserve modern-country labels
# and named user overrides, and cap the total added area, not just each piece.
eligible = {}
for a, b in sorted(edges):
    for main, fragment in ((a, b), (b, a)):
        mg, fg = groups[main], groups[fragment]
        target = mg['legacyHint']
        ma, mh, _, mc = metrics[main]
        fa, fh, runner_up, fc = metrics[fragment]
        if (target is None or fg['legacyHint'] != target or not ma or not fa
                or mc != fc or len(mc) != 1
                or mg['reason'] == 'user-requested-baikonur-into-karaganda'
                or fg['reason'] == 'user-requested-baikonur-into-karaganda'
                or 'KAB+00?' in (*mg['sourceIds'], *fg['sourceIds'])
                or mh < .65 or fh < .25 or fh - runner_up < .20 or fa > ma * .10):
            continue
        eligible.setdefault(fragment, []).append(main)

used, added_overlap = Counter(), Counter()
rows = []
for fragment, candidates in sorted(eligible.items()):
    # Ambiguous assignment is intentionally not auto-selected.
    if len(candidates) != 1:
        continue
    main = candidates[0]
    ma, mh, *_ = metrics[main]
    fa, fh, runner_up, _ = metrics[fragment]
    target = groups[main]['legacyHint']
    target_area = reference[target]['areaKm2']
    new_area = ma + used[main] + fa
    new_overlap = ma * mh + added_overlap[main] + fa * fh
    old_iou = ma * mh / (ma + target_area - ma * mh)
    new_iou = new_overlap / (new_area + target_area - new_overlap)
    if new_area > ma * 1.10 or new_overlap / new_area < .65 or old_iou - new_iou > .02:
        continue
    used[main] += fa
    added_overlap[main] += fa * fh
    rows.append({'primary': main, 'fragment': fragment, 'stateId': target, 'stateCode': reference[target]['code'],
                 'primaryIoUBefore': round(old_iou, 6), 'consolidatedIoUAfter': round(new_iou, 6),
                 'fragmentAreaKm2': round(fa, 3), 'fragmentTargetShare': round(fh, 6),
                 'fragmentRunnerUpShare': round(runner_up, 6), 'primaryTargetShare': round(mh, 6)})
assert not {m['primary'] for m in rows} & {m['fragment'] for m in rows}
result = {
    'schema': 1,
    'reference': 'Victoria 3 1.13.7 State Regions (existing approximate numerical overlap audit)',
    'basePartitionSha256': sha(PARTITION),
    'overlapAuditSha256': sha(AUDIT),
    'merges': rows,
}
path = DATA / 'state-region-consolidation.json'
path.write_text(json.dumps(result, indent=2) + '\n')
print(f'{len(rows)} additional merges from {len(groups)} base regions.')
for row in rows:
    print(row['stateCode'], row['fragment'], '→', row['primary'])
