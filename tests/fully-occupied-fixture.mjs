// Synthetic acceptance load, not evidence of an organically played campaign.
import {createGame} from '../src/game/engine.ts';
import {makeAISetups} from '../src/game/spawns.ts';
import {BOUNDS,MAP,provinceByCode} from '../src/game/map.ts';
import {stats} from '../src/game/content.ts';
import {reconcileGrouping} from '../src/game/territoryEconomy.ts';

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
 return {state,canvas:{selectedRegion:provinceByCode('DEU-3487')}};
}
