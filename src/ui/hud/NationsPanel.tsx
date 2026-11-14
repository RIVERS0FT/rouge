import {useRef, useState} from 'react';
import {CONSTRUCTION_KINDS} from '../../game/construction.ts';
import type {GameState} from '../../game/types.ts';
import {FactionSwatch} from '../FactionSwatch.tsx';
import {Icon} from '../icons.tsx';
import {t, playerName, type Language} from '../i18n.ts';
import {DockPanel, SectionRibbon} from './DockPanel.tsx';
import {nationDetails, type FactionSummary} from './hudModel.ts';

/** Ranked nations and single-country details share the same dock. */
export function NationsPanel({state, actor, factions, language, onFocusNation, onClose}: {
 state: GameState; actor: number; factions: FactionSummary[]; language: Language; onFocusNation: (id: number) => void; onClose: () => void;
}) {
 const [selected, setSelected] = useState<number | null>(null);
 const body = useRef<HTMLDivElement>(null), scroll = useRef(0);
 const text = (key: string) => t(language, key);
 const nation = selected === null ? undefined : factions.find(faction => faction.id === selected);
 const player = nation ? state.players[nation.id] : undefined;
 const details = nation && player ? nationDetails(state, nation.id, actor) : undefined;
 const number = (value: number) => value.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US');
 function open(id: number) {
  scroll.current = body.current?.scrollTop ?? 0;
  setSelected(id);
  requestAnimationFrame(() => {
   if(body.current) body.current.scrollTop = 0;
   body.current?.querySelector<HTMLButtonElement>('[data-testid="nation-back"]')?.focus({preventScroll: true});
  });
 }
 function back() {
  setSelected(null);
  requestAnimationFrame(() => {
   if(body.current) body.current.scrollTop = scroll.current;
   body.current?.querySelector<HTMLButtonElement>(`[data-nation-id="${selected}"]`)?.focus({preventScroll: true});
  });
 }
 return <DockPanel id="nations-panel" className="nations-panel" bodyRef={body} kicker={text(nation ? 'nationDetails' : 'nations')}
  title={player ? <bdi>{playerName(language, player)}</bdi> : text('nationsTitle')} titleId="nations-title"
  leading={nation && <FactionSwatch state={state} id={nation.id} language={language} className="nation-swatch nation-detail-flag"/>}
  closeLabel={text('closePanel')} onClose={onClose}>
  {nation && player && details ? <div className="nation-detail" data-testid="nation-detail" data-nation={nation.id}>
   <div className="nation-actions">
    <button type="button" data-testid="nation-back" onClick={back}><Icon name="back" size={15}/>{text('nationBack')}</button>
    <button type="button" data-testid="nation-locate" disabled={nation.eliminated} onClick={() => onFocusNation(nation.id)}><Icon name="region" size={15}/>{text('nationLocate')}</button>
   </div>
   <div className="nation-tags">
    <span>{text(nation.id === actor ? 'youTag' : player.ai ? 'aiTag' : 'humanTag')}</span>
    {nation.eliminated && <span>{text('eliminatedTag')}</span>}
   </div>
   <dl className="nation-metrics">
    <div><dt>{text('territoryColumn')}</dt><dd data-testid="nation-territory">{number(nation.territory)}</dd></div>
    <div><dt>{text('nationLeaderLevel')}</dt><dd>{number(nation.level)}</dd></div>
   </dl>
   <SectionRibbon aside={number(details.army.total)}>{text('nationArmyTotal')}</SectionRibbon>
   <dl className="nation-metrics nation-rows">
    <div><dt>{text('garrison')}</dt><dd>{number(details.army.garrison)}</dd></div>
    <div><dt>{text('nationMarching')}</dt><dd>{number(details.army.marching)}</dd></div>
    <div><dt>{text('nationEmbarked')}</dt><dd>{number(details.army.embarked)}</dd></div>
   </dl>
   <SectionRibbon>{text('nationBuildings')}</SectionRibbon>
   <dl className="nation-metrics nation-rows">
    {CONSTRUCTION_KINDS.map(kind => <div key={kind}><dt>{text(`construction.${kind}`)}</dt><dd data-testid={`nation-building-${kind}`}>{number(details.buildings[kind])}</dd></div>)}
    {details.funds !== null && <div><dt>{text('funds')}</dt><dd data-testid="nation-funds">{number(details.funds)}</dd></div>}
   </dl>
  </div> : <>
   <div className="nation-head" aria-hidden="true">
    <span>{text('rankColumn')}</span><span>{text('nationColumn')}</span><span>{text('territoryColumn')}</span><span>{text('armyColumn')}</span>
   </div>
   <ol className="nation-list">
    {factions.map((faction, index) => <li key={faction.id}><NationRow faction={faction} rank={index + 1} state={state} actor={actor} language={language} onFocus={open}/></li>)}
   </ol>
  </>}
 </DockPanel>;
}
export function NationRow({faction, rank, state, actor, language, onFocus, compact = false}: {
 faction: FactionSummary; rank: number; state: GameState; actor: number; language: Language; onFocus: (id: number) => void; compact?: boolean;
}) {
 const player = state.players[faction.id], text = (key: string) => t(language, key), name = playerName(language, player);
 const tags = [faction.id === actor ? text('youTag') : text(player.ai ? 'aiTag' : 'humanTag'), faction.eliminated ? text('eliminatedTag') : `${text('levelColumn')} ${faction.level}`];
 return <button type="button" className="nation-row" data-nation-id={faction.id} data-self={faction.id === actor} data-eliminated={faction.eliminated} disabled={compact && faction.eliminated}
  onClick={() => onFocus(faction.id)} aria-label={`${rank}. ${name} · ${text('territoryColumn')} ${faction.territory} · ${text('armyColumn')} ${faction.army}`}>
  <span className="nation-rank">{rank}</span>
  <span className="nation-name">
   <FactionSwatch state={state} id={faction.id} language={language} className="nation-swatch"/>
   <span className="nation-copy"><bdi>{name}</bdi>{!compact && <small>{tags.join(' · ')}</small>}</span>
  </span>
  <span className="nation-stat">{faction.territory}</span>
  <span className="nation-stat">{faction.army}</span>
 </button>;
}
