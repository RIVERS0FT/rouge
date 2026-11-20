import { MAP } from './map.ts';
import type { GameState } from './types.ts';

// Derived from territory rather than independent saved flags.
export function isEliminated(state:GameState,actor:number):boolean {
  return !!state.players[actor]&&!state.provinces.some(p=>MAP[p.id].playable&&p.owner===actor);
}
export function settleEliminations(state:GameState):Map<number,number> {
  const owned=new Map<number,number>();
  for(const p of state.provinces)if(p.owner>=0&&MAP[p.id].playable)owned.set(p.owner,(owned.get(p.owner)??0)+1);
  if(state.units.some(u=>u.owner>=0&&!owned.has(u.owner)))state.units=state.units.filter(u=>u.owner<0||owned.has(u.owner));
  for(const p of state.provinces)if(p.captor>=0&&!owned.has(p.captor)){p.captor=-1;p.capture=0;}
  for(const p of state.players)if(!owned.has(p.id))state.domination[p.id]=0;
  return owned;
}
