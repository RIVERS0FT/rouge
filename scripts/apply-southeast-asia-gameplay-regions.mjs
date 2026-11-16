/** Merge reviewed gameplay regions without changing any source geometry or
 * physical land/water edge. Singapore→Malay Peninsula is a gameplay-only
 * exception for the pinned five Singapore atoms, not a source reassignment. */
export function repartitionSoutheastAsia(base, groups, plan) {
  const expectedIds = new Set([
    'VNM-429','VNM-456','VNM-444','KHM-1777','MYS-1186','TLS-541','IDN-538','IDN-1235','MYS-1137',
  ].map(id=>'group:'+id));
  if (plan.schema !== 1 || !Array.isArray(plan.regions) || plan.regions.length !== expectedIds.size) {
    throw new Error('Expected reviewed Southeast Asia gameplay groups');
  }
  const original = new Map(groups.map(g=>[g.id,g]));
  const sources = new Map(base.provinces.map(p=>[p.id,p]));
  const consumed = new Set();
  const out = plan.regions.map(({id, groups: prior, displayName, islandAttachments, anchorAtomId, searchAliases}) => {
    if (!expectedIds.delete(id) || !prior?.[id] || !Array.isArray(displayName) || displayName.length !== 2 ||
        !displayName.every(n=>typeof n==='string' && n.trim()) || !Array.isArray(islandAttachments)) {
      throw new Error('Invalid Southeast Asia gameplay region: '+id);
    }
    if (searchAliases !== undefined && (!Array.isArray(searchAliases) || !searchAliases.every(n=>typeof n==='string' && n.trim()))) {
      throw new Error('Invalid Southeast Asia search aliases: '+id);
    }
    const sourceIds = [];
    for (const [key,approved] of Object.entries(prior)) {
      const input = original.get(key);
      if (!input || consumed.has(key) || !Array.isArray(approved) || approved.length !== input.sourceIds.length ||
          !approved.every((atom,i)=>atom===input.sourceIds[i]) || input.islandAttachments?.length) {
        throw new Error('Duplicate or changed Southeast Asia input group: '+key);
      }
      consumed.add(key);
      sourceIds.push(...input.sourceIds);
    }
    sourceIds.sort();
    const members = new Set(sourceIds), country = sourceIds[0].slice(0,3);
    if (id !== 'group:'+sourceIds[0] || members.size !== sourceIds.length ||
        (anchorAtomId !== undefined && !members.has(anchorAtomId))) {
      throw new Error('Invalid Southeast Asia membership, stable ID, or anchor: '+id);
    }
    const foreign = sourceIds.filter(atom=>sources.get(atom)?.country!==country);
    const singapore = ['SGP-4871','SGP-4872','SGP-4873','SGP-4874','SGP-4875'];
    if (id === 'group:MYS-1137') {
      if (JSON.stringify(foreign)!==JSON.stringify(singapore) || Object.keys(prior).sort().join(',')!=='group:MYS-1137,group:SGP-4871') {
        throw new Error('Only the reviewed five Singapore source areas may join the Malay Peninsula');
      }
    } else if (foreign.length) throw new Error('Unexpected Southeast Asia cross-country grouping: '+id);
    const pending = new Set(sourceIds), component = new Map();
    while (pending.size) {
      const first = pending.values().next().value, connected = [first];
      pending.delete(first);
      for (const atom of connected) {
        component.set(atom,first);
        for (const index of sources.get(atom).neighbors) {
          const other = base.provinces[index]?.id;
          if (pending.delete(other)) connected.push(other);
        }
      }
    }
    const allComponents = new Set(component.values());
    if (islandAttachments.length !== allComponents.size-1) throw new Error('Unreviewed disconnected Southeast Asia land: '+id);
    const merged = new Map([...allComponents].map(c=>[c,c]));
    const root = c=>{while (merged.get(c)!==c) c=merged.get(c);return c;};
    for (const edge of islandAttachments) {
      if (!Array.isArray(edge) || edge.length!==2 || !edge.every(atom=>members.has(atom))) {
        throw new Error('Invalid Southeast Asia administrative attachment: '+id);
      }
      const a=root(component.get(edge[0])), b=root(component.get(edge[1]));
      if (a===b) throw new Error('Redundant Southeast Asia administrative attachment: '+id);
      merged.set(a,b);
    }
    return {id,sourceIds,legacyHint:original.get(id).legacyHint,reason:'southeast-asia-reviewed-gameplay-region',displayName,
      ...(anchorAtomId?{anchorAtomId}:{}),...(searchAliases?{searchAliases}:{}),...(islandAttachments.length?{islandAttachments}:{})};
  });
  if (consumed.size!==18) throw new Error('Expected exactly eighteen reviewed Southeast Asia input groups');
  return [...groups.filter(g=>!consumed.has(g.id)), ...out].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
}
