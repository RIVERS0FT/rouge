/** Apply whole-group consolidations to the pinned Natural Earth partition. */
export function consolidateStateRegions(base, originalGroups, decisions) {
  return mergeWholeGroups(base, originalGroups, decisions, 'audited-state-region-edge-consolidation',
    (core, edge, {stateId}) => Number.isInteger(stateId) && core.legacyHint === stateId && edge.legacyHint === stateId);
}

/** A changelog-confirmed state merger can link two different old reference IDs.
 * Match exact historical audit keys and original members; never guess from names. */
export function applyCurrentStateMergers(base, originalGroups, decisions, audit) {
  if (decisions.referenceVersion !== '1.15.1' || audit.atlasSha256 !== '854f3b999cce9a0a7f85968cfe0ec95d4c4cb52a8e9c9bb5c5ef8c17b86b8449') {
    throw new Error('Current state mergers require the reviewed reference versions');
  }
  const states = new Map(audit.states.map(s => [s.id, s.code]));
  const sameMembers = (actual, expected) => Array.isArray(expected) && actual.length === expected.length
    && actual.every((id, i) => id === expected[i]);
  return mergeWholeGroups(base, originalGroups, decisions, 'confirmed-state-region-merger-1.15.1',
    (core, edge, entry) => core.legacyHint !== edge.legacyHint && states.get(core.legacyHint) !== undefined
      && states.get(edge.legacyHint) !== undefined
      && states.get(core.legacyHint) === entry.referenceState && states.get(edge.legacyHint) === entry.removedState
      && core.legacyHint === entry.primaryStateId && edge.legacyHint === entry.fragmentStateId
      && sameMembers(core.sourceIds, entry.primarySourceIds) && sameMembers(edge.sourceIds, entry.fragmentSourceIds)
      && Array.isArray(entry.displayName) && entry.displayName.length === 2
      && entry.displayName.every(name => typeof name === 'string' && name.trim()));
}

function mergeWholeGroups(base, originalGroups, decisions, reason, validReference) {
  if (decisions.schema !== 1 || !Array.isArray(decisions.merges)) throw new Error('Invalid state-region consolidation');
  const groups = new Map(originalGroups.map(g => [g.id, g]));
  const atoms = new Map(base.provinces.map(a => [a.id, a]));
  const removed = new Set(), additions = new Map(), displayNames = new Map();
  for (const entry of decisions.merges) {
    const { primary, fragment } = entry;
    const core = groups.get(primary), edge = groups.get(fragment);
    if (!core || !edge || primary === fragment || removed.has(fragment)
      || !validReference(core, edge, entry) || displayNames.has(primary)) {
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
    if (entry.displayName) displayNames.set(primary, entry.displayName);
  }
  if ([...additions.keys()].some(id => removed.has(id))) throw new Error('State-region consolidation cannot chain fragments');
  const result = originalGroups.filter(g => !removed.has(g.id)).map(g => {
    const extra = additions.get(g.id);
    if (!extra) return g;
    const sourceIds = [...g.sourceIds, ...extra].sort();
    return { ...g, id: 'group:' + sourceIds[0], sourceIds, reason,
      ...(displayNames.has(g.id) ? {displayName: displayNames.get(g.id)} : {}) };
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const all = result.flatMap(g => g.sourceIds);
  if (all.length !== atoms.size || new Set(all).size !== atoms.size || all.some(id => !atoms.has(id))) throw new Error('State-region consolidation loses or duplicates source land');
  return result;
}
