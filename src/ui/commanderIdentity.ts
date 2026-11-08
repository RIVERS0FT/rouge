import { MAP, STARTS } from '../game/map.ts';
import type { Player } from '../game/types.ts';

export const FLAG_SPECS = {
  DEU: { names: ['德国', 'Germany'], width: 5, height: 3, axis: 'horizontal', colors: ['#000000', '#DD0000', '#FFCE00'] },
  FRA: { names: ['法国', 'France'], width: 3, height: 2, axis: 'vertical', colors: ['#000091', '#FFFFFF', '#E1000F'] },
  POL: { names: ['波兰', 'Poland'], width: 8, height: 5, axis: 'horizontal', colors: ['#FFFFFF', '#DC143C'] },
} as const;
export type FlagCode = keyof typeof FLAG_SPECS;
export function isFlagCode(code: string): code is FlagCode {
  return Object.prototype.hasOwnProperty.call(FLAG_SPECS, code);
}

/** The v4 map has fixed spawn seats, not selectable national factions. Never infer
 * allegiance from the selected/last-owned province: conquest must not change the flag. */
export function commanderIdentity(actor: number) {
  const start = Number.isInteger(actor) && actor >= 0 ? MAP[STARTS[actor]] : undefined;
  const country = start?.country ?? '';
  return { country, home: start?.id ?? null,
    names: isFlagCode(country) ? FLAG_SPECS[country].names : [start?.countryName ?? '未知势力', start?.countryName ?? 'Unknown faction'] as const };
}

export function leaderProgress(player: Pick<Player, 'level' | 'xp'>) {
  const maximum = 60 + player.level * 45;
  const complete = player.level >= 8;
  const value = complete ? maximum : Math.max(0, Math.min(maximum, player.xp));
  return { maximum, value, percent: value / maximum * 100, complete };
}
