/** Repartition existing UK source areas using the 12 reviewed ONS ITL1 regions.
 * Disconnected islands may share an administrative group, never a land edge. */
export function repartitionUkRegions(base, groups, plan) {
  if (plan.schema !== 1 || !Array.isArray(plan.regions) || plan.regions.length !== 12) {
    throw new Error('Expected 12 United Kingdom ITL1 regions');
  }
  const uk = new Map(base.provinces.filter(p => p.country === 'GBR').map(p => [p.id, p]));
  if (uk.size !== 232) throw new Error('UK membership requires the pinned 232 Natural Earth source areas');
  const unaffected = [], retired = [];
  for (const group of groups) {
    const count = group.sourceIds.filter(id => uk.has(id)).length;
    if (count === 0) unaffected.push(group);
    else if (count === group.sourceIds.length) retired.push(group);
    else throw new Error('Prior gameplay group mixes the UK with outside land');
  }
  if (retired.length !== 17) throw new Error('Expected 17 prior UK gameplay groups');

  const codes = new Set(), assigned = new Set();
  const modernGroups = plan.regions.map(({code, atomIds, displayName, islandComponents}) => {
    if (!/^TL[C-N]$/.test(code) || codes.has(code) || !Array.isArray(atomIds) || !atomIds.length
       || !Array.isArray(islandComponents) || !Array.isArray(displayName) || displayName.length !== 2
       || !displayName.every(name => typeof name === 'string' && name.trim())) {
      throw new Error(`Invalid UK ITL1 region: ${code}`);
    }
    codes.add(code);
    const sourceIds = [...atomIds].sort(), members = new Set(sourceIds);
    for (const id of sourceIds) {
      if (!uk.has(id) || assigned.has(id)) throw new Error(`Duplicate or non-UK source area: ${id}`);
      assigned.add(id);
    }
    const pending = new Set(members), components = [];
    while (pending.size) {
      const lead = pending.values().next().value, connected = [lead];
      pending.delete(lead);
      for (const id of connected) {
        for (const index of uk.get(id).neighbors) {
          const next = base.provinces[index]?.id;
          if (pending.delete(next)) connected.push(next);
        }
      }
      components.push(connected.sort());
    }
    components.sort((a,b) => b.length - a.length || (a[0] < b[0] ? -1 : 1));
    const order = parts => parts.map(part => JSON.stringify([...part].sort())).sort();
    if (!islandComponents.every(part => Array.isArray(part) && part.length)
       || JSON.stringify(order(components.slice(1))) !== JSON.stringify(order(islandComponents))) {
      throw new Error(`Unreviewed disconnected UK source areas: ${code}`);
    }
    const islandAttachments = components.slice(1).map(part => [part[0], components[0][0]]);
    return {code, id: 'group:' + sourceIds[0], sourceIds, legacyHint: null, reason: 'ons-uk-itl1-region', displayName,
      ...(islandAttachments.length ? {islandAttachments} : {})};
  });
  if (assigned.size !== uk.size) throw new Error('Missing UK source areas');
  // Keep the official TLI/TLJ reference assignments intact and merge the two
  // touching regions only in the operational gameplay partition.
  const {primary, annex, displayName} = plan.gameplayMerge ?? {};
  const southeast = modernGroups.find(group => group.code === primary);
  const london = modernGroups.find(group => group.code === annex);
  if (primary !== 'TLJ' || annex !== 'TLI' || !southeast || !london
     || !Array.isArray(displayName) || displayName.length !== 2
     || !displayName.every(name => typeof name === 'string' && name.trim())) {
    throw new Error('Expected a reviewed London and South East England gameplay merger');
  }
  const southeastIds = new Set(southeast.sourceIds);
  if (!london.sourceIds.some(id => uk.get(id).neighbors.some(index => southeastIds.has(base.provinces[index]?.id)))) {
    throw new Error('The London and South East England gameplay merger requires real land contact');
  }
  const sourceIds = [...southeast.sourceIds, ...london.sourceIds].sort();
  const islandAttachments = [...(southeast.islandAttachments ?? []), ...(london.islandAttachments ?? [])];
  const gameplayMerge = {...southeast, id: 'group:' + sourceIds[0], sourceIds, displayName, reason: 'ons-uk-itl1-gameplay-merge',
    ...(islandAttachments.length ? {islandAttachments} : {})};
  const gameplay = [...modernGroups.filter(group => group !== southeast && group !== london), gameplayMerge]
    .map(({code, ...group}) => group);
  return [...unaffected, ...gameplay].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
