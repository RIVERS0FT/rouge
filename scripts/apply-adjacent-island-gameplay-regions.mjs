/** Join reviewed island gameplay groups. These are administrative-only
 * component ties; geographic country tags, shapes and real edges stay intact. */
export function applyAdjacentIslandMergers(base, groups, plan) {
 const scope=new Map(Object.entries({
  'CHN-1180':['MAC+00?'],
  'MNP-4939':['MNP-4937','MNP-4938','MNP-4940'],
  'TON-4945':['TON-4946','TON-4947','TON-4948','TON-4949'],
  'NLD-5148':['NLD-5147','NLD-5149'],
  'SPM-4867':['SPM-4866'],
  'VIR-4868':['VIR-4869','VIR-4870'],
  'VCT-5063':['VCT-5064'],
  'ATG-5093':['ATG-5091','ATG-5092'],
  'COM-4935':['COM-4934','COM-4936'],
 }).map(([a,rest])=>['group:'+a,[a,...rest].map(i=>'group:'+i).sort()]));
 if(plan.schema!==1 || !Array.isArray(plan.regions) || plan.regions.length!==scope.size)throw new Error('Expected nine reviewed island regions');
 const prior=new Map(groups.map(g=>[g.id,g])),source=new Map(base.provinces.map(p=>[p.id,p]));
 const consumed=new Set();
 const rows=plan.regions.map(({primary,members,displayName,anchorAtomId,searchAliases,addedGroupingLinks})=>{
  const core=prior.get(primary), keys=Object.keys(members??{});
  const expectedKeys=scope.get(primary);
  if(!core||!expectedKeys||JSON.stringify(keys.slice().sort())!==JSON.stringify(expectedKeys)||!core.sourceIds.includes(anchorAtomId)||
    !Array.isArray(displayName)||displayName.length!==2||
    !displayName.every(n=>typeof n==='string'&&n.trim())||!Array.isArray(addedGroupingLinks)||
    (searchAliases!==undefined&&(!Array.isArray(searchAliases)||!searchAliases.every(n=>typeof n==='string'&&n.trim())))){
   throw new Error('Invalid reviewed adjacent island destination: '+primary);
  }
  scope.delete(primary);
  const atoms=[],links=[];
  for(const key of keys){
   const original=prior.get(key), expected=members[key];
   if(!original||consumed.has(key)||!Array.isArray(expected)||expected.length!==original.sourceIds.length||
      !expected.every((atom,i)=>atom===original.sourceIds[i])){
    throw new Error('Duplicate or changed island membership: '+key);
   }
   consumed.add(key);atoms.push(...original.sourceIds);links.push(...original.islandAttachments??[]);
  }
  const sourceIds=atoms.sort(), allowed=new Set(sourceIds);
  if(allowed.size!==sourceIds.length)throw new Error('Duplicate island source area: '+primary);
  const tags=new Set(sourceIds.map(id=>source.get(id)?.country));
  if(primary==='group:CHN-1180'){
   const china=sourceIds.filter(id=>source.get(id)?.country==='CHN');
   const hk=sourceIds.filter(id=>source.get(id)?.country==='HKG');
   const macau=sourceIds.filter(id=>source.get(id)?.country==='MAC');
   if(keys.length!==2||!keys.includes('group:MAC+00?')||tags.size!==3||china.join(',')!=='CHN-1180'||
      hk.length!==18||macau.join(',')!=='MAC+00?'||JSON.stringify(addedGroupingLinks)!==JSON.stringify([['MAC+00?','CHN-1180']])){
    throw new Error('Only the reviewed Macau gameplay membership can join Guangdong');
   }
  } else if(tags.size!==1||tags.has(undefined)) {
   throw new Error('Unexpected scope or cross-label adjacent island merge: '+primary);
  }
  links.push(...addedGroupingLinks);

  const pending=new Set(sourceIds), component=new Map();
  while(pending.size){
   const first=pending.values().next().value, connected=[first];pending.delete(first);
   for(const id of connected){
    component.set(id,first);
    for(const index of source.get(id).neighbors){
     const neighbor=base.provinces[index]?.id;
     if(pending.delete(neighbor))connected.push(neighbor);
    }
   }
  }
  const roots=new Map([...new Set(component.values())].map(c=>[c,c]));
  const find=c=>{while(roots.get(c)!==c)c=roots.get(c);return c;};
  if(links.length!==roots.size-1)throw new Error('Unreviewed disconnected adjacent island components: '+primary);
  for(const [a,b] of links){
   if(!allowed.has(a)||!allowed.has(b)||find(component.get(a))===find(component.get(b))){
    throw new Error('Redundant or invalid island administrative link: '+primary);
   }
   roots.set(find(component.get(a)),find(component.get(b)));
  }
  return {...core,id:'group:'+sourceIds[0],sourceIds,displayName,anchorAtomId,reason:'adjacent-island-reviewed-merge',
    ...(links.length?{islandAttachments:links}:{}),...(searchAliases?.length?{searchAliases}:{})};
 });
 return [...groups.filter(g=>!consumed.has(g.id)),...rows].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
}
