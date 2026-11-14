import {STATS, stats, upgradeCost} from '../../game/content.ts';
import type {Command, Player} from '../../game/types.ts';
import {Icon} from '../icons.tsx';
import {t, type Language} from '../i18n.ts';
import {Tip, TipRow, TipTitle} from '../Tooltip.tsx';
import {UnitAttributes, UnitIcon} from '../UnitSelection.tsx';
import {DockPanel, Pips, SectionRibbon} from './DockPanel.tsx';

const MAX_LEVEL = 8;

/** Unit upgrades as a docked military window, so the map stays playable while
 * the treasury is spent. Each card shows live attributes and level pips. */
export function MilitaryPanel({player, eliminated, language, onCommand, onClose}: {
 player: Player; eliminated: boolean; language: Language; onCommand: (command: Command) => void; onClose: () => void;
}) {
 const text = (key: string) => t(language, key), funds = Math.floor(player.funds);
 return <DockPanel id="military-panel" className="military-panel" kicker={text('militaryTitle')} title={text('upgrades')} titleId="military-title"
  closeLabel={text('closePanel')} onClose={onClose}>
  <div className="treasury"><Icon name="coin" size={18}/><span>{text('funds')}</span><strong>{funds.toLocaleString()}</strong></div>
  <div className="upgrade-grid">
   {player.loadout.map(kind => <article className="upgrade-card" key={kind}>
    <div className="upgrade-title"><span className="unit-mark"><UnitIcon kind={kind}/></span><h3>{text(kind)}</h3></div>
    <UnitAttributes values={stats(player, kind)} language={language}/>
    <SectionRibbon>{text('upgrades')}</SectionRibbon>
    {STATS.map(stat => {
     const level = player.upgrades[kind][stat], cost = upgradeCost(level), maxed = level >= MAX_LEVEL;
     // The row itself carries the tooltip, so the buy button's parent remains the row.
     return <Tip as="div" className="upgrade-row" key={stat} placement="right" content={<><TipTitle aside={maxed ? text('max') : `${level}/${MAX_LEVEL}`}>{text(stat)}</TipTitle>
      <TipRow label={text('upgradeEffect')} value={text(`${stat}.desc`)}/>
      {!maxed && <TipRow label={text('funds')} value={`${funds.toLocaleString()} / ${cost}`} tone={funds >= cost ? 'good' : 'bad'}/>}
     </>}>
      <div className="upgrade-copy">
       <b>{text(stat)} <span className="gold">{level}/{MAX_LEVEL}</span></b>
       <Pips value={level} total={MAX_LEVEL}/>
       <small>{text(`${stat}.desc`)}</small>
      </div>
      <button type="button" className="secondary upgrade-buy" data-testid={`upgrade-${kind}-${stat}`} disabled={eliminated || maxed || player.funds < cost}
       onClick={() => onCommand({type: 'upgrade', kind, stat})}>{maxed ? text('max') : `＋ ${cost}`}</button>
     </Tip>;
    })}
   </article>)}
  </div>
 </DockPanel>;
}
