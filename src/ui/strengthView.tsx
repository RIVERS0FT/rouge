import {factionColor, NEUTRAL_LAND_COLOR} from '../game/factionColors.ts';
import {STRENGTH_PER_INFANTRY, verdict, type Verdict} from '../game/strength.ts';
import type {GameState} from '../game/types.ts';
import {FactionSwatch} from './FactionSwatch.tsx';
import {t, playerName, type Language} from './i18n.ts';

export const sideColor = (owner: number) => owner < 0 ? NEUTRAL_LAND_COLOR : factionColor(owner);
/** A side's flag; neutral garrisons have none, so they get the neutral land colour, hatched. */
export function SideFlag({state, owner, language, className}: {state: GameState; owner: number; language: Language; className: string}) {
 return owner < 0 ? <span className={`faction-swatch ${className} side-flag-neutral`} style={{backgroundColor: NEUTRAL_LAND_COLOR}} aria-hidden="true"/>
  : <FactionSwatch state={state} id={owner} language={language} className={className}/>;
}
export const sideName = (state: GameState, owner: number, language: Language) =>
 owner < 0 || !state.players[owner] ? t(language, 'neutralSide') : playerName(language, state.players[owner]);
export const strengthHint = (language: Language) => t(language, 'strengthHint').replace('{base}', String(STRENGTH_PER_INFANTRY));
export const strengthUnit = (language: Language) => t(language, 'strengthUnit').replace('{base}', String(STRENGTH_PER_INFANTRY));
export const formatStrength = (power: number) => Math.round(power).toLocaleString();

/** Stacked strength shares of the sides of a fight (or of two countries), in their map colours. */
export function PowerBar({sides, state, language, className = ''}: {
 sides: readonly {owner: number; power: number}[]; state: GameState; language: Language; className?: string;
}) {
 const total = sides.reduce((sum, side) => sum + side.power, 0);
 const label = sides.map(side => `${sideName(state, side.owner, language)} ${formatStrength(side.power)}`).join(' · ');
 return <span className={`power-bar ${className}`} role="img" aria-label={`${t(language, 'strength')}: ${label}`}>
  {sides.map(side => <i key={side.owner} data-owner={side.owner} title={`${sideName(state, side.owner, language)} · ${formatStrength(side.power)}`}
   style={{width: `${total > 0 ? side.power / total * 100 : 100 / sides.length}%`, background: sideColor(side.owner)}}/>)}
 </span>;
}

/** How one side stands against another, as a verdict and words. `mine`/`theirs` are powers;
 * `speaker` 'you' reads "You lead ×1.6", 'third' reads "Ahead ×1.6" for any country. */
export function standing(mine: number, theirs: number, language: Language, speaker: 'you' | 'third'): {verdict: Verdict; label: string} {
 const text = (key: string) => t(language, key);
 if(mine <= 0 && theirs <= 0) return {verdict: 'even', label: text(speaker === 'you' ? 'verdictEven' : 'battleEven')};
 if(theirs <= 0) return {verdict: 'ahead', label: text(speaker === 'you' ? 'noTroopsThem' : 'battleAhead')};
 if(mine <= 0) return {verdict: 'behind', label: text(speaker === 'you' ? 'noTroopsYou' : 'battleBehind')};
 const ratio = mine / theirs, result = verdict(ratio);
 const times = (value: number) => value.toFixed(1);
 if(result === 'even') return {verdict: result, label: text(speaker === 'you' ? 'verdictEven' : 'battleEven')};
 if(speaker === 'you') return {verdict: result, label: text(result === 'ahead' ? 'verdictAhead' : 'verdictBehind').replace('{ratio}', times(result === 'ahead' ? ratio : 1 / ratio))};
 return {verdict: result, label: `${text(result === 'ahead' ? 'battleAhead' : 'battleBehind')} ×${times(result === 'ahead' ? ratio : 1 / ratio)}`};
}
