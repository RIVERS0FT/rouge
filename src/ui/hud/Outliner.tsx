import {useState, type ReactNode} from 'react';
import {factionColor} from '../../game/factionColors.ts';
import {MAP, PLAYABLE_COUNT} from '../../game/map.ts';
import type {GameState} from '../../game/types.ts';
import {FieldDispatches} from '../FieldDispatches.tsx';
import {Icon} from '../icons.tsx';
import {t, playerName, type Language} from '../i18n.ts';
import {Tip, TipRow, TipTitle} from '../Tooltip.tsx';
import {DOMINATION_SECONDS, victoryTarget, type FactionSummary, type RegionSummary} from './hudModel.ts';
import {NationRow} from './NationsPanel.tsx';

const NATION_ROWS = 5, REGION_ROWS = 6;

function OutlinerSection({id, title, aside, open, onToggle, children}: {id: string; title: string; aside?: ReactNode; open: boolean; onToggle: () => void; children: ReactNode}) {
 return <section className="outliner-section" data-section={id} data-open={open}>
  <h3><button type="button" className="outliner-toggle" aria-expanded={open} aria-controls={`outliner-${id}`} onClick={onToggle}>
   <Icon name="chevron" size={14}/><span>{title}</span>{aside !== undefined && <b>{aside}</b>}
  </button></h3>
  {open && <div className="outliner-content" id={`outliner-${id}`}>{children}</div>}
 </section>;
}

/**
 * The right-hand outliner: the conquest "journal entry", ranked nations,
 * the player's own regions and the dispatch feed. Every row is a shortcut
 * that moves the camera, like a grand-strategy outliner.
 */
export function Outliner({state, actor, owned, factions, regions, language, open, onFocusNation, onSelectRegion, onShowNations}: {
 state: GameState; actor: number; owned: number; factions: FactionSummary[]; regions: RegionSummary[]; language: Language; open: boolean;
 onFocusNation: (id: number) => void; onSelectRegion: (id: number) => void; onShowNations: () => void;
}) {
 const text = (key: string) => t(language, key), goal = victoryTarget();
 const [expanded, setExpanded] = useState({objective: true, nations: true, regions: true});
 const toggle = (key: keyof typeof expanded) => setExpanded(current => ({...current, [key]: !current[key]}));
 const domination = state.domination[actor] ?? 0;
 const self = factions.findIndex(faction => faction.id === actor);
 // Large AI rosters: index territory once instead of searching the ranking per bar.
 const territory = new Map(factions.map(faction => [faction.id, faction.territory]));
 const shown = factions.slice(0, NATION_ROWS);
 if(self >= NATION_ROWS) shown.push(factions[self]);
 return <aside id="strategic-panel" className={`strategic-panel${open ? ' mobile-panel-open' : ''}`} data-open={open} aria-label={text('outliner')}>
  <div className="outliner">
   <header className="outliner-band"><Icon name="scroll" size={16}/><span>{text('outliner')}</span></header>
   <OutlinerSection id="objective" title={text('objective')} aside={`${owned} / ${goal}`} open={expanded.objective} onToggle={() => toggle('objective')}>
    <div className="objective">
     <h4>{text('theatre')}</h4>
     <p>{text('objectiveDesc').replace('{count}', String(goal))}</p>
     <Tip as="div" className="objective-progress" focusable content={<><TipTitle aside={`${owned} / ${goal}`}>{text('territoryGoal')}</TipTitle>
      <TipRow label={text('territoryShare')} value={`${(owned / PLAYABLE_COUNT * 100).toFixed(1)}%`}/></>}>
      <div className="progress progress-gold" role="progressbar" aria-label={text('territoryGoal')} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(goal, owned)}>
       <i style={{width: `${Math.min(100, owned / goal * 100)}%`}}/>
      </div>
     </Tip>
     <div className="faction-bars" aria-hidden="true">{state.players.map(player => {
      const share = (territory.get(player.id) ?? 0) / PLAYABLE_COUNT * 100;
      return <span key={player.id} title={playerName(language, player)} style={{background: factionColor(player.id), width: `${share}%`}}/>;
     })}</div>
     {domination > 0 && <b className="objective-domination"><Icon name="crown" size={14}/>{text('domination')} {Math.floor(domination)} / {DOMINATION_SECONDS}{text('seconds')}</b>}
    </div>
   </OutlinerSection>
   <OutlinerSection id="nations" title={text('nations')} aside={state.players.length} open={expanded.nations} onToggle={() => toggle('nations')}>
    <ol className="outliner-nations">{shown.map(faction => <li key={faction.id}>
     <NationRow faction={faction} rank={factions.indexOf(faction) + 1} state={state} actor={actor} language={language} onFocus={onFocusNation} compact/>
    </li>)}</ol>
    <button type="button" className="outliner-more" data-testid="outliner-all-nations" onClick={onShowNations}>{text('allNations')}<span aria-hidden="true">›</span></button>
   </OutlinerSection>
   <OutlinerSection id="regions" title={text('myRegions')} aside={regions.length} open={expanded.regions} onToggle={() => toggle('regions')}>
    <ol className="outliner-regions">{regions.slice(0, REGION_ROWS).map(region => {
     const name = MAP[region.id].name[language === 'zh' ? 0 : 1], threatened = region.capture > 0;
     return <li key={region.id}><button type="button" className="region-row" data-threat={threatened} onClick={() => onSelectRegion(region.id)}>
      <span className="region-row-name"><bdi>{name}</bdi></span>
      <span className="region-row-garrison"><Icon name="shield" size={12}/>{region.garrison}/{region.capacity}</span>
      <span className="region-row-bar" aria-hidden="true"><i style={{width: `${threatened ? Math.min(100, region.capture / 8 * 100) : region.full ? 100 : Math.min(100, region.production / region.train * 100)}%`}}/></span>
     </button></li>;
    })}</ol>
    {regions.length > REGION_ROWS && <p className="outliner-note">{text('moreItems').replace('{count}', String(regions.length - REGION_ROWS))}</p>}
   </OutlinerSection>
  </div>
  <FieldDispatches events={state.events} players={state.players} language={language} onRegion={onSelectRegion}/>
 </aside>;
}
