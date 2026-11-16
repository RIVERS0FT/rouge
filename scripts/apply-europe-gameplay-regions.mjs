/** Apply seven approved European gameplay edits without changing original
 * country tags, land/water connectivity or polygon geometry. */
export function repartitionEurope(base, groups, plan) {
  const reviewed=new Map(Object.entries({
    'MLT-5920':[10,68,1],'ALD-4810':[10,11,9],'LVA-1068':[6,41,0],
    'LVA-1063':[3,78,0],'EST-1654':[3,8,2],'EST-1657':[1,7,0],
    'AND-4876':[2,7,0],'LIE-4892':[2,11,0],'SVN-1010':[2,22,0],'SVN-1000':[2,132,0],
  }).map(([k,v])=>['group:'+k,v]));
  if(plan.schema!==1||!Array.isArray(plan.regions)||plan.regions.length!==reviewed.size)throw new Error('Expected ten reviewed European gameplay regions');
  const original=new Map(groups.map(g=>[g.id,g])),source=new Map(base.provinces.map(p=>[p.id,p]));
  const consumed=new Set();
  const replacements=plan.regions.map(({id,groups:members,displayName,anchorAtomId,groupingLinks})=>{
    const expectation=reviewed.get(id), core=original.get(id);
    if(!expectation||!core||!members?.[id]||Object.keys(members).length!==expectation[0]||
       !Array.isArray(displayName)||displayName.length!==2||!displayName.every(name=>typeof name==='string'&&name.trim())||
       !Array.isArray(groupingLinks)||groupingLinks.length!==expectation[2]) {
      throw new Error('Invalid reviewed European gameplay region: '+id);
    }
    reviewed.delete(id);
    const ids=[];
    for(const [key,expected] of Object.entries(members)){
      const g=original.get(key);
      if(!g||consumed.has(key)||g.islandAttachments?.length||!Array.isArray(expected)||
         expected.length!==g.sourceIds.length||!expected.every((atom,i)=>atom===g.sourceIds[i])) {
        throw new Error('Duplicate or changed European gameplay membership: '+key);
      }
      consumed.add(key);ids.push(...g.sourceIds);
    }
    const sourceIds=ids.sort(), set=new Set(sourceIds);
    const country=sourceIds[0].slice(0,3);
    if (id!=='group:'+sourceIds[0]||sourceIds.length!==expectation[1]||set.size!==sourceIds.length||
        (anchorAtomId!==undefined&&!set.has(anchorAtomId))||sourceIds.some(atom=>source.get(atom)?.country!==country)) {
      throw new Error('Invalid European membership, stable ID, or anchor: '+id);
    }
    const pending=new Set(sourceIds), components=new Map();
    while(pending.size){
      const first=pending.values().next().value, connected=[first];pending.delete(first);
      for(const atom of connected){
        components.set(atom,first);
        for(const i of source.get(atom).neighbors){
          const neighbor=base.provinces[i]?.id;
          if(pending.delete(neighbor))connected.push(neighbor);
        }
      }
    }
    const roots=new Map([...new Set(components.values())].map(c=>[c,c])), root=c=>{while(roots.get(c)!==c)c=roots.get(c);return c;};
    if(groupingLinks.length!==roots.size-1)throw new Error('Unreviewed European land components: '+id);
    for(const edge of groupingLinks){
      if(!Array.isArray(edge)||edge.length!==2||!edge.every(atom=>set.has(atom))){
        throw new Error('Invalid European grouping-only link: '+id);
      }
      const a=root(components.get(edge[0])),b=root(components.get(edge[1]));
      if(a===b)throw new Error('Redundant European grouping-only link: '+id);
      roots.set(a,b);
    }
    return {...core,sourceIds,displayName,...(expectation[0]>1?{reason:'europe-reviewed-gameplay-region'}:{}),
      ...(anchorAtomId?{anchorAtomId}:{}),...(groupingLinks.length?{islandAttachments:groupingLinks}:{})};
  });
  if(consumed.size!==41)throw new Error('Expected exactly 41 input European gameplay groups');
  return [...groups.filter(g=>!consumed.has(g.id)),...replacements].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
}
