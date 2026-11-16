import plan from '../data/pacific-gameplay-regions.json' with {type:'json'};

const bySource=new Map(plan.regions.flatMap(row=>Object.values(row.members).flat().map(id=>[id,row])));
export const pacificScopeOf=id=>bySource.get(id);
export const isPacificBatch=id=>bySource.has(id);
export const finalRegionCount=884-plan.regions.reduce((n,row)=>n+Object.keys(row.members).length-1,0);
export const finalPlayableCount=finalRegionCount-4;
