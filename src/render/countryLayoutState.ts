import {growthCountryCurves,type CountryPlacement,type CountryPlacementCache} from './countryLabelPaths.ts';
export interface CountryLayoutResult {campaign:string;entries:[number,{members:string;placement:CountryPlacement}][]}
/** Worker replies are snapshots, not authority over a newer ownership state.
 * Structured clone also recreates unchanged objects: retain the committed identity. */
export function acceptCountryLayouts(campaign:string,members:ReadonlyMap<number,string>,cache:CountryPlacementCache,placements:Map<number,CountryPlacement>,result:CountryLayoutResult):void{
 if(result.campaign!==campaign)return;
 for(const [owner,entry] of result.entries){
  if(entry.members!==members.get(owner))continue;
  const current=cache.get(owner);
  if(current?.members===entry.members){
   if(!current.pendingGrowth||entry.placement.area<current.placement.area*2)continue;
   // The matching growth result is the only same-signature replacement allowed.
   // Include the foreground's safe paths too if worker snapshots took a different route.
   const placement={...entry.placement,curves:growthCountryCurves(current.placement.curves,entry.placement.curves)};
   cache.set(owner,{members:entry.members,placement});placements.set(owner,placement);
  }else{cache.set(owner,entry);placements.set(owner,entry.placement);}
 }
}
