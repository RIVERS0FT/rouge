import { MAX_LEADER_LEVEL, experienceForLevel } from '../game/content.ts';
import type { Player } from '../game/types.ts';

/** A seat is an in-game country, not necessarily a modern or historical country. */
export function commanderIdentity(actor:number) {
  const valid=Number.isSafeInteger(actor)&&actor>=0;
  return {actor:valid?actor:null,home:null,
    names:valid?[`国家 ${actor+1}`,`Country ${actor+1}`]:['未知国家','Unknown country']};
}

export function leaderProgress(player: Pick<Player, 'level' | 'xp'>) {
  const maximum = experienceForLevel(player.level);
  const complete = player.level >= MAX_LEADER_LEVEL;
  const value = complete ? maximum : Math.max(0, Math.min(maximum, player.xp));
  return { maximum, value, percent: value / maximum * 100, complete };
}
