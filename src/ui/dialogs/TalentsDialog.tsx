import {useEffect,useState,type MutableRefObject} from 'react';
import {MAX_LEADER_LEVEL, TALENT_BY_ID, experienceForLevel} from '../../game/content.ts';
import {canRerollTalent,talentRerollCost} from '../../game/talentReroll.ts';
import {SAMPLE_BUILDS,formedBuilds} from '../../game/talentBuilds.ts';
import type {Player} from '../../game/types.ts';
import {leaderProgress} from '../commanderIdentity.ts';
import {LeaderBust} from '../LeaderBust.tsx';
import {Icon} from '../icons.tsx';
import {t, type Language} from '../i18n.ts';
import {talentDescription} from '../talentText.tsx';

const SYMBOLS = ['✧', '⌁', '◇'];

/** Leader talents as an event window: the commander's portrait and progress on
 * the left, three option cards to choose from, earned talents and the build codex below. */
export function TalentsDialog({player, campaign, seenRound, eliminated, pending, language, codex, onChoose, onReroll}: {
 player: Player; campaign: string; seenRound: MutableRefObject<string | null>; eliminated: boolean; pending: boolean;
 language: Language; codex: readonly string[]; onChoose: (id: string) => void; onReroll: (cost: number, keep?: string) => void;
}) {
 const text = (key: string) => t(language, key), progress = leaderProgress(player), rerollCost = talentRerollCost(player);
 // Progress and funds change on normal ticks; only an authoritative round changes this key.
 const round = JSON.stringify([campaign, player.id, player.talents.length, player.rerollsUsed, player.choices]);
 const [kept, setKept] = useState<{round: string; id: string} | null>(null);
 const keep = kept?.round === round && player.choices.includes(kept.id) ? kept.id : undefined;
 return <>
  <div className="talent-hero">
   <div className="talent-portrait"><LeaderBust leader={player.leader} label={text(player.leader)}/></div>
   <div className="talent-hero-copy">
    <span className="window-kicker">{text(player.leader)}</span>
    <p className="talent-lede">{text('talentTitle')}</p>
    <div className="talent-level">
     <span><Icon name="rank" size={15}/>{text('level')} {player.level}/{MAX_LEADER_LEVEL}</span>
     <span>{progress.complete ? text('max') : `${Math.floor(progress.value)}/${progress.maximum} ${text('experience')}`}</span>
    </div>
    <div className="progress progress-gold" aria-hidden="true"><i style={{width: `${progress.percent}%`}}/></div>
   </div>
  </div>
  {player.choices.length ? <>
   <TalentDraftCards key={round} round={round} seenRound={seenRound} choices={player.choices} disabled={eliminated || pending} language={language}
    keep={keep} onChoose={onChoose} onKeep={id => setKept(keep === id ? null : {round, id})}/>
   <div className="talent-actions">
    <button type="button" className="secondary" data-testid="reroll-talents" disabled={eliminated || pending || player.funds < rerollCost || !canRerollTalent(player, keep)} onClick={() => onReroll(rerollCost, keep)}>{text('reroll')} · {text('talentRerollFunds').replace('{cost}', String(rerollCost))}</button>
    {keep && <span className="talent-keep-hint" data-testid="talent-keep-hint">{text('talentKeepHint').replace('{name}', text(keep))}</span>}
   </div>
  </> : <div className="empty-state">{text('level')} {player.level}/{MAX_LEADER_LEVEL} · {Math.floor(player.xp)}/{experienceForLevel(player.level)} {text('experience')}</div>}
  {player.talents.length > 0 && <div className="chosen-talents">{player.talents.map(id => <span key={id} title={text(`${id}.desc`)}>✧ {text(id)}</span>)}</div>}
  <TalentCodex codex={codex} talents={player.talents} language={language}/>
 </>;
}

function TalentTags({id, language}: {id: string; language: Language}) {
 const talent = TALENT_BY_ID.get(id), text = (key: string) => t(language, key);
 if(!talent?.kinds && !talent?.tradeoff) return null;
 return <span className="talent-tags">
  {talent.kinds && <span className="talent-tag signature">{text('talentSignature').replace('{kind}', text(talent.kinds[0]))}</span>}
  {talent.tradeoff && <span className="talent-tag tradeoff">{text('talentTradeoff')}</span>}
 </span>;
}

function TalentDraftCards({round, seenRound, choices, disabled, language, keep, onChoose, onKeep}: {
 round: string; seenRound: MutableRefObject<string | null>; choices: string[]; disabled: boolean;
 language: Language; keep: string | undefined; onChoose: (id: string) => void; onKeep: (id: string) => void;
}) {
 const [reveal] = useState(() => seenRound.current !== round);
 useEffect(() => {seenRound.current = round;}, [round, seenRound]);
 const text = (key: string) => t(language, key);
 return <div className="talent-grid" data-reveal={reveal}>{choices.map((id, index) => <div className="talent-slot" key={id}>
  <button type="button" className="talent-card" disabled={disabled} onClick={() => onChoose(id)}>
   <span className="talent-card-turn">
    <span className="talent-card-front">
     <span className="talent-number">0{index + 1}</span>
     <TalentTags id={id} language={language}/>
     <span className="talent-symbol" aria-hidden="true">{SYMBOLS[index] ?? '✧'}</span>
     <h3>{text(id)}</h3>
     <p>{talentDescription(text(`${id}.desc`), language)}</p>
     <span className="talent-select">{text('select')} →</span>
    </span>
    {reveal && <span className="talent-card-back" aria-hidden="true"><span className="talent-card-seal">✧</span></span>}
   </span>
  </button>
  <button type="button" className={`talent-keep ${keep === id ? 'kept' : ''}`} aria-pressed={keep === id} disabled={disabled}
   data-testid={`keep-talent-${index}`} onClick={() => onKeep(id)}>
   <Icon name="lock" size={13}/>{text(keep === id ? 'talentKept' : 'talentKeep')}
  </button>
 </div>)}</div>;
}

/** Discovered sample builds stay listed across campaigns; undiscovered ones stay hidden. */
function TalentCodex({codex, talents, language}: {codex: readonly string[]; talents: readonly string[]; language: Language}) {
 const text = (key: string) => t(language, key), formed = formedBuilds(talents);
 const known = SAMPLE_BUILDS.filter(build => codex.includes(build.id) || formed.includes(build.id)).length;
 return <section className="talent-codex" data-testid="talent-codex" aria-label={text('codexTitle')}>
  <h4>{text('codexTitle')}<small>{text('codexProgress').replace('{found}', String(known)).replace('{total}', String(SAMPLE_BUILDS.length))}</small></h4>
  <div className="codex-grid">{SAMPLE_BUILDS.map(build => {
   const isFormed = formed.includes(build.id), isKnown = isFormed || codex.includes(build.id);
   return <article key={build.id} className={`codex-entry${isKnown ? ' known' : ''}${isFormed ? ' formed' : ''}`} data-testid={`codex-${build.id}`}>
    {isKnown ? <>
     <b>{text(`build.${build.id}`)}{isFormed && <em>{text('codexFormed')}</em>}</b>
     <small>{build.cards.map(id => text(id)).join(' + ')}{build.need < build.cards.length ? ` · ${text('codexAny').replace('{count}', String(build.need))}` : ''}</small>
     <p>{text(`build.${build.id}.desc`)}</p>
    </> : <><b>？？？</b><small>{text('codexHidden')}</small></>}
   </article>;
  })}</div>
  <p className="codex-hint">{text('codexHint')}</p>
 </section>;
}
