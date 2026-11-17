import {applyReviewedStateIslands} from './apply-reviewed-state-islands.mjs';
const edgeKey=([a,b])=>a<b?a+'|'+b:b+'|'+a;

/** Replay the accepted A-page grouping without treating state geometry or
 * administrative connectors as physical land. New grouping-only links must
 * be listed explicitly, and must exactly match the computed components. */
export function applyReviewedClassAGameplayRegions(base,groups,plan) {
 const {schema,baseline,regions}=plan??{};
 if(schema!==1||baseline?.regionCount!==groups.length||!Array.isArray(regions)||!regions.length)
  throw Error('Invalid reviewed Class A gameplay regions or baseline');
 const originals=new Map(groups.map(g=>[g.id,g]));
 const atomIds=new Set(base.provinces.map(p=>p.id));
 const used=new Set(),checks=new Map(),reviewedLinksByReceiver=new Map();
 const isName=s=>typeof s==='string'&&!!s.trim()&&s===s.trim();
 let sourceCount=0;
 function checkGroup(id,atoms){
  const current=originals.get(id);
  if(!current||used.has(id)||!Array.isArray(atoms)||current.sourceIds.length!==atoms.length||
     !atoms.every((atom,i)=>atom===current.sourceIds[i]&&atomIds.has(atom)))
   throw Error('Unknown, duplicate or changed reviewed Class A group: '+id);
  used.add(id);return current;
 }
 const rows=regions.map(row=>{
  const {target,displayName,anchorAtomId,targetSourceIds,sources,expectedNewIslandAttachments}=row;
  const receiver=checkGroup(target,targetSourceIds);
  if(!targetSourceIds.includes(anchorAtomId)||!Array.isArray(displayName)||displayName.length!==2||!displayName.every(isName)||
     !Array.isArray(sources)||!sources.length||receiver.displayName?.some((name,i)=>name!==displayName[i])||
      (receiver.anchorAtomId!==undefined&&receiver.anchorAtomId!==anchorAtomId)||!Array.isArray(expectedNewIslandAttachments))
   throw Error('Invalid reviewed Class A receiver identity or topology approval: '+target);
  const members={[target]:targetSourceIds},aliases=new Set();
  const inherited=new Set((receiver.islandAttachments??[]).map(edgeKey));
  for(const row of sources){
   const {group,sourceIds,aliases:oldNames}=row;
   const donor=checkGroup(group,sourceIds);
   if(!Array.isArray(oldNames)||oldNames.length<2||!oldNames.every(isName))
    throw Error('Invalid reviewed Class A source aliases: '+group);
   members[group]=sourceIds;
   for(const alias of [...oldNames,group])aliases.add(alias);
   for(const link of donor.islandAttachments??[])inherited.add(edgeKey(link));
   sourceCount++;
  }
  const mergedAtoms=Object.values(members).flat(),scope=new Set(mergedAtoms),expected=new Set();
  for(const edge of expectedNewIslandAttachments){
   if(!Array.isArray(edge)||edge.length!==2||edge[0]===edge[1]||!edge.every(id=>scope.has(id))||
      inherited.has(edgeKey(edge))||expected.has(edgeKey(edge)))
    throw Error('Invalid approved Class A grouping-only link: '+target);
   expected.add(edgeKey(edge));
  }
  checks.set('group:'+mergedAtoms.sort()[0],{expected,inherited});
  reviewedLinksByReceiver.set(target,expectedNewIslandAttachments);
  return {stateCode:target,primary:target,members,displayName,anchorAtomId,searchAliases:[...aliases]};
 });
 if(sourceCount!==63)throw Error('Unexpected scope of approved Class A merges');
 const withReviewedLinks=groups.map(g=>{
  const additions=reviewedLinksByReceiver.get(g.id);
  return additions?.length?{...g,islandAttachments:[...g.islandAttachments??[],...additions]}:g;
 });
 const verified=applyReviewedStateIslands(base,withReviewedLinks,{schema:1,referenceVersion:'reviewed-class-a-v1',regions:rows},
  {sourceVersion:'reviewed-class-a-v1',provinces:rows.map(r=>({code:r.stateCode,name:r.displayName}))},
  {label:'Class A',reason:'user-approved-class-a-gameplay-region',allowNewAttachments:false});
 for(const g of verified){
  const check=checks.get(g.id);
  if(!check)continue;
  const actual=(g.islandAttachments??[]).map(edgeKey).filter(key=>!check.inherited.has(key));
  if(actual.length!==check.expected.size||!actual.every(key=>check.expected.has(key)))
   throw Error('Undeclared or mismatched reviewed Class A grouping-only links: '+g.id);
 }
 return verified;
}
