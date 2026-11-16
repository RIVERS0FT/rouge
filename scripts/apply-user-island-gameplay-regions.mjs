/** Combine exact reviewed scope only. Administrative joins are deliberately
 * separate from all original geographic adjacency and terrain routing. */
export function repartitionUserIslands(base, groups, plan){
 const expected=new Map(Object.entries({
  caribbean:['AIA+99?',12,33,5,['AIA','GRD','LCA']],
  guangdong:['CHN-1180',4,19,2,['CHN','HKG']],
  taiwan:['TWN-1156',4,21,3,['TWN']],
  micronesia:['FSM-4941',4,4,4,['FSM']],
  'turks-caicos':['TCA-5003',6,6,6,['TCA']],
 }));
 if(plan.schema!==1||!Array.isArray(plan.regions)||plan.regions.length!==5)throw new Error('Expected five reviewed island gameplay regions');
 const prior=new Map(groups.map(g=>[g.id,g])),source=new Map(base.provinces.map(p=>[p.id,p]));
 const consumed=new Set(), assigned=new Set();
 const out=plan.regions.map(({label,id,groups:previous,displayName,anchorAtomId,components,searchAliases})=>{
  const cfg=expected.get(label), core=prior.get(id);
  if(!cfg||!core||id!=='group:'+cfg[0]||!previous?.[id]||Object.keys(previous).length!==cfg[1]||
     !Array.isArray(displayName)||displayName.length!==2||!displayName.every(n=>typeof n==='string'&&n.trim())||
     !Array.isArray(components)||components.length!==cfg[3]||!components.every(c=>Array.isArray(c)&&c.length)||
     (searchAliases!==undefined&&(!Array.isArray(searchAliases)||!searchAliases.every(n=>typeof n==='string'&&n.trim())))){
   throw new Error('Invalid reviewed island gameplay region: '+label);
  }
  expected.delete(label);
  const ids=[];
  for(const [key,exact] of Object.entries(previous)){
   const original=prior.get(key);
   if(!original||consumed.has(key)||original.islandAttachments?.length||!Array.isArray(exact)||
      exact.length!==original.sourceIds.length||!exact.every((atom,i)=>atom===original.sourceIds[i]&&cfg[4].includes(source.get(atom)?.country))){
    throw new Error('Duplicate, foreign or changed source membership: '+key);
   }
   consumed.add(key);
   for(const atom of original.sourceIds){
    if(assigned.has(atom))throw new Error('Duplicate selected source area: '+atom);
    assigned.add(atom);ids.push(atom);
   }
  }
  const sourceIds=ids.sort(), pending=new Set(sourceIds), checked=[];
  const countries=new Set(ids.map(i=>source.get(i).country));
  if(sourceIds.length!==cfg[2]||sourceIds[0]!==cfg[0]||!pending.has(anchorAtomId)||countries.size!==cfg[4].length||
     (label==='guangdong'&&sourceIds.some(i=>source.get(i).country==='CHN'&&i!=='CHN-1180'))){
   throw new Error('Selected gameplay area or physical anchor mismatch: '+label);
  }
  while(pending.size){
   const start=pending.values().next().value,connected=[start];pending.delete(start);
   for(const atom of connected)for(const i of source.get(atom).neighbors){
    const other=base.provinces[i]?.id;
    if(pending.delete(other))connected.push(other);
   }
   checked.push(connected.sort());
  }
  const signature=parts=>parts.map(p=>JSON.stringify([...p].sort())).sort();
  if(JSON.stringify(signature(components))!==JSON.stringify(signature(checked))){
   throw new Error('Changed real island components: '+label);
  }
  const links=checked.filter(p=>!p.includes(anchorAtomId)).map(p=>[p[0],anchorAtomId]);
  return {...core,sourceIds,displayName,anchorAtomId,reason:'user-reviewed-island-region',
    ...(links.length?{islandAttachments:links}:{}),...(searchAliases?.length?{searchAliases}:{})};
 });
 if(consumed.size!==30||assigned.size!==83)throw new Error('Missing selected gameplay or source areas');
 return [...groups.filter(g=>!consumed.has(g.id)),...out].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
}
