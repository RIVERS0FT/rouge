/** Apply whole-group consolidations to the pinned Natural Earth partition. */
export function consolidateStateRegions(base, originalGroups, decisions) {
  if (decisions.schema !== 1 || !Array.isArray(decisions.merges)) throw new Error('Invalid state-region consolidation');
  const groups = new Map(originalGroups.map(g => [g.id, g]));
  const atoms = new Map(base.provinces.map(a => [a.id, a]));
  const removed = new Set(), additions = new Map();
  for (const entry of decisions.merges) {
    const { primary, fragment, stateId } = entry;
    const core = groups.get(primary), edge = groups.get(fragment);
    if (!core || !edge || primary === fragment || removed.has(fragment)
      || !Number.isInteger(stateId) || core.legacyHint !== stateId || edge.legacyHint !== stateId) {
      throw new Error('State-region consolidation references an invalid primary, fragment, or state');
    }
    const members = [...core.sourceIds, ...edge.sourceIds];
    const countries = new Set(members.map(id => atoms.get(id)?.country));
    const coreAtoms = new Set(core.sourceIds);
    if (members.includes('KAB+00?') || countries.size !== 1 || countries.has(undefined)
      || !edge.sourceIds.some(id => atoms.get(id).neighbors.some(index => coreAtoms.has(base.provinces[index]?.id)))) {
      throw new Error('State-region consolidation must preserve the protected override and join touching same-country land');
    }
    removed.add(fragment);
    const ids = additions.get(primary) ?? [];
    ids.push(...edge.sourceIds);
    additions.set(primary, ids);
  }
  if ([...additions.keys()].some(id => removed.has(id))) throw new Error('State-region consolidation cannot chain fragments');
  const result = originalGroups.filter(g => !removed.has(g.id)).map(g => {
    const extra = additions.get(g.id);
    if (!extra) return g;
    const sourceIds = [...g.sourceIds, ...extra].sort();
    return { ...g, id: 'group:' + sourceIds[0], sourceIds, reason: 'audited-state-region-edge-consolidation' };
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const all = result.flatMap(g => g.sourceIds);
  if (all.length !== atoms.size || new Set(all).size !== atoms.size || all.some(id => !atoms.has(id))) throw new Error('State-region consolidation loses or duplicates source land');
  return result;
}
