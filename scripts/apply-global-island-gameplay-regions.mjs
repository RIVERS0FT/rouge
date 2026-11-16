/** Consolidate each of nine reviewed island labels into one locked gameplay
 * region. Component links never enter the physical source/terrain graph. */
export function repartitionGlobalIslands(base, groups, plan){
 const expected=new Map(Object.entries({
  SYC:[16,26,4],BMU:[11,11,1],BRB:[7,11,1],KNA:[10,14,2],PLW:[13,16,7],
  MUS:[9,16,3],BHS:[24,30,22],COK:[11,11,11],CPV:[9,22,9],
 }));
 if(plan.schema!==1||!Array.isArray(plan.regions)||plan.regions.length!==9)throw new Error('Expected nine reviewed island labels');
 const prior=new Map(groups.map(g=>[g.id,g])),source=new Map(base.provinces.map(p=>[p.id,p]));
 const consumed=new Set(),assigned=new Set();
 const replacements=plan.regions.map(({country,id,groups:members,displayName,anchorAtomId,components,searchAliases})=>{
  const count=expected.get(country),core=prior.get(id);
  if(!count||!core||!members?.[id]||Object.keys(members).length!==count[0]||
     !Array.isArray(components)||components.length!==count[2]||!components.every(c=>Array.isArray(c)&&c.length>0)||
     !Array.isArray(displayName)||displayName.length!==2||!displayName.every(n=>typeof n==='string'&&n.trim())||
     (searchAliases!==undefined&&(!Array.isArray(searchAliases)||!searchAliases.every(n=>typeof n==='string'&&n.trim())))){
   throw new Error('Invalid reviewed island region: '+country);
  }
  expected.delete(country);
  const membersIds=[];
  for(const [key,approved] of Object.entries(members)){
   const g=prior.get(key);
   if(!g||consumed.has(key)||g.islandAttachments?.length||!Array.isArray(approved)||approved.length!==g.sourceIds.length||
      !approved.every((atom,i)=>atom===g.sourceIds[i]&&source.get(atom)?.country===country)){
    throw new Error('Duplicate, foreign or changed island membership: '+key);
   }
   consumed.add(key);
   for(const atom of g.sourceIds){
    if(assigned.has(atom))throw new Error('Duplicate island source area: '+atom);
    assigned.add(atom);membersIds.push(atom);
   }
  }
  const sourceIds=membersIds.sort(),pending=new Set(sourceIds),measured=[];
  if(sourceIds.length!==count[1]||id!=='group:'+sourceIds[0]||!pending.has(anchorAtomId)||
     base.provinces.filter(p=>p.country===country).length!==count[1]){
   throw new Error('Island region is missing original land or its anchor: '+country);
  }
  while(pending.size){
   const first=pending.values().next().value,connected=[first];
   pending.delete(first);
   for(const atom of connected){
    for(const i of source.get(atom).neighbors){
     const neighbor=base.provinces[i]?.id;
     if(pending.delete(neighbor))connected.push(neighbor);
    }
   }
   measured.push(connected.sort());
  }
  const digest=items=>items.map(part=>JSON.stringify([...part].sort())).sort();
  if(JSON.stringify(digest(components))!==JSON.stringify(digest(measured))){
   throw new Error('Unreviewed physical island components: '+country);
  }
  const links=measured.filter(part=>!part.includes(anchorAtomId)).map(part=>[part[0],anchorAtomId]);
  return {...core,sourceIds,displayName,anchorAtomId,reason:'global-reviewed-island-region',
    ...(links.length?{islandAttachments:links}:{}),...(searchAliases?.length?{searchAliases}:{})};
 });
 if(consumed.size!==110||assigned.size!==157)throw new Error('Expected all 110 gameplay groups and 157 source island areas');
 return [...groups.filter(g=>!consumed.has(g.id)),...replacements].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
}
