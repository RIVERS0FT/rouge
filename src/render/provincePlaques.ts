import {isRegionGarrison} from '../game/capacity.ts';
import type {GameState, Vec2} from '../game/types.ts';

type PlaqueRegion = {id:number;code:string;visible:boolean;playable:boolean;name:readonly [string,string];center:Vec2};
export type PlaqueTerritory = {id:number;members:number[];anchor:Vec2;name:readonly [string,string]};

/** Keep the anchor on the largest playable member; its map anchor is already
 * inside the region, even when the merged outline is concave or has islands. */
export function plaqueTerritories(regions:readonly PlaqueRegion[],grouping:GameState['grouping'],areas:readonly number[]):PlaqueTerritory[] {
 const byGroup=new Map<string,PlaqueTerritory>();
 for(const region of regions){
  if(!region.visible||!region.playable)continue;
  const {id,code,center:anchor,name}=region,group=grouping.atomToGroup[code]??`region:${id}`,territory=byGroup.get(group);
  if(!territory){byGroup.set(group,{id,members:[id],anchor,name});continue;}
  territory.members.push(id);
  if(areas[id]>areas[territory.id]||(areas[id]===areas[territory.id]&&id<territory.id)){
   territory.id=id;territory.anchor=anchor;territory.name=name;
  }
 }
 return [...byGroup.values()];
}

/** Same garrison predicate as the details panel. Count all regions in one pass. */
export function plaqueGarrisons(state:Pick<GameState,'provinces'|'units'>):Uint32Array {
 const counts=new Uint32Array(state.provinces.length);
 for(const unit of state.units){
  const province=state.provinces[unit.province];
  if(province&&isRegionGarrison(unit,province.owner,province.id))counts[province.id]++;
 }
 return counts;
}
