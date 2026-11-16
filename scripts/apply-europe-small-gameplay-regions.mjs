/** Merge only the fourteen approved physically adjacent European gameplay
 * fragments. Preserve the previous destination names and source anchors. */
export function applyEuropeSmallMergers(base,groups,plan){
 const approved=new Map(Object.entries({
  'SVN-1000':['SVN-269','SVN-200','SVN-1005','SVN-1014','SVN-1039'],
  'DEU-1576':['DEU-1575'],'DEU-1579':['DEU-1578'],'KOS-5886':['KOS-5901','KOS-5907'],
  'HUN-3160':['HUN-4921'],'BIH-2224':['BIH-3153'],'ITA-5455':['ITA-5457'],
  'MDA-1628':['MDA-1652'],'HRV-1493':['HRV-1609'],
 }).map(([id,fragments])=>['group:'+id,[id,...fragments].map(k=>'group:'+k).sort()]));
 if(plan.schema!==1||!Array.isArray(plan.regions)||plan.regions.length!==approved.size)throw new Error('Expected nine reviewed European small-fragment destinations');
 const prior=new Map(groups.map(g=>[g.id,g]));
 const atoms=new Map(base.provinces.map(p=>[p.id,p]));
 const consumed=new Set();
 const replacements=plan.regions.map(({primary,members,displayName,anchorAtomId})=>{
  const core=prior.get(primary), expected=approved.get(primary);
  if(!core||!expected||JSON.stringify(Object.keys(members??{}).sort())!==JSON.stringify(expected)||
     !Array.isArray(displayName)||displayName.length!==2||!displayName.every(n=>typeof n==='string'&&n.trim())||
     !core.sourceIds.includes(anchorAtomId)){
   throw new Error('Invalid reviewed European destination or anchor: '+primary);
  }
  approved.delete(primary);
  const country=atoms.get(core.sourceIds[0])?.country,coreIds=new Set(core.sourceIds),ids=[];
  for(const [id,previous] of Object.entries(members)){
   const group=prior.get(id);
   if(!group||consumed.has(id)||!Array.isArray(previous)||previous.length!==group.sourceIds.length||
      !previous.every((atom,i)=>atom===group.sourceIds[i])||group.sourceIds.some(atom=>atoms.get(atom)?.country!==country)||
      (id!==primary&&group.islandAttachments?.length)){
    throw new Error('Unexpected European fragment membership: '+id);
   }
   if(id!==primary&&!group.sourceIds.some(atom=>atoms.get(atom).neighbors.some(i=>coreIds.has(base.provinces[i]?.id)))){
    throw new Error('European fragment must actually touch destination land: '+id);
   }
   consumed.add(id);ids.push(...group.sourceIds);
  }
  const sourceIds=ids.sort();
  if(new Set(sourceIds).size!==sourceIds.length)throw new Error('Duplicate European source area: '+primary);
  return {...core,id:'group:'+sourceIds[0],sourceIds,reason:'europe-reviewed-small-fragment-merge',displayName,anchorAtomId};
 });
 if(consumed.size!==23)throw new Error('Expected exactly 23 reviewed original European groups');
 return [...groups.filter(g=>!consumed.has(g.id)),...replacements].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
}
