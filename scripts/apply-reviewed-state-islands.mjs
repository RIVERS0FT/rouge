/** Combine reviewed state regions out of whole existing Rouge regions.
 * Extra component edges connect the locked administrative grouping only.
 * Do not mutate the original province records, coastlines or routing graph. */
export function applyReviewedStateIslands(base, groups, plan, reference, {label,reason,allowNewAttachments=true}) {
 const validName=s=>typeof s==='string'&&s.trim().length>0&&s===s.trim();
 const prior=new Map(groups.map(g=>[g.id,g]));
 const source=new Map(base.provinces.map(p=>[p.id,p]));
 if(plan?.schema!==1||plan.referenceVersion!==reference?.sourceVersion||!Array.isArray(plan.regions)||!plan.regions.length)
  throw Error('Invalid '+label+' state-region reference or plan');
 const states=new Map(reference.provinces.map(p=>[p.code,p.name]));
 const consumed=new Set(), reviewCodes=new Set(), selectedAtoms=new Set();
 const replacements=plan.regions.map(row=>{
  const {stateCode,primary,members,displayName,anchorAtomId,searchAliases}=row;
  const stateName=states.get(stateCode), core=prior.get(primary);
  if(!stateName||reviewCodes.has(stateCode)||!core||!members||Array.isArray(members)||!Object.hasOwn(members,primary)||
     !core.sourceIds.includes(anchorAtomId)||!Array.isArray(displayName)||displayName.length!==2||
     !displayName.every(validName)||displayName[1]!==stateName[1]||
     (searchAliases!==undefined&&(!Array.isArray(searchAliases)||!searchAliases.every(validName)))) {
   throw Error('Invalid '+label+' state-region row or display name: '+stateCode);
  }
  reviewCodes.add(stateCode);
  const ids=[],existingLinks=[],aliases=new Set(searchAliases??[]);
  for(const [id,atomIds] of Object.entries(members)){
   const o=prior.get(id);
   if(!o||consumed.has(id)||!Array.isArray(atomIds)||atomIds.length!==o.sourceIds.length||
      !atomIds.every((atom,i)=>atom===o.sourceIds[i]&&source.has(atom)&&!selectedAtoms.has(atom)))
    throw Error('Duplicate, unknown or changed '+label+' membership: '+id);
   consumed.add(id);
   for(const atom of atomIds){selectedAtoms.add(atom);ids.push(atom);}
   for(const l of o.islandAttachments??[])existingLinks.push(l);
   for(const alias of [...o.displayName??[],...o.searchAliases??[]])aliases.add(alias);
  }
  for(const name of displayName)aliases.delete(name);
  const sourceIds=ids.sort(), area=new Set(sourceIds);
  if(area.size!==sourceIds.length)throw Error('Duplicate '+label+' source area: '+stateCode);

  const roots=new Map(sourceIds.map(id=>[id,id]));
  const find=id=>{while(roots.get(id)!==id)id=roots.get(id);return id;};
  function join(a,b){
   const aa=find(a),bb=find(b);if(aa===bb)return false;
   if(aa<bb)roots.set(bb,aa);else roots.set(aa,bb);return true;
  }
  for(const id of sourceIds)for(const neighbor of source.get(id).neighbors){
   const n=base.provinces[neighbor]?.id;if(area.has(n))join(id,n);
  }
  const links=[];
  // Keep earlier approved links when they still connect distinct components.
  // A formerly disconnected pair can become connected by physical land via a
  // third group in this merge; do not retain a redundant administrative link.
  for(const [a,b] of existingLinks){
   if(!area.has(a)||!area.has(b))throw Error(label+' merge would lose an earlier island endpoint: '+stateCode);
   if(join(a,b))links.push([a,b]);
  }
  const components=[...new Set(sourceIds.map(find))];
  if(!allowNewAttachments&&components.length>1)
   throw Error(label+' merge requires connected land or previously reviewed attachments: '+stateCode);
  for(const island of components)if(join(island,anchorAtomId))links.push([island,anchorAtomId]);
  const {islandAttachments:_oldLinks,searchAliases:_oldAliases,...retained}=core;
  return {...retained,id:'group:'+sourceIds[0],sourceIds,displayName,anchorAtomId,
    reason,...(links.length?{islandAttachments:links}:{}),
    ...(aliases.size?{searchAliases:[...aliases].sort()}:{} )};
 });
 return [...groups.filter(g=>!consumed.has(g.id)),...replacements].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
}
