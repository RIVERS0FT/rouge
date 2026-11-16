// Synthetic acceptance load, not evidence of an organically played campaign.
import {Engine,createGame} from '../src/game/engine.ts';
import {makeAISetups} from '../src/game/spawns.ts';
import {BOUNDS,MAP,provinceByCode} from '../src/game/map.ts';
import {stats,UNITS} from '../src/game/content.ts';
import {reconcileGrouping} from '../src/game/territoryEconomy.ts';

export const FULLY_OCCUPIED_UNIT_TARGET=5200;

export function createFullyOccupiedFixture(seed=77){
 const state=createGame([{name:'Performance Commander',leader:'warden',loadout:['infantry']},...makeAISetups(100,seed)],seed,`full-map-100-ai-${seed}`);
 const origins=state.players.map(player=>MAP[state.provinces.find(p=>p.owner===player.id).id].center),width=BOUNDS.right-BOUNDS.left;
 // Expand each existing seat to its nearest provinces. Keep contiguous-looking
 // countries rather than manufacturing a checkerboard of maximum borders.
 for(const province of state.provinces){
  if(!MAP[province.id].playable)continue;
  if(province.owner<0){
   const center=MAP[province.id].center;let nearest=Infinity;
   for(const [owner,origin] of origins.entries()){
    const dx=Math.abs(center.x-origin.x),distance=Math.min(dx,width-dx)**2+(center.z-origin.z)**2;
    if(distance<nearest){nearest=distance;province.owner=owner;}
   }
  }
  province.kind=state.players[province.owner].loadout[0];
 }
 // Retain the engine's legal, separated starting positions and all garrisons.
 // Production, movement, combat and AI then run through the ordinary worker.
 for(const unit of state.units){
  const province=state.provinces[unit.province];
  unit.owner=province.owner;unit.kind=province.kind;unit.hp=stats(state.players[unit.owner],unit.kind).hp;
 }
 state.topology++;state.grouping=reconcileGrouping(state);
 // Keep the synthetic performance workload independent of map-region count.
 // Use actual production for legal, collision-aware positions and unit IDs.
 const engine=new Engine(state),prepared=engine.state;
 for(let pass=0;pass<4&&prepared.units.length<FULLY_OCCUPIED_UNIT_TARGET;pass++){
  for(const p of prepared.provinces)if(p.owner>=0)p.production=UNITS[p.kind].train;
  engine.step();
 }
 if(prepared.units.length<FULLY_OCCUPIED_UNIT_TARGET)throw new Error('Could not construct the full synthetic performance workload');
 prepared.units.length=FULLY_OCCUPIED_UNIT_TARGET;
 return {state:prepared,canvas:{selectedRegion:provinceByCode('DEU-3487')}};
}
