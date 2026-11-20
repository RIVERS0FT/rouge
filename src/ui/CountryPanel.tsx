import {useLayoutEffect, useRef, type ReactNode} from 'react';
import {CONSTRUCTION_KINDS} from '../game/construction.ts';
import {MAX_LEADER_LEVEL, MAX_UPGRADE_LEVEL, STATS, UNITS, stats, type UnitStats} from '../game/content.ts';
import {MAP} from '../game/map.ts';
import type {BattleStrength, Strength} from '../game/strength.ts';
import type {GameState} from '../game/types.ts';
import {FactionSwatch} from './FactionSwatch.tsx';
import {DockPanel, Pips, SectionRibbon} from './hud/DockPanel.tsx';
import {armyBreakdown, incomePerDay, nationDetails, signed, type FactionSummary} from './hud/hudModel.ts';
import {Icon, type IconName} from './icons.tsx';
import {t, playerName, type Language} from './i18n.ts';
import {PowerBar, SideFlag, formatStrength, sideName, standing, strengthHint, strengthUnit} from './strengthView.tsx';
import {talentDescription} from './talentText.tsx';
import {Tip, TipNote, TipRow, TipTitle} from './Tooltip.tsx';
import {UnitIcon} from './UnitSelection.tsx';

const BATTLE_ROWS = 6, NO_STRENGTH: Strength = {units: 0, health: 0, damage: 0, power: 0};
const SHOWN_STATS: (keyof UnitStats)[] = ['hp', 'attack', 'defense', 'attackSpeed', 'range', 'splash'];

type Props = {
 state: GameState; country: number; actor: number; factions: FactionSummary[]; strengths: Strength[]; battles: BattleStrength[];
 language: Language; hidden?: boolean;
 onLocate: () => void; onSelectRegion: (id: number) => void; onSelectCountry: (id: number) => void; onShowRankings: () => void; onClose: () => void;
};

/**
 * A country as a docked window, read like the region window: name band with its standing,
 * a summary, its strength against yours (against the strongest rival on your own panel),
 * the fights it is in, then army, economy and talents.
 */
