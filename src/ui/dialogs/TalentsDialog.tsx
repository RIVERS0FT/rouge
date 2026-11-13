import type {Player} from '../../game/types.ts';
import {leaderProgress} from '../commanderIdentity.ts';
import {LeaderBust} from '../LeaderBust.tsx';
import {Icon} from '../icons.tsx';
import {t, type Language} from '../i18n.ts';

const SYMBOLS = ['✧', '⌁', '◇'];

/** Leader talents as an event window: the commander's portrait and progress on
 * the left, three option cards to choose from, and earned talents below. */
export function TalentsDialog({player, eliminated, pending, language, onChoose, onReroll}: {
 player: Player; eliminated: boolean; pending: boolean; language: Language; onChoose: (id: string) => void; onReroll: () => void;
}) {
 const text = (key: string) => t(language, key), progress = leaderProgress(player);
 return <>
  <div className="talent-hero">
   <div className="talent-portrait"><LeaderBust leader={player.leader} label={text(player.leader)}/></div>
   <div className="talent-hero-copy">
    <span className="window-kicker">{text(player.leader)}</span>
    <p className="talent-lede">{text('talentTitle')}</p>
    <div className="talent-level">
     <span><Icon name="rank" size={15}/>{text('level')} {player.level}/8</span>
     <span>{progress.complete ? text('max') : `${Math.floor(progress.value)}/${progress.maximum} ${text('experience')}`}</span>
    </div>
    <div className="progress progress-gold" aria-hidden="true"><i style={{width: `${progress.percent}%`}}/></div>
   </div>
  </div>
  {player.choices.length ? <>
   <div className="talent-grid">{player.choices.map((id, index) => <button type="button" className="talent-card" key={id} disabled={eliminated || pending} onClick={() => onChoose(id)}>
    <span className="talent-number">0{index + 1}</span>
    <div className="talent-symbol" aria-hidden="true">{SYMBOLS[index] ?? '✧'}</div>
    <h3>{text(id)}</h3>
    <p>{text(`${id}.desc`)}</p>
    <span className="talent-select">{text('select')} →</span>
   </button>)}</div>
   <div className="talent-actions">
    <button type="button" className="secondary" disabled={eliminated || player.rerolls === 0 || pending} onClick={onReroll}>{text('reroll')} · {player.rerolls}</button>
   </div>
  </> : <div className="empty-state">{text('level')} {player.level}/8 · {Math.floor(player.xp)}/{60 + player.level * 45} {text('experience')}</div>}
  {player.talents.length > 0 && <div className="chosen-talents">{player.talents.map(id => <span key={id} title={text(`${id}.desc`)}>✧ {text(id)}</span>)}</div>}
 </>;
}
