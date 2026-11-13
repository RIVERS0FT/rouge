import type {GameState} from '../../game/types.ts';
import {PLAYABLE_COUNT} from '../../game/map.ts';
import {factionFlag} from '../../game/factionFlags.ts';
import {FlagImage} from '../Flag.tsx';
import {Icon} from '../icons.tsx';
import {t, timeLabel, playerName, type Language} from '../i18n.ts';

/** End-of-campaign proclamation. It cannot be dismissed into a finished match. */
export function VictoryOverlay({state, actor, owned, language, onLeave}: {state: GameState; actor: number; owned: number; language: Language; onLeave: () => void}) {
 const text = (key: string) => t(language, key), winner = state.players[state.winner!], won = state.winner === actor, flag = factionFlag(state.players, winner.id);
 return <div className="modal-backdrop">
  <section className="modal result-modal" role="dialog" aria-modal="true" aria-label={text(won ? 'victory' : 'defeat')} data-outcome={won ? 'victory' : 'defeat'}>
   <header className="window-band"><span className="window-kicker">{text('winner')}</span><h2>{text(won ? 'victory' : 'defeat')}</h2></header>
   <div className="modal-body">
    <div className="result-emblem" aria-hidden="true">{flag ? <FlagImage flag={flag} language={language}/> : <Icon name="crown" size={56}/>}</div>
    <div className="eyebrow gold">{text('winner')} / {playerName(language, winner)}</div>
    <dl className="result-stats">
     <div><dt>{text('campaignTime')}</dt><dd>{timeLabel(state.tick)}</dd></div>
     <div><dt>{text('territory')}</dt><dd>{owned}/{PLAYABLE_COUNT}</dd></div>
     <div><dt>{text('talents')}</dt><dd>{state.players[actor].talents.length}</dd></div>
    </dl>
    <button type="button" className="primary" onClick={onLeave}>{text('returnMenu')} →</button>
   </div>
  </section>
 </div>;
}

export function EliminationBody({language, onSpectate, onLeave}: {language: Language; onSpectate: () => void; onLeave: () => void}) {
 const text = (key: string) => t(language, key);
 return <div data-testid="elimination-result">
  <div className="result-emblem" aria-hidden="true"><Icon name="banner" size={52}/></div>
  <h2>{text('eliminatedTitle')}</h2>
  <p>{text('eliminatedDescription')}</p>
  <div className="elimination-actions">
   <button type="button" className="primary" data-testid="spectate-match" onClick={onSpectate}>{text('spectate')}</button>
   <button type="button" className="secondary" data-testid="eliminated-return-menu" onClick={onLeave}>{text('returnMenu')}</button>
  </div>
 </div>;
}
