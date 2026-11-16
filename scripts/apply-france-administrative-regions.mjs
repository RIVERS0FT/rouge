/** Replace only metropolitan French gameplay groups using reviewed INSEE membership.
 * The base atlas still supplies all geometry and original land adjacency. */
export function repartitionFrenchRegions(base, groups, plan) {
  if (plan.schema !== 1 || !Array.isArray(plan.regions) || plan.regions.length !== 13) {
    throw new Error('Expected the 13 metropolitan French administrative regions');
  }
  const metropolitan = new Map(base.provinces
    .filter(p => p.country === 'FRA' && p.center[0] > -7 && p.center[0] < 12 && p.center[1] > 40 && p.center[1] < 53)
    .map(p => [p.id, p]));
  if (metropolitan.size !== 96) throw new Error('French administrative membership requires the pinned 96 metropolitan departments');

  const unaffected = [], retired = [];
  for (const group of groups) {
    const count = group.sourceIds.filter(id => metropolitan.has(id)).length;
    if (count === 0) unaffected.push(group);
    else if (count === group.sourceIds.length) retired.push(group);
    else throw new Error('Prior French gameplay group mixes metropolitan France with outside land');
  }
  if (retired.length !== 21) throw new Error('Expected 21 prior metropolitan French gameplay groups');

  const codes = new Set(), assigned = new Set(), departmentCodes = new Set();
  const modernGroups = plan.regions.map(({code, departments, displayName}) => {
    if (!/^\d{2}$/.test(code) || codes.has(code) || !Array.isArray(departments) || !departments.length
      || !Array.isArray(displayName) || displayName.length !== 2
      || !displayName.every(name => typeof name === 'string' && name.trim())) {
      throw new Error(`Invalid French administrative region: ${code}`);
    }
    codes.add(code);
    const sourceIds = departments.map(({atomId, code: departmentCode}) => {
      if (!/^(?:\d{2}|2[AB])$/.test(departmentCode) || departmentCodes.has(departmentCode)
        || !metropolitan.has(atomId) || assigned.has(atomId)) {
        throw new Error(`Duplicate or non-metropolitan French department: ${atomId}`);
      }
      departmentCodes.add(departmentCode);
      assigned.add(atomId);
      return atomId;
    }).sort();
    const connected = new Set([sourceIds[0]]), members = new Set(sourceIds);
    for (const id of connected) {
      for (const index of metropolitan.get(id).neighbors) {
        const next = base.provinces[index]?.id;
        if (members.has(next)) connected.add(next);
      }
    }
    if (connected.size !== sourceIds.length) throw new Error(`Disconnected French administrative region: ${code}`);
    return {id: 'group:' + sourceIds[0], sourceIds, legacyHint: null,
      reason: 'insee-metropolitan-administrative-region', displayName};
  });
  if (assigned.size !== metropolitan.size) throw new Error('Missing metropolitan French departments');
  return [...unaffected, ...modernGroups].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
