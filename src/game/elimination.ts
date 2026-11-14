import { MAP } from './map.ts';
import type { GameState } from './types.ts';

// Derived from territory rather than independent saved flags.
export function isEliminated(state:GameState,actor:number):boolean {
  return !!state.players[actor]&&!state.provinces.some(p=>MAP[p.id].playable&&p.owner===actor);
}
export function settleEliminations(state:GameState):void {
  const alive=new Set(state.provinces.filter(p=>MAP[p.id].playable&&p.owner>=0).map(p=>p.owner));
  state.units=state.units.filter(u=>u.owner<0||alive.has(u.owner));
  for(const p of state.provinces)if(p.captor>=0&&!alive.has(p.captor)){p.captor=-1;p.capture=0;}
  for(const p of state.players)if(!alive.has(p.id))state.domination[p.id]=0;
}
