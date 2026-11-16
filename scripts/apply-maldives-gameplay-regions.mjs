/** Combine the reviewed Maldives atolls into one management region, without
 * adding any physical land adjacency or replacing any original geometry. */
export function repartitionMaldives(base, groups, plan) {
  const mdv = new Map(base.provinces.filter(p => p.country === 'MDV').map(p => [p.id, p]));
  const {schema, atomIds, displayName, anchorAtomId} = plan;
  if (schema !== 1 || mdv.size !== 21 || !Array.isArray(atomIds) || atomIds.length !== 21
      || !Array.isArray(displayName) || displayName.length !== 2
      || !displayName.every(name => typeof name === 'string' && name.trim())
      || anchorAtomId !== 'MDV-5234' || !atomIds.includes(anchorAtomId)) {
    throw new Error('Expected one reviewed Maldives gameplay region with the original Malé anchor');
  }
  const unaffected = [], retired = new Set();
  for (const group of groups) {
    const members = group.sourceIds.filter(id => mdv.has(id));
    if (!members.length) unaffected.push(group);
    else if (members.length !== 1 || group.sourceIds.length !== 1 || retired.has(members[0])) {
      throw new Error('Maldives input must contain separate unchanged source groups');
    } else retired.add(members[0]);
  }
  if (retired.size !== mdv.size) throw new Error('Missing prior Maldives source areas');

  const sourceIds = [...atomIds].sort(), assigned = new Set();
  for (const id of sourceIds) {
    const atom = mdv.get(id);
    if (!atom || assigned.has(id) || atom.neighbors.length) throw new Error(`Unexpected Maldives island or physical neighbor: ${id}`);
    assigned.add(id);
  }
  // Explicit membership links, not connectivity in either physical graph.
  const gameplay = {id:'group:'+sourceIds[0],sourceIds,legacyHint:null,reason:'maldives-island-gameplay-region',displayName,anchorAtomId,
    islandAttachments:sourceIds.filter(id=>id!==anchorAtomId).map(id=>[id,anchorAtomId])};
  return [...unaffected,gameplay].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
}
