import type {GameState} from '../../game/types.ts';
import {FactionSwatch} from '../FactionSwatch.tsx';
import {t, playerName, type Language} from '../i18n.ts';
import {DockPanel} from './DockPanel.tsx';
import type {FactionSummary} from './hudModel.ts';

/** Every faction ranked by territory, with battalions and command rank.
 * Selecting a nation jumps to the region holding its largest garrison. */
export function NationsPanel({state, actor, factions, language, onFocusNation, onClose}: {
 state: GameState; actor: number; factions: FactionSummary[]; language: Language; onFocusNation: (id: number) => void; onClose: () => void;
}) {
 const text = (key: string) => t(language, key);
 return <DockPanel id="nations-panel" className="nations-panel" kicker={text('nations')} title={text('nationsTitle')} titleId="nations-title"
  closeLabel={text('closePanel')} onClose={onClose}>
  <div className="nation-head" aria-hidden="true">
   <span>{text('rankColumn')}</span><span>{text('nationColumn')}</span><span>{text('territoryColumn')}</span><span>{text('armyColumn')}</span>
  </div>
  <ol className="nation-list">
   {factions.map((faction, index) => <li key={faction.id}><NationRow faction={faction} rank={index + 1} state={state} actor={actor} language={language} onFocus={onFocusNation}/></li>)}
  </ol>
 </DockPanel>;
}

export function NationRow({faction, rank, state, actor, language, onFocus, compact = false}: {
 faction: FactionSummary; rank: number; state: GameState; actor: number; language: Language; onFocus: (id: number) => void; compact?: boolean;
}) {
 const player = state.players[faction.id], text = (key: string) => t(language, key), name = playerName(language, player);
 const tags = [faction.id === actor ? text('youTag') : text(player.ai ? 'aiTag' : 'humanTag'), faction.eliminated ? text('eliminatedTag') : `${text('levelColumn')} ${faction.level}`];
 return <button type="button" className="nation-row" data-self={faction.id === actor} data-eliminated={faction.eliminated} disabled={faction.eliminated}
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
