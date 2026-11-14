import type {CountryAction} from '../game/countryActions.ts';
import {useLayoutEffect, useRef} from 'react';
import {regionGarrison} from '../game/capacity.ts';
import {UNITS} from '../game/content.ts';
import {constructionProductionMultiplier, fundsIncomeRate, recoveryMultiplier} from '../game/construction.ts';
import {factionColor} from '../game/factionColors.ts';
import {MAP} from '../game/map.ts';
import {regionCapacity, regionProductionRate} from '../game/territoryEconomy.ts';
import type {GameState, Kind} from '../game/types.ts';
import {FactionSwatch} from './FactionSwatch.tsx';
import {DockPanel, Pips, SectionRibbon} from './hud/DockPanel.tsx';
import {CAPTURE_THRESHOLD} from './hud/hudModel.ts';
import {Icon} from './icons.tsx';
import {t, playerName, type Language} from './i18n.ts';
import {Tip, TipNote, TipRow, TipTitle} from './Tooltip.tsx';
import {UnitIcon} from './UnitSelection.tsx';
import {TerritoryConstruction} from './TerritoryConstruction.tsx';

type Props = {
 state: GameState; selected: number; actor: number; eliminated: boolean; language: Language; hidden?: boolean;
 onFocus: () => void; onManage: () => void; onClose: () => void; onCommand: (command: CountryAction) => void;
};

/**
 * The selected region as a docked state window: name band, ownership and
 * garrison ledger, capture threat, the production queue and administration.
 * One reading order serves desktop docks and the compact bottom sheet.
 */
