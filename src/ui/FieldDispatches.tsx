import type {CSSProperties} from 'react';
import {factionTextColor} from '../game/factionColors.ts';
import {MAP} from '../game/map.ts';
import type {GameEvent, GameState} from '../game/types.ts';
import {Icon, type IconName} from './icons.tsx';
import {playerName, t, timeLabel, type Language} from './i18n.ts';

const EVENT_ICONS: Record<GameEvent['key'], IconName> = {capture: 'banner', level: 'rank', victory: 'crown'};

/** The newest four dispatches as a notification feed. Rows share one time
 * column; a named region jumps the camera there. */
export function FieldDispatches({events, players, language, onRegion}: Pick<GameState, 'events' | 'players'> & {language: Language; onRegion?: (id: number) => void}) {
 const recent = events.slice(-4).reverse();
 // All rows share a time column, including campaigns lasting over 99 minutes.
 const timeWidth = Math.max(5, ...recent.map(event => timeLabel(event.tick).length)) + .5;
 return <section className="dispatches" aria-labelledby="dispatch-heading">
  <h3 id="dispatch-heading"><Icon name="scroll" size={15}/>{t(language, 'latest')}</h3>
  {recent.length ? <ol className="dispatch-list" style={{'--dispatch-time-width': `${timeWidth}ch`} as CSSProperties}>
   {recent.map((event, index) => <li className="dispatch-entry" key={`${event.tick}-${index}`} data-event={event.key}>
    <time className="dispatch-time" dateTime={`PT${Math.floor(event.tick / 20)}S`}>{timeLabel(event.tick)}</time>
    <span className="dispatch-icon" aria-hidden="true"><Icon name={EVENT_ICONS[event.key] ?? 'scroll'} size={14}/></span>
    <div className="dispatch-content">
     <bdi className="dispatch-player" style={{color: factionTextColor(event.player)}}>{playerName(language, players[event.player])}</bdi>
     <span className="dispatch-event">{t(language, `event.${event.key}`)}{event.province !== undefined && <> {onRegion
      ? <button type="button" className="dispatch-region" onClick={() => onRegion(event.province!)}>{MAP[event.province].name[language === 'zh' ? 0 : 1]}</button>
      : <bdi className="dispatch-region">{MAP[event.province].name[language === 'zh' ? 0 : 1]}</bdi>}</>}</span>
    </div>
   </li>)}
  </ol> : <p className="dispatch-empty">{t(language, 'noEvents')}</p>}
 </section>;
}
