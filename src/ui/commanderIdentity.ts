import type { Player } from '../game/types.ts';

/** A seat is an in-game country, not necessarily a modern or historical country. */
export function commanderIdentity(actor:number) {
  const valid=Number.isSafeInteger(actor)&&actor>=0;
  return {actor:valid?actor:null,home:null,
    names:valid?[`国家 ${actor+1}`,`Country ${actor+1}`]:['未知国家','Unknown country']};
}

export function leaderProgress(player: Pick<Player, 'level' | 'xp'>) {
  const maximum = 60 + player.level * 45;
  const complete = player.level >= 8;
  const value = complete ? maximum : Math.max(0, Math.min(maximum, player.xp));
  return { maximum, value, percent: value / maximum * 100, complete };
}
