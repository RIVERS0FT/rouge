/** Apply the reviewed Timor-Leste, Malaysia and Arabian Peninsula changes.
 * Original land/sea topology and source country fields are immutable inputs. */
export function repartitionAsiaArabia(base, groups, plan) {
  const allowed = new Map(Object.entries({
    'TLS-541':['TLS-541','TLS-543'], 'MYS-1137':['MYS-1137','MYS-1140'],
    'KWT-1663':['KWT-1663','KWT-1664','KWT-3506'], 'BHR-4926':['BHR-4926','BHR-4930'],
    'SAU-1096':['SAU-1096'], 'SAU-845':['SAU-845'], 'SAU-846':['SAU-846'],
    'OMN-2404':['OMN-2404'], 'YEM-150':['YEM-150'], 'ARE-338':['ARE-338'], 'QAT-1099':['QAT-1099'],
  }).map(([k,v])=>['group:'+k,v.map(i=>'group:'+i).sort()]));
  if (plan.schema!==1 || !Array.isArray(plan.regions) || plan.regions.length!==allowed.size) {
    throw new Error('Expected eleven reviewed Asia and Arabia regions');
  }
  const original=new Map(groups.map(g=>[g.id,g])), source=new Map(base.provinces.map(p=>[p.id,p]));
  const consumed=new Set();
  const updated=plan.regions.map(({id,groups:prior,displayName,anchorAtomId,addedGroupingLinks})=>{
    const expected=allowed.get(id), previous=original.get(id);
    if (!previous||!expected||JSON.stringify(Object.keys(prior??{}).sort())!==JSON.stringify(expected)
        ||!Array.isArray(displayName)||displayName.length!==2
        ||!displayName.every(name=>typeof name==='string'&&name.trim())||!Array.isArray(addedGroupingLinks)) {
      throw new Error('Unexpected Asia and Arabia region: '+id);
    }
    allowed.delete(id);
    const atoms=[], links=[];
    for (const [key,approved] of Object.entries(prior)){
      const originalGroup=original.get(key);
      if(!originalGroup||consumed.has(key)||!Array.isArray(approved)||approved.length!==originalGroup.sourceIds.length
         ||!approved.every((atom,i)=>atom===originalGroup.sourceIds[i])) {
        throw new Error('Duplicate or changed Asia and Arabia membership: '+key);
      }
      consumed.add(key);
      atoms.push(...originalGroup.sourceIds);links.push(...originalGroup.islandAttachments??[]);
    }
    const sourceIds=atoms.sort(), member=new Set(sourceIds);
    if(id!=='group:'+sourceIds[0]||member.size!==sourceIds.length||(anchorAtomId!==undefined&&!member.has(anchorAtomId))) {
      throw new Error('Invalid Asia and Arabia membership or anchor: '+id);
    }
    const country=sourceIds[0].slice(0,3);
    const foreign=sourceIds.filter(key=>source.get(key)?.country!==country);
    const inheritedMalaysiaException=['SGP-4871','SGP-4872','SGP-4873','SGP-4874','SGP-4875'];
    if(id==='group:MYS-1137' ? JSON.stringify(foreign)!==JSON.stringify(inheritedMalaysiaException) : foreign.length>0) {
      throw new Error('Unexpected Asia and Arabia cross-country membership: '+id);
    }
    const explicitLinks=id==='group:TLS-541'?[['TLS-543','TLS-542']]:id==='group:BHR-4926'?[['BHR-4930','BHR-4929']]:[];
    if(JSON.stringify(addedGroupingLinks)!==JSON.stringify(explicitLinks)) {
      throw new Error('Unexpected Asia and Arabia grouping-only linkage: '+id);
    }
    links.push(...addedGroupingLinks);

    const pending=new Set(sourceIds), component=new Map();
    while(pending.size){
      const first=pending.values().next().value, connected=[first];pending.delete(first);
      for(const id of connected){
        component.set(id,first);
        for(const i of source.get(id).neighbors){
          const next=base.provinces[i]?.id;
          if(pending.delete(next))connected.push(next);
        }
      }
    }
    const roots=new Map([...new Set(component.values())].map(c=>[c,c]));
    const find=c=>{while(roots.get(c)!==c)c=roots.get(c);return c;};
    if(links.length!==roots.size-1)throw new Error('Incomplete or obsolete Asia and Arabia grouping-only linkage: '+id);
    for(const [a,b] of links){
      if(!member.has(a)||!member.has(b)||find(component.get(a))===find(component.get(b))) {
        throw new Error('Redundant or invalid Asia and Arabia grouping-only linkage: '+id);
      }
      roots.set(find(component.get(a)),find(component.get(b)));
    }
    return {...previous,sourceIds,displayName,
      ...(expected.length>1?{reason:'asia-arabia-reviewed-gameplay-region'}:{}),
      ...(anchorAtomId?{anchorAtomId}:{}),...(links.length?{islandAttachments:links}:{})};
  });
  return [...groups.filter(g=>!consumed.has(g.id)),...updated].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
}
