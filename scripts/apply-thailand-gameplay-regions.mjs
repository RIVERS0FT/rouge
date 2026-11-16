/** Review complete prior groups and original land contacts before producing
 * the four Thai management regions. Island links are grouping-only. */
export function repartitionThailand(base, groups, plan) {
  const atoms = new Map(base.provinces.filter(p => p.country === 'THA').map(p => [p.id,p]));
  const old = new Map();
  for (const group of groups) {
    if (!group.sourceIds.some(id => atoms.has(id))) continue;
    if (!group.sourceIds.every(id => atoms.has(id))) throw new Error('Prior Thai group crosses a country boundary');
    old.set(group.id,group);
  }
  if (plan.schema !== 1 || !Array.isArray(plan.regions) || plan.regions.length !== 4 || old.size !== 6 || atoms.size !== 77) {
    throw new Error('Expected four Thai gameplay regions from six prior groups and 77 Thai source areas');
  }
  const counts = {'group:THA-374':12,'group:THA-375':15,'group:THA-399':22,'group:THA-409':28};
  const consumed = new Set(), assigned = new Set();
  const out = plan.regions.map(({primary,members,displayName,anchorAtomId,islandAttachments}) => {
    const previous = old.get(primary);
    if (!previous || !Object.hasOwn(counts,primary) || !members?.[primary] ||
        !Array.isArray(displayName) || displayName.length !== 2 || !displayName.every(x => typeof x === 'string' && x.trim())) {
      throw new Error('Invalid Thai gameplay region: ' + primary);
    }
    const sourceIds = [];
    for (const [id, expected] of Object.entries(members)) {
      const oldGroup = old.get(id);
      if (!oldGroup || consumed.has(id) || !Array.isArray(expected) || expected.length !== oldGroup.sourceIds.length ||
          !expected.every((atom,i) => atom === oldGroup.sourceIds[i])) {
        throw new Error('Duplicate or changed Thai gameplay membership: ' + id);
      }
      consumed.add(id);
      for (const atom of oldGroup.sourceIds) {
        if (assigned.has(atom)) throw new Error('Duplicate Thai source area: ' + atom);
        assigned.add(atom);
        sourceIds.push(atom);
      }
    }
    sourceIds.sort();
    const available = new Set(sourceIds), reached = new Set([anchorAtomId]);
    if (sourceIds.length !== counts[primary] || primary !== 'group:'+sourceIds[0] || !available.has(anchorAtomId)) {
      throw new Error('Unexpected Thai group membership or land anchor: ' + primary);
    }
    for (const id of reached) for (const i of atoms.get(id).neighbors) {
      const neighbor = base.provinces[i]?.id;
      if (available.has(neighbor)) reached.add(neighbor);
    }
    const missing = sourceIds.filter(id => !reached.has(id));
    if (primary === 'group:THA-375') {
      if (missing.length !== 1 || missing[0] !== 'THA-377' || atoms.get('THA-377').neighbors.length ||
          JSON.stringify(islandAttachments) !== JSON.stringify([['THA-377','THA-378']])) {
        throw new Error('Unexpected Phuket land or grouping-only connectivity');
      }
    } else if (missing.length || !Array.isArray(islandAttachments) || islandAttachments.length) {
      throw new Error('Disconnected non-island Thai gameplay region: ' + primary);
    }
    return {...previous,sourceIds,displayName,anchorAtomId,reason:'thailand-reviewed-gameplay-region',
      ...(islandAttachments.length ? {islandAttachments} : {})};
  });
  if (consumed.size !== old.size || assigned.size !== atoms.size) throw new Error('Missing Thai gameplay groups or source areas');
  return [...groups.filter(g => !old.has(g.id)),...out].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
