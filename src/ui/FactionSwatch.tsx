import type {CSSProperties} from 'react';
import {factionColor} from '../game/factionColors.ts';
import {factionFlag} from '../game/factionFlags.ts';
import type {GameState} from '../game/types.ts';
import {FlagImage} from './Flag.tsx';
import type {Language} from './i18n.ts';

/** A faction's flag in miniature over a strip of its map colour, so the banner
 * can always be matched to the territory it holds. Decorative: the faction's
 * name is written next to it. */
export function FactionSwatch({state, id, language, className}: {state: GameState; id: number; language: Language; className?: string}) {
 const flag = factionFlag(state.players, id);
 return <span className={className ? `faction-swatch ${className}` : 'faction-swatch'} style={{'--faction': factionColor(id)} as CSSProperties} aria-hidden="true">
  {flag && <FlagImage flag={flag} language={language} cloth={false}/>}
 </span>;
}