export function CountryPanel({state, country, actor, factions, strengths, battles, language, hidden = false, onLocate, onSelectRegion, onSelectCountry, onShowRankings, onClose}: Props) {
 const body = useRef<HTMLDivElement>(null);
 useLayoutEffect(() => {
  if(!body.current || hidden) return;
  body.current.scrollTop = 0;
  const panel = body.current.closest<HTMLElement>('.dock-panel');
  if(panel) panel.scrollTop = 0;
 }, [country, hidden]);
 const player = state.players[country];
 if(!player) return null;
 const text = (key: string) => t(language, key), locale = language === 'zh' ? 'zh-CN' : 'en-US';
 const number = (value: number, digits = 0) => value.toLocaleString(locale, {maximumFractionDigits: digits});
 const summary = factions.find(faction => faction.id === country), self = country === actor, fallen = summary?.eliminated ?? true;
 const mine = strengths[country] ?? NO_STRENGTH, army = armyBreakdown(state, country), details = nationDetails(state, country, actor);
 // Your own panel measures you against the strongest rival still standing; any other country against you.
 const rivalId = self ? strongestRival(factions, strengths, actor) : actor;
 const fights = battles.slice().sort((a, b) => units(b) - units(a) || a.id - b.id);
 const status = fallen ? 'eliminated' : fights.length ? 'contested' : 'stable';
 const relation = self ? 'countryKickerSelf' : player.ai ? 'countryKickerAI' : 'countryKickerHuman';
 const kind = player.loadout[0], effective = stats(player, kind), base = UNITS[kind], upgrades = player.upgrades[kind];
 const regionName = (id: number) => MAP[id].name[language === 'zh' ? 0 : 1];
 return <DockPanel id="country-panel" className="country-panel" bandClassName="country-heading" bodyRef={body} hidden={hidden}
  kicker={<span className="country-kicker" data-testid="country-kicker"><FactionSwatch state={state} id={country} language={language} className="country-kicker-flag"/><span>{text(relation)} · {text('levelShort')} {player.level}/{MAX_LEADER_LEVEL}</span></span>}
  title={<bdi data-testid="country-name">{playerName(language, player)}</bdi>} titleId="country-title"
  leading={<button type="button" className="icon-button" data-testid="country-locate" disabled={fallen} onClick={onLocate} title={text('nationLocate')} aria-label={text('nationLocate')}><Icon name="focus" size={18}/></button>}
  status={<div className="country-meta" data-state={status} data-testid="country-status"><span className="status-dot" aria-hidden="true"/>
   {text(fallen ? 'countryFallen' : fights.length ? 'countryFighting' : 'countryAtPeace').replace('{count}', String(fights.length))}</div>}
  closeLabel={text('closePanel')} onClose={onClose}
  footer={<footer className="country-actions">
   <button type="button" className="secondary full country-rankings-trigger" data-testid="country-rankings" onClick={onShowRankings}>
    <span><Icon name="globe" size={16}/>{text('countryRankings')}</span><span aria-hidden="true">›</span>
   </button>
  </footer>}>
  <div className="country-detail" data-testid="country-detail" data-country={country}>
   <dl className="country-summary">
    <SummaryTile icon="territory" label={text('territory')} value={number(summary?.territory ?? 0)} note={`${number((summary?.share ?? 0) * 100, 1)}%`} testId="country-territory"/>
    <SummaryTile icon="sabres" label={text('army')} value={number(army.total)} note={text(kind)} testId="country-army"/>
    <Tip as="div" className="country-tile country-tile-strength" focusable tapToggle content={<><TipTitle aside={formatStrength(mine.power)}>{text('strength')}</TipTitle><TipNote>{strengthHint(language)}</TipNote></>}>
     <dt><Icon name="military" size={14}/>{text('strength')}</dt><dd><b data-testid="country-strength">{formatStrength(mine.power)}</b><small>{strengthUnit(language)}</small></dd>
    </Tip>
   </dl>

   {rivalId >= 0 && state.players[rivalId] && <PowerCompare state={state} you={actor} other={self ? rivalId : country} rivalLabel={self} factions={factions}
    strengths={strengths} language={language} onSelectCountry={onSelectCountry}/>}

   <section className="country-battles" data-testid="country-battles">
    <SectionRibbon aside={fights.length}>{text('countryBattles')}</SectionRibbon>
    {fights.length ? <ol className="country-battle-list">{fights.slice(0, BATTLE_ROWS).map(battle => {
     const own = battle.sides.find(side => side.owner === country)?.power ?? 0;
     const rival = Math.max(0, ...battle.sides.filter(side => side.owner !== country).map(side => side.power));
     const reading = standing(own, rival, language, self ? 'you' : 'third');
     return <li key={battle.id}><button type="button" className="country-battle" data-testid="country-battle" data-verdict={reading.verdict} onClick={() => onSelectRegion(battle.region)}>
      <span className="country-battle-head"><Icon name="sabres" size={13}/><bdi>{regionName(battle.region)}</bdi><b>{reading.label}</b></span>
      <PowerBar sides={battle.sides} state={state} language={language}/>
      <span className="country-battle-sides">{battle.sides.map(side => <span key={side.owner} title={sideName(state, side.owner, language)}>
       <SideFlag state={state} owner={side.owner} language={language} className="country-battle-flag"/>{side.units}
      </span>)}</span>
     </button></li>;
    })}</ol> : <p className="country-note">{text('noCountryBattles')}</p>}
    {fights.length > BATTLE_ROWS && <p className="country-note">{text('moreItems').replace('{count}', String(fights.length - BATTLE_ROWS))}</p>}
   </section>

   <section className="country-military">
    <SectionRibbon aside={number(army.total)}>{text('countryMilitary')}</SectionRibbon>
    <div className="country-unit">
     <span className="country-unit-icon"><UnitIcon kind={kind}/></span>
     <div className="country-unit-copy">
      <strong>{text(kind)}</strong>
      <dl className="country-unit-stats">{SHOWN_STATS.filter(key => key !== 'splash' || effective.splash > 0).map(key => {
       const delta = effective[key] - base[key];
       return <div key={key}><dt>{text(`attribute.${key}`)}</dt><dd>{trim(effective[key])}{Math.abs(delta) > 1e-9 && <small data-tone={delta > 0 ? 'good' : 'bad'}>{delta > 0 ? '+' : '−'}{trim(Math.abs(delta))}</small>}</dd></div>;
      })}</dl>
     </div>
    </div>
    <dl className="country-rows country-upgrades">
     {STATS.map(stat => <div key={stat}><dt>{text(stat)}</dt><dd><Pips value={upgrades[stat]} total={MAX_UPGRADE_LEVEL}/><span>{upgrades[stat]}/{MAX_UPGRADE_LEVEL}</span></dd></div>)}
    </dl>
    <dl className="country-rows">
     <div><dt>{text('armyGarrison')}</dt><dd>{number(army.garrison)}</dd></div>
     <div><dt>{text('armyMarching')}</dt><dd>{number(army.marching)}</dd></div>
     <div><dt>{text('armyEmbarked')}</dt><dd>{number(army.embarked)}</dd></div>
    </dl>
   </section>

   <section className="country-economy">
    <SectionRibbon>{text('countryEconomy')}</SectionRibbon>
    <dl className="country-rows">
     <div><dt>{text('incomePerDay')}</dt><dd data-testid="country-income">{signed(incomePerDay(state, country))}{text('perDay')}</dd></div>
     {details.funds !== null && <div><dt>{text('funds')}</dt><dd data-testid="country-funds">{number(details.funds)}</dd></div>}
     {CONSTRUCTION_KINDS.map(building => <div key={building}><dt>{text(`construction.${building}`)}</dt><dd data-testid={`country-building-${building}`}>{number(details.buildings[building])}</dd></div>)}
    </dl>
   </section>

   <section className="country-talents">
    <SectionRibbon aside={`${player.talents.length}/${MAX_LEADER_LEVEL - 1}`}>{text('countryTalents')}</SectionRibbon>
    {player.talents.length ? <ul className="country-talent-list" data-testid="country-talents">{player.talents.map(id => <li key={id}>
     <Tip as="span" className="country-talent" focusable tapToggle content={<><TipTitle>{text(id)}</TipTitle><TipNote>{talentDescription(text(`${id}.desc`), language)}</TipNote></>}>{text(id)}</Tip>
    </li>)}</ul> : <p className="country-note">{text('noTalentsYet')}</p>}
   </section>
  </div>
 </DockPanel>;
}

