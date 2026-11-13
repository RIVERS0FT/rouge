import {Icon} from '../icons.tsx';
import {t, timeLabel, type Language} from '../i18n.ts';
import {Tip, TipNote, TipTitle} from '../Tooltip.tsx';

export const SPEEDS = [1, 2] as const;

/** Campaign clock with the pause medallion and speed pips. Multiplayer shows the
 * connection instead, because a LAN match never pauses for one player. */
export function Clock({tick, solo, paused, speed, network, language, onPause, onSpeed}: {
 tick: number; solo: boolean; paused: boolean; speed: number; network: 'connected' | 'reconnecting'; language: Language;
 onPause: () => void; onSpeed: (speed: number) => void;
}) {
 const text = (key: string) => t(language, key);
 return <div className="hud-clock" data-paused={solo && paused}>
  <div className="clock-face">
   <span className="clock-label"><Icon name="hourglass" size={13}/>{solo ? text(paused ? 'paused' : 'campaignTime') : text('lanMatch')}</span>
   <time data-testid="game-clock" data-tick={tick}>{timeLabel(tick)}</time>
  </div>
  {solo ? <div className="clock-controls">
   <button type="button" className="clock-pause" data-testid="toggle-pause" onClick={onPause} title={`${text(paused ? 'resume' : 'pause')} · Space`} aria-label={text(paused ? 'resume' : 'pause')}>{paused ? '▶' : 'Ⅱ'}</button>
   <Tip as="div" className="speed-pips" content={<><TipTitle>{text('gameSpeed')}</TipTitle><TipNote>{text('speedOption').replace('{speed}', String(speed))}</TipNote></>}>
    {SPEEDS.map(value => <button type="button" key={value} aria-pressed={speed === value} aria-label={text('speedOption').replace('{speed}', String(value))} onClick={() => onSpeed(value)}>
     <span aria-hidden="true">{'›'.repeat(value)}</span>
    </button>)}
   </Tip>
  </div> : <small className={`connection ${network}`}>● {text(network)}</small>}
 </div>;
}
