import {applyReviewedStateIslands} from './apply-reviewed-state-islands.mjs';

/** A bounded replay of user-approved whole-region unions. The receiver's label
 * and anchor stay stable; the canonical ID may change to the smallest atom.
 * Exact cross-group land contacts are explicit and checked against source data. */
export function applyApprovedAdjacentGameplayRegions(base,groups,plan) {
 const {schema,baseline,regions}=plan??{};
 if(schema!==1||baseline?.regionCount!==groups.length||!Array.isArray(regions)||regions.length!==18)
  throw Error('Invalid approved adjacent gameplay regions or baseline');

 const originals=new Map(groups.map(g=>[g.id,g]));
 const sourceAtoms=new Map(base.provinces.map((p,i)=>[p.id,{...p,index:i}]));
 const used=new Set();
 let sourceCount=0,edgeCount=0;
 function checkGroup(id,atoms){
  const current=originals.get(id);
  if(!current||used.has(id)||!Array.isArray(atoms)||current.sourceIds.length!==atoms.length||
     !atoms.every((atom,i)=>atom===current.sourceIds[i]&&sourceAtoms.has(atom)))
   throw Error('Unknown, duplicate or changed approved adjacent group: '+id);
  used.add(id);return current;
 }
 const isName=s=>typeof s==='string'&&!!s.trim()&&s===s.trim();
 const rows=regions.map(row=>{
  const {target,displayName,anchorAtomId,targetSourceIds,sources}=row;
  const receiver=checkGroup(target,targetSourceIds),receiverAtoms=new Set(targetSourceIds);
  if(!receiverAtoms.has(anchorAtomId)||!Array.isArray(displayName)||displayName.length!==2||!displayName.every(isName)||
     !Array.isArray(sources)||!sources.length||receiver.displayName?.some((name,i)=>name!==displayName[i])||
      (receiver.anchorAtomId!==undefined&&receiver.anchorAtomId!==anchorAtomId))
   throw Error('Invalid approved adjacent receiver identity: '+target);
  const members={[target]:targetSourceIds},aliases=new Set();
  for(const row of sources){
   const {group,sourceIds,aliases:oldNames,landEdges}=row;
   checkGroup(group,sourceIds);
   const actual=new Set();
   for(const atom of sourceIds)for(const n of sourceAtoms.get(atom).neighbors){
    const other=base.provinces[n];
    if(receiverAtoms.has(other?.id)&&other.neighbors.includes(sourceAtoms.get(atom).index))
     actual.add(atom+'|'+other.id);
   }
   if(!Array.isArray(landEdges)||!landEdges.length||landEdges.length!==actual.size||
      !landEdges.every(e=>Array.isArray(e)&&e.length===2&&actual.delete(e.join('|'))))
    throw Error('Changed or absent reviewed raw land contacts: '+group+' → '+target);
   if(!Array.isArray(oldNames)||oldNames.length!==2||!oldNames.every(isName))
    throw Error('Invalid approved source aliases: '+group);
   members[group]=sourceIds;
   for(const name of [...oldNames, group])aliases.add(name);
   sourceCount++;edgeCount+=landEdges.length;
  }
  return {stateCode:target,primary:target,members,displayName,anchorAtomId,searchAliases:[...aliases]};
 });
 if(sourceCount!==21||edgeCount!==53)throw Error('Unexpected scope of approved adjacent merges');
 return applyReviewedStateIslands(base,groups,{schema:1,referenceVersion:'approved-adjacent-v1',regions:rows},
  {sourceVersion:'approved-adjacent-v1',provinces:rows.map(r=>({code:r.stateCode,name:r.displayName}))},
  {label:'Approved adjacent',reason:'user-approved-adjacent-gameplay-region',allowNewAttachments:false});
}
