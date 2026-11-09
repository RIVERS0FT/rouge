import type { Player } from '../game/types.ts';

/** A seat is a player faction, not a modern or historical country. */
export function commanderIdentity(actor:number) {
  const valid=Number.isInteger(actor)&&actor>=0&&actor<4;
  return {actor:valid?actor:null,home:null,
    names:valid?[`阵营 ${actor+1}`,`Faction ${actor+1}`]:['未知阵营','Unknown faction']};
}

export function leaderProgress(player: Pick<Player, 'level' | 'xp'>) {
  const maximum = 60 + player.level * 45;
  const complete = player.level >= 8;
  const value = complete ? maximum : Math.max(0, Math.min(maximum, player.xp));
  return { maximum, value, percent: value / maximum * 100, complete };
}
