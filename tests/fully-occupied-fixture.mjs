// Synthetic acceptance load, not evidence of an organically played campaign.
import {Engine,createGame} from '../src/game/engine.ts';
import {makeAISetups} from '../src/game/spawns.ts';
import {BOUNDS,MAP,provinceByCode} from '../src/game/map.ts';
import {stats,UNITS} from '../src/game/content.ts';
import {reconcileGrouping} from '../src/game/territoryEconomy.ts';

export const FULLY_OCCUPIED_UNIT_TARGET=5200;

export function createFullyOccupiedFixture(seed=77){
 const state=createGame([{name:'Performance Commander',leader:'warden',loadout:['infantry']},...makeAISetups(100,seed)],seed,`full-map-100-ai-${seed}`);
 const capitals=state.players.map(player=>state.provinces.find(p=>p.owner===player.id).id),width=BOUNDS.right-BOUNDS.left;
 const distance=(id,home)=>{const center=MAP[id].center,origin=MAP[home].center,dx=Math.abs(center.x-origin.x);return Math.min(dx,width-dx)**2+(center.z-origin.z)**2;};
 // Seed the original legal garrison positions before distributing the seats.
 for(const p of state.provinces)if(MAP[p.id].playable){
  if(p.owner<0){let nearest=Infinity;for(const [owner,id] of capitals.entries()){const d=distance(p.id,id);if(d<nearest){nearest=d;p.owner=owner;}}}
  p.kind=state.players[p.owner].loadout[0];
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
 // After production, distribute the same 5,200 troops and regions. Seats take
 // turns claiming nearby land, with an ordinary fortress on their first two.
 const remaining=new Set(MAP.filter(p=>p.playable).map(p=>p.id));
 function assign(id,owner,fortified){
  const province=prepared.provinces[id];
  province.owner=owner;province.kind=prepared.players[owner].loadout[0];
  if(fortified)province.construction={kind:'fortress',level:2};
  remaining.delete(id);
 }
 capitals.forEach((id,owner)=>assign(id,owner,true));
 for(let round=0;remaining.size;round++)for(const [owner,home] of capitals.entries()){
  if(!remaining.size)break;
  let nearest=Infinity,best;
  for(const id of remaining){const d=distance(id,home);if(d<nearest){nearest=d;best=id;}}
  assign(best,owner,round===0);
 }
 for(const u of prepared.units){const p=prepared.provinces[u.province];u.owner=p.owner;u.kind=p.kind;u.hp=stats(prepared.players[u.owner],u.kind).hp;}
 prepared.topology++;prepared.grouping=reconcileGrouping(prepared);
 return {state:prepared,canvas:{selectedRegion:provinceByCode('DEU-3487')}};
}
