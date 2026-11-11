import type {CSSProperties} from 'react';
import type {GameState} from '../game/types.ts';
import {MAP} from '../game/map.ts';
import {factionTextColor} from '../game/factionColors.ts';
import {playerName,t,timeLabel,type Language} from './i18n.ts';

export function FieldDispatches({events,players,language}:Pick<GameState,'events'|'players'>&{language:Language}){
 const recent=events.slice(-4).reverse();
 // All rows share a time column, including campaigns lasting over 99 minutes.
 const timeWidth=Math.max(5,...recent.map(event=>timeLabel(event.tick).length))+.5;
 return <section className="dispatches" aria-labelledby="dispatch-heading">
  <h3 id="dispatch-heading">{t(language,'latest')}</h3>
  {recent.length?<ol className="dispatch-list" style={{'--dispatch-time-width':`${timeWidth}ch`} as CSSProperties}>
   {recent.map((event,index)=><li className="dispatch-entry" key={`${event.tick}-${index}`}>
    <time className="dispatch-time" dateTime={`PT${Math.floor(event.tick/20)}S`}>{timeLabel(event.tick)}</time>
    <div className="dispatch-content">
     <bdi className="dispatch-player" style={{color:factionTextColor(event.player)}}>{playerName(language,players[event.player])}</bdi>
     <span className="dispatch-event">{t(language,`event.${event.key}`)}{event.province!==undefined&&<> <bdi className="dispatch-region">{MAP[event.province].name[language==='zh'?0:1]}</bdi></>}</span>
    </div>
   </li>)}
  </ol>:<p className="dispatch-empty">{t(language,'noEvents')}</p>}
 </section>;
}