function SummaryTile({icon, label, value, note, testId}: {icon: IconName; label: string; value: ReactNode; note: ReactNode; testId: string}) {
 return <div className="country-tile"><dt><Icon name={icon} size={14}/>{label}</dt><dd><b data-testid={testId}>{value}</b><small>{note}</small></dd></div>;
}

/** You (left) against another country (right): a strength bar, who leads and the figures behind it. */
function PowerCompare({state, you, other, rivalLabel, factions, strengths, language, onSelectCountry}: {
 state: GameState; you: number; other: number; rivalLabel: boolean; factions: FactionSummary[]; strengths: Strength[]; language: Language; onSelectCountry: (id: number) => void;
}) {
 const text = (key: string) => t(language, key), locale = language === 'zh' ? 'zh-CN' : 'en-US';
 const left = strengths[you] ?? NO_STRENGTH, right = strengths[other] ?? NO_STRENGTH;
 const reading = standing(left.power, right.power, language, 'you');
 const territory = (id: number) => factions.find(faction => faction.id === id)?.territory ?? 0;
 const upgrades = (id: number) => Object.values(state.players[id].upgrades).reduce((sum, levels) => sum + levels.attack + levels.health + levels.speed, 0);
 const rows: [string, number, number, number][] = [
  [text('strength'), left.power, right.power, 0], [text('army'), left.units, right.units, 0], [text('territory'), territory(you), territory(other), 0],
  [text('incomePerDay'), incomePerDay(state, you), incomePerDay(state, other), 1], [text('unitUpgrades'), upgrades(you), upgrades(other), 0],
  [text('talentsChosen'), state.players[you].talents.length, state.players[other].talents.length, 0],
 ];
 const name = (id: number) => playerName(language, state.players[id]);
 return <section className="country-compare" data-testid="country-compare" data-verdict={reading.verdict} data-rival={other}>
  <SectionRibbon>{text(rivalLabel ? 'strengthRival' : 'strengthCompare')}</SectionRibbon>
  <div className="compare-sides">
   <span className="compare-side"><FactionSwatch state={state} id={you} language={language} className="compare-flag"/><bdi>{text('sideYou')}</bdi></span>
   <b className="compare-verdict" data-testid="country-verdict">{reading.label}</b>
   <button type="button" className="compare-side compare-side-other" disabled={!rivalLabel} onClick={() => onSelectCountry(other)} title={rivalLabel ? text('openCountry') : undefined}>
    <bdi>{name(other)}</bdi><FactionSwatch state={state} id={other} language={language} className="compare-flag"/>
   </button>
  </div>
  <PowerBar sides={[{owner: you, power: left.power}, {owner: other, power: right.power}]} state={state} language={language} className="compare-bar"/>
  <table className="compare-table">
   <thead><tr><th scope="col"><span className="visually-hidden">{text('strengthCompare')}</span></th><th scope="col">{text('sideYou')}</th><th scope="col"><bdi>{name(other)}</bdi></th></tr></thead>
   <tbody>{rows.map(([label, a, b, digits]) => <tr key={label} data-lead={a > b + 1e-9 ? 'you' : b > a + 1e-9 ? 'other' : 'even'}>
    <th scope="row">{label}</th><td>{a.toLocaleString(locale, {maximumFractionDigits: digits})}</td><td>{b.toLocaleString(locale, {maximumFractionDigits: digits})}</td>
   </tr>)}</tbody>
  </table>
 </section>;
}

function strongestRival(factions: FactionSummary[], strengths: Strength[], actor: number): number {
 let best = -1, power = -1;
 for(const faction of factions) if(faction.id !== actor && !faction.eliminated && (strengths[faction.id]?.power ?? 0) > power) {best = faction.id; power = strengths[faction.id]?.power ?? 0;}
 return best;
}
const units = (battle: BattleStrength) => battle.sides.reduce((sum, side) => sum + side.units, 0);
const trim = (value: number) => Number(value.toFixed(2)).toString();
