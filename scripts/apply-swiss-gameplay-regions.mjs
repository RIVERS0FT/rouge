/** Adjust locked gameplay memberships; Natural Earth geometry and its
 * physical neighbor graph are inputs, never replaced or augmented. */
export function repartitionSwissRegions(base, groups, plan) {
  const atoms = new Map(base.provinces.filter(p => p.country === 'CHE').map(p => [p.id, p]));
  const swiss = new Map();
  for (const group of groups) {
    if (!group.sourceIds.some(id => atoms.has(id))) continue;
    if (!group.sourceIds.every(id => atoms.has(id))) throw new Error('Swiss gameplay group contains non-Swiss land');
    swiss.set(group.id, group);
  }
  if (plan.schema !== 1 || !Array.isArray(plan.regions) || plan.regions.length !== 2 || atoms.size !== 26 || swiss.size !== 4) {
    throw new Error('Expected two Swiss gameplay regions from four prior groups and 26 source cantons');
  }
  const consumed = new Set(), assigned = new Set();
  const replacements = plan.regions.map(({primary, members, displayName}) => {
    const core = swiss.get(primary);
    if (!core || !members?.[primary] || !Array.isArray(displayName) || displayName.length !== 2
        || !displayName.every(name => typeof name === 'string' && name.trim())) {
      throw new Error('Invalid Swiss gameplay region: ' + primary);
    }
    const sourceIds = [];
    for (const [groupId, expected] of Object.entries(members)) {
      const old = swiss.get(groupId);
      if (!old || consumed.has(groupId) || !Array.isArray(expected) || expected.length !== old.sourceIds.length
          || !expected.every((id, i) => id === old.sourceIds[i])) {
        throw new Error('Duplicate or changed Swiss gameplay membership: ' + groupId);
      }
      consumed.add(groupId);
      for (const id of old.sourceIds) {
        if (assigned.has(id)) throw new Error('Duplicate Swiss canton: ' + id);
        assigned.add(id);
        sourceIds.push(id);
      }
    }
    sourceIds.sort();
    if (primary !== 'group:' + sourceIds[0]) throw new Error('Swiss gameplay region would change its stable ID: ' + primary);
    const selected = new Set(sourceIds), reached = new Set([sourceIds[0]]);
    for (const id of reached) {
      for (const index of atoms.get(id).neighbors) {
        const neighbor = base.provinces[index]?.id;
        if (selected.has(neighbor)) reached.add(neighbor);
      }
    }
    if (reached.size !== sourceIds.length) throw new Error('Disconnected Swiss gameplay region: ' + primary);
    return {...core, sourceIds, reason:'swiss-victoria-state-region', displayName};
  });
  if (consumed.size !== swiss.size || assigned.size !== atoms.size) throw new Error('Swiss region plan misses source cantons');
  return [...groups.filter(g => !swiss.has(g.id)), ...replacements].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
