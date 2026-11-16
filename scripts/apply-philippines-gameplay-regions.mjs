/** Join the actual source islands into three administration regions while
 * retaining the original geometry and physical navigation graph. */
export function repartitionPhilippines(base, groups, plan) {
  const atoms = new Map(base.provinces.filter(p => p.country === 'PHL').map(p => [p.id,p]));
  const old = new Map();
  for (const group of groups) {
    if (!group.sourceIds.some(id => atoms.has(id))) continue;
    if (!group.sourceIds.every(id => atoms.has(id))) throw new Error('Prior Philippines group crosses a country boundary');
    old.set(group.id,group);
  }
  if (plan.schema !== 1 || !Array.isArray(plan.regions) || plan.regions.length !== 3 || old.size !== 29 || atoms.size !== 118) {
    throw new Error('Expected 3 Philippines state regions from 29 gameplay groups and 118 source areas');
  }
  const counts = {STATE_LUZON:[61,10,6],STATE_VISAYAS:[25,13,12],STATE_MINDANAO:[32,6,5]};
  const claimed = new Set(), assignments = new Set(), codes = new Set();
  const replacements = plan.regions.map(({stateCode,displayName,anchorAtomId,currentGroups,components}) => {
    if (!Object.hasOwn(counts,stateCode) || codes.has(stateCode) || !Array.isArray(displayName) || displayName.length !== 2
        || !displayName.every(name => typeof name === 'string' && name.trim())
        || !Array.isArray(currentGroups) || currentGroups.length !== counts[stateCode][1]
        || !Array.isArray(components) || components.length !== counts[stateCode][2]
        || !components.every(ids => Array.isArray(ids) && ids.length > 0)) {
      throw new Error('Invalid Philippines state region: ' + stateCode);
    }
    codes.add(stateCode);
    const ids = [];
    for (const id of currentGroups) {
      const group = old.get(id);
      if (!group || claimed.has(id)) throw new Error('Duplicate or unknown Philippines input group: ' + id);
      claimed.add(id);
      for (const atom of group.sourceIds) {
        if (assignments.has(atom)) throw new Error('Duplicate Philippines source area: ' + atom);
        assignments.add(atom);
        ids.push(atom);
      }
    }
    const sourceIds = ids.sort(), pending = new Set(sourceIds), measured = [];
    if (sourceIds.length !== counts[stateCode][0] || !pending.has(anchorAtomId)) {
      throw new Error('Invalid Philippines membership or anchor: ' + stateCode);
    }
    while (pending.size) {
      const lead = pending.values().next().value, connected = [lead];
      pending.delete(lead);
      for (const id of connected) {
        for (const i of atoms.get(id).neighbors) {
          const next = base.provinces[i]?.id;
          if (pending.delete(next)) connected.push(next);
        }
      }
      measured.push(connected.sort());
    }
    const signatures = parts => parts.map(part => JSON.stringify([...part].sort())).sort();
    if (JSON.stringify(signatures(measured)) !== JSON.stringify(signatures(components))) {
      throw new Error('Unreviewed physical Philippines components: ' + stateCode);
    }
    // These are grouping-only links expected by PREPROCESSED_TOPOLOGY.
    // Do not write them to source neighbors or the land/sea navigation mesh.
    const islandAttachments = measured.filter(part => !part.includes(anchorAtomId)).map(part => [part[0],anchorAtomId]);
    return {id:'group:'+sourceIds[0],sourceIds,legacyHint:null,reason:'philippines-victoria-state-region',displayName,anchorAtomId,islandAttachments};
  });
  if (claimed.size !== old.size || assignments.size !== atoms.size) throw new Error('Missing Philippines groups or source areas');
  return [...groups.filter(g => !old.has(g.id)),...replacements].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