export function TerritoryPanel({state, selected, actor, eliminated, language, hidden = false, onFocus, onManage, onClose, onCommand}: Props) {
 const body = useRef<HTMLDivElement>(null);
 // Either the body (wide docks) or the whole sheet (compact layouts) scrolls; start both at
 // the top for a new region and whenever the window is shown again.
 useLayoutEffect(() => {
  if(!body.current || hidden) return;
  body.current.scrollTop = 0;
  const panel = body.current.closest<HTMLElement>('.dock-panel');
  if(panel) panel.scrollTop = 0;
 }, [selected, hidden]);
 const text = (key: string) => t(language, key);
 const province = state.provinces[selected], player = state.players[actor];
 const status = province.capture > 0 ? 'contested' : province.recovery > 0 ? 'recovering' : 'stable';
 const productionTime = UNITS[province.kind].train, capacity = regionCapacity(selected);
 const garrison = regionGarrison(state, province.owner, selected), rate = regionProductionRate(selected);
 const country = state.players[province.owner];
 const recovery = recoveryMultiplier(province.recovery, country), production = rate * constructionProductionMultiplier(province) * recovery;
 const income = province.owner < 0 ? 0 : fundsIncomeRate(province, rate, country);
 const owner = province.owner < 0 ? text('neutralOwner') : playerName(language, state.players[province.owner]);
 const captor = province.captor >= 0 ? state.players[province.captor] : undefined;
 return <DockPanel id="province-panel" className="province-panel" bandClassName="province-heading" bodyRef={body} hidden={hidden}
  kicker={<span className="province-country" data-testid="province-country">
   {province.owner < 0 ? <span className="faction-dot" style={{background: factionColor(province.owner)}} aria-hidden="true"/>
    : <FactionSwatch state={state} id={province.owner} language={language} className="province-country-flag"/>}
   <bdi>{owner}</bdi>
  </span>} title={MAP[selected].name[language === 'zh' ? 0 : 1]} titleId="province-title"
  leading={<button type="button" className="icon-button" onClick={onFocus} title={text('focus')} aria-label={text('focus')}><Icon name="focus" size={18}/></button>}
  status={<div className="province-meta" data-state={status}><span className="status-dot" aria-hidden="true"/>{text(status)}</div>}
  closeLabel={text('closePanel')} onClose={onClose}
  footer={<footer className="province-actions">
   <button type="button" className="secondary full territory-manage-trigger" data-testid="open-territory-management" aria-haspopup="dialog" onClick={onManage}>
    <span><Icon name="archive" size={16}/>{text('territories')}</span><span aria-hidden="true">›</span>
   </button>
  </footer>}>
  <dl className="province-summary province-owner">
   <div className="province-ownership">
    <dt>{text('owner')}</dt>
    <dd>{province.owner < 0 ? <span className="faction-dot" style={{background: factionColor(province.owner)}} aria-hidden="true"/>
     : <FactionSwatch state={state} id={province.owner} language={language} className="owner-swatch"/>}<span data-testid="province-owner-name">{owner}</span></dd>
   </div>
   <div className="province-garrison">
    <dt>{text('garrison')}</dt>
    <dd data-testid="region-capacity" title={text('garrisonCapacityHint')}>{garrison}<span> / {capacity}</span></dd>
    {capacity <= 24 && <Pips value={garrison} total={capacity} className="garrison-pips"/>}
   </div>
  </dl>
  {province.capture > 0 && <section className="province-capture">
   <SectionRibbon aside={captor ? <bdi>{playerName(language, captor)}</bdi> : undefined}>{text('capture')}</SectionRibbon>
   <div className="progress progress-danger" role="progressbar" aria-label={text('capture')} aria-valuemin={0} aria-valuemax={CAPTURE_THRESHOLD} aria-valuenow={Math.min(CAPTURE_THRESHOLD, province.capture)}>
    <i style={{width: `${Math.min(100, province.capture / CAPTURE_THRESHOLD * 100)}%`}}/>
   </div>
  </section>}
  {province.owner === actor && <section className="province-production">
   <SectionRibbon>{text('production')}</SectionRibbon>
   <div className="production-row">
    <span className="production-icon"><UnitIcon kind={province.kind}/></span>
    <div className="production-control">
     <label htmlFor="province-production-kind" className="visually-hidden">{text('production')}</label>
     <select id="province-production-kind" disabled={eliminated} value={province.kind} onChange={event => onCommand({type: 'production', province: selected, kind: event.target.value as Kind})}>
      {player.loadout.map(kind => <option key={kind} value={kind}>{text(kind)}</option>)}
     </select>
     <div className="production-line">
      <div className="progress" role="progressbar" aria-label={text('production')} aria-valuemin={0} aria-valuemax={productionTime} aria-valuenow={Math.min(productionTime, province.production)}>
       <i style={{width: `${Math.min(100, province.production / productionTime * 100)}%`}}/>
      </div>
      <span>{Math.floor(province.production)} / {productionTime}{text('seconds')}</span>
     </div>
    </div>
   </div>
  </section>}
  {province.owner >= 0 && <dl className="province-ledger">
   <Tip as="div" focusable tapToggle content={<><TipTitle aside={`+${income.toFixed(1)}${text('perSecond')}`}>{text('regionIncome')}</TipTitle><TipNote>{text('incomePerSecond')}</TipNote></>}>
    <dt><Icon name="coin" size={15}/>{text('regionIncome')}</dt><dd data-tone="good">+{income.toFixed(1)}{text('perSecond')}</dd>
   </Tip>
   <Tip as="div" focusable tapToggle content={<><TipTitle aside={`×${production.toFixed(2)}`}>{text('productionRate')}</TipTitle>{province.recovery > 0 && <TipRow label={text('recovering')} value={`×${recovery.toFixed(2)}`} tone="bad"/>}</>}>
    <dt><Icon name="hammer" size={15}/>{text('productionRate')}</dt><dd>×{production.toFixed(2)}</dd>
   </Tip>
  </dl>}
  <TerritoryConstruction state={state} selected={selected} actor={actor} eliminated={eliminated} language={language} onCommand={onCommand}/>
 </DockPanel>;
}
