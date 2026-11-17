import pacific from '../data/pacific-gameplay-regions.json' with {type:'json'};
import indian from '../data/indian-ocean-gameplay-regions.json' with {type:'json'};
import atlantic from '../data/atlantic-gameplay-regions.json' with {type:'json'};
const plans=[pacific,indian,atlantic];

const entries=plan=>plan.regions.flatMap(row=>Object.values(row.members).flat().map(id=>[id,row]));
const bySource=new Map(plans.flatMap(entries));
const indianIds=new Set(entries(indian).map(([id])=>id));
const atlanticIds=new Set(entries(atlantic).map(([id])=>id));
export const isIndianOceanBatch=id=>indianIds.has(id);
export const isAtlanticBatch=id=>atlanticIds.has(id);
export const oceanScopeOf=id=>bySource.get(id);
export const isReviewedOceanBatch=id=>bySource.has(id);
export const finalRegionCount=884-plans.flatMap(plan=>plan.regions).reduce((n,row)=>n+Object.keys(row.members).length-1,0);
export const finalPlayableCount=finalRegionCount-4;
