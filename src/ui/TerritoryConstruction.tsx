import {useMemo, useState} from 'react';
import {CONSTRUCTION, CONSTRUCTION_KINDS, constructionFunds, constructionIncomeRate} from '../game/construction.ts';
import {MAP} from '../game/map.ts';
import {regionProductionRate} from '../game/territoryEconomy.ts';
import type {Command, ConstructionKind, GameState} from '../game/types.ts';
import {SectionRibbon} from './hud/DockPanel.tsx';
import {t, type Language} from './i18n.ts';
import {Icon, type IconName} from './icons.tsx';

const kinds = CONSTRUCTION_KINDS;
const icon: Record<ConstructionKind, IconName> = {market: 'coin', barracks: 'military', fortress: 'shield'};
const regionIds = new Map(MAP.map(region => [region.code, region.id]));

type Props = {
 state: GameState; selected: number; actor: number; eliminated: boolean; language: Language;
 onCommand: (command: Command) => void;
};

/** A runtime territory is a view over base regions, never a second building slot or wallet. */
export function TerritoryConstruction(props: Props) {
 const {state, selected} = props;
 const groupId = state.grouping.atomToGroup[MAP[selected].code];
 const members = useMemo(() => {
  const group = state.grouping.groups.find(candidate => candidate.id === groupId);
  return group?.atoms.flatMap(code => {
   const id = regionIds.get(code);
   return id !== undefined && MAP[id].playable ? [id] : [];
  }) ?? [selected];
 }, [state.grouping, groupId, selected]);
 return <ConstructionControls key={`${selected}:${groupId}`} {...props} members={members}/>;
}

function ConstructionControls({state, selected, actor, eliminated, language, onCommand, members}: Props & {members: number[]}) {
 const [choice, setChoice] = useState(selected);
 const target = members.includes(choice) ? choice : selected, province = state.provinces[target];
 const text = (key: string) => t(language, key);
 const own = province.owner === actor, editable = own && MAP[target].playable && !eliminated && state.winner === null;
 const ready = editable && province.capture <= 0;
 const funds = own ? constructionFunds(state, actor) : 0;
 const building = province.construction;
 const counts: Record<ConstructionKind, number> = {market: 0, barracks: 0, fortress: 0};
 let income = 0;
 for(const member of members) {
  const region = state.provinces[member], item = region.construction;
  if(region.owner === actor) income += constructionIncomeRate(region, regionProductionRate(member));
  if(item) counts[item.kind]++;
 }
 if(!own && !building && members.length <= 1) return null;
 const name = (kind: ConstructionKind) => text(`construction.${kind}`);
 const benefit = (kind: ConstructionKind, level: 1 | 2) => {
  const value = CONSTRUCTION[kind].benefits[level - 1];
  return text(`construction.${kind}.benefit`).replace('{amount}', String(kind === 'market' ? value : Math.round(value * 100)));
 };
 const buy = (kind: ConstructionKind, cost: number, label: string, expectedLevel: 0 | 1) => (
  <button className="secondary construction-buy" type="button" data-testid={`construct-${kind}`} disabled={!ready || funds < cost}
   title={province.capture > 0 ? text('error.constructionContested') : funds < cost ? text('error.noFunds') : undefined} aria-label={`${label} ${name(kind)} · ${cost}`}
   onClick={() => {if(ready && funds >= cost) onCommand({type: 'construct', province: target, kind, expectedLevel});}}>
   {label} · {cost}
  </button>
 );
 return <section className="province-construction" data-testid="province-construction" aria-label={text('constructionTitle')}>
  <SectionRibbon aside={own ? <span className="construction-funds" data-testid="construction-funds">{text('constructionFunds')} <strong>{funds}</strong></span> : undefined}>
   {text('constructionTitle')}
  </SectionRibbon>
  {own && <div className="construction-income" data-testid="construction-income">{text('constructionIncome').replace('{amount}', String(Number(income.toFixed(2))))}</div>}
  {members.length > 1 && <>
   <p className="construction-group-summary" data-testid="construction-summary">
    <span>{text('constructionBuilt').replace('{built}', String(counts.market + counts.barracks + counts.fortress)).replace('{total}', String(members.length))}</span>
    {kinds.filter(kind => counts[kind]).map(kind => <span key={kind}>{name(kind)} ×{counts[kind]}</span>)}
   </p>
   <label className="construction-target">{text('constructionTarget')}
    <select data-testid="construction-target" value={target} onChange={event => setChoice(Number(event.target.value))}>
     {members.map(id => <option key={id} value={id}>{MAP[id].name[language === 'zh' ? 0 : 1]}</option>)}
    </select>
   </label>
  </>}
  {editable && !ready && <p className="construction-blocked">{text('error.constructionContested')}</p>}
  <div className="construction-options">
   {building ? <div className="construction-option" data-testid="construction-current" data-kind={building.kind} data-level={building.level}>
    <Icon name={icon[building.kind]} size={16}/>
    <div className="construction-copy">
     <strong>{name(building.kind)} · {text('constructionLevel').replace('{level}', String(building.level))}</strong>
     <small>{benefit(building.kind, building.level)}</small>
     {editable && building.level === 1 && <small>{text('constructionNext').replace('{effect}', benefit(building.kind, 2))}</small>}
    </div>
    {editable && (building.level === 1 ? buy(building.kind, CONSTRUCTION[building.kind].costs[1], text('constructionUpgrade'), 1) :
     <span className="construction-max">{text('max')}</span>)}
   </div> : editable ? kinds.map(kind => <div className="construction-option" key={kind}>
    <Icon name={icon[kind]} size={16}/>
    <div className="construction-copy"><strong>{name(kind)}</strong><small>{benefit(kind, 1)}</small></div>
    {buy(kind, CONSTRUCTION[kind].costs[0], text('constructionBuild'), 0)}
   </div>) : <p className="construction-empty">{text('constructionEmpty')}</p>}
  </div>
 </section>;
}
