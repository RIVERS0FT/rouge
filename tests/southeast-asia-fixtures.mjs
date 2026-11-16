import plan from '../data/southeast-asia-gameplay-regions.json' with {type:'json'};
const touched=new Set(plan.regions.flatMap(row=>Object.values(row.groups).flat()));
export const isSeaBatch=id=>touched.has(id);
