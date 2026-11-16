import plan from '../data/southeast-asia-gameplay-regions.json' with {type:'json'};
const touched=new Set(plan.regions.flatMap(row=>Object.values(row.groups).flat()));
export const isSeaBatch=id=>touched.has(id);
import next from '../data/asia-arabia-gameplay-regions.json' with {type:'json'};
const latest=new Set(next.regions.flatMap(row=>Object.values(row.groups).flat()));
export const isAsiaArabia=id=>latest.has(id);
export const isSeaOrAsiaArabia=id=>isSeaBatch(id)||isAsiaArabia(id);
