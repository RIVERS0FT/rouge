import {useEffect,useState,type MutableRefObject} from 'react';
import {canRerollTalent,talentRerollCost,talentRerollsUsed} from '../../game/talentReroll.ts';
import type {Player} from '../../game/types.ts';
import {leaderProgress} from '../commanderIdentity.ts';
import {LeaderBust} from '../LeaderBust.tsx';
import {Icon} from '../icons.tsx';
import {t, type Language} from '../i18n.ts';

const SYMBOLS = ['✧', '⌁', '◇'];

/** Leader talents as an event window: the commander's portrait and progress on
 * the left, three option cards to choose from, and earned talents below. */
export function TalentsDialog({player, campaign, seenRound, eliminated, pending, language, onChoose, onReroll}: {
 player: Player; campaign: string; seenRound: MutableRefObject<string | null>; eliminated: boolean; pending: boolean;
 language: Language; onChoose: (id: string) => void; onReroll: (cost: number) => void;
}) {
 const text = (key: string) => t(language, key), progress = leaderProgress(player), rerollCost = talentRerollCost(player);
 // Progress and gold change on normal ticks; only an authoritative round changes this key.
 const round = JSON.stringify([campaign, player.id, player.talents.length, talentRerollsUsed(player), player.choices]);
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
   <TalentDraftCards key={round} round={round} seenRound={seenRound} choices={player.choices} disabled={eliminated || pending} language={language} onChoose={onChoose}/>
   <div className="talent-actions">
    <button type="button" className="secondary" data-testid="reroll-talents" disabled={eliminated || pending || player.gold < rerollCost || !canRerollTalent(player)} onClick={() => onReroll(rerollCost)}>{text('reroll')} · {text('talentRerollGold').replace('{cost}', String(rerollCost))}</button>
   </div>
  </> : <div className="empty-state">{text('level')} {player.level}/8 · {Math.floor(player.xp)}/{60 + player.level * 45} {text('experience')}</div>}
  {player.talents.length > 0 && <div className="chosen-talents">{player.talents.map(id => <span key={id} title={text(`${id}.desc`)}>✧ {text(id)}</span>)}</div>}
 </>;
}


function TalentDraftCards({round, seenRound, choices, disabled, language, onChoose}: {
 round: string; seenRound: MutableRefObject<string | null>; choices: string[]; disabled: boolean;
 language: Language; onChoose: (id: string) => void;
}) {
 const [reveal] = useState(() => seenRound.current !== round);
 useEffect(() => {seenRound.current = round;}, [round, seenRound]);
 const text = (key: string) => t(language, key);
 return <div className="talent-grid" data-reveal={reveal}>{choices.map((id, index) => <button type="button" className="talent-card" key={id} disabled={disabled} onClick={() => onChoose(id)}>
  <span className="talent-card-turn">
   <span className="talent-card-front">
    <span className="talent-number">0{index + 1}</span>
    <span className="talent-symbol" aria-hidden="true">{SYMBOLS[index] ?? '✧'}</span>
    <h3>{text(id)}</h3>
    <p>{text(`${id}.desc`)}</p>
    <span className="talent-select">{text('select')} →</span>
   </span>
   {reveal && <span className="talent-card-back" aria-hidden="true"><span className="talent-card-seal">✧</span></span>}
  </span>
 </button>)}</div>;
}
