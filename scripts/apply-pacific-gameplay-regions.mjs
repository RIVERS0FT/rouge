import {applyReviewedStateIslands} from './apply-reviewed-state-islands.mjs';

export function applyPacificGameplayRegions(base,groups,plan,reference){
 return applyReviewedStateIslands(base,groups,plan,reference,{label:'Pacific',reason:'victoria-3-reviewed-pacific-region'});
}
