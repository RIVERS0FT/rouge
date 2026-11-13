import type {ReactNode} from 'react';
import {STATS, upgradeCost} from '../../game/content.ts';
import {factionColor} from '../../game/factionColors.ts';
import {PLAYABLE_COUNT} from '../../game/map.ts';
import type {GameState} from '../../game/types.ts';
import {FactionIdentity} from '../CommanderHud.tsx';
import {factionFlag} from '../../game/factionFlags.ts';
import {leaderProgress} from '../commanderIdentity.ts';
import {Icon, type IconName} from '../icons.tsx';
import {t, playerName, type Language} from '../i18n.ts';
import {Tip, TipNote, TipRow, TipTitle} from '../Tooltip.tsx';
import {armyBreakdown, CAPTURE_REWARD, DOMINATION_SECONDS, incomePerSecond, signed, victoryTarget} from './hudModel.ts';

function Metric({icon, label, tip, className = '', children}: {icon: IconName; label: string; tip: ReactNode; className?: string; children: ReactNode}) {
 return <Tip as="div" className={`resource ${className}`} content={tip} focusable tapToggle>
  <span className="resource-icon"><Icon name={icon} size={22}/></span>
  <span className="resource-copy"><span className="resource-label">{label}</span>{children}</span>
 </Tip>;
}

/**
 * The state ledger along the top edge: banner, treasury, battalions, territory
 * and command rank, each with a live breakdown tooltip, followed by alerts.
 * The player's name deliberately stays on the portrait card, not here.
 */
export function TopBar({state, actor, owned, language, onTalents, clock, menu}: {
 state: GameState; actor: number; owned: number; language: Language; onTalents: () => void; clock: ReactNode; menu: ReactNode;
}) {
 const player = state.players[actor], text = (key: string) => t(language, key);
 const income = incomePerSecond(state, actor), army = armyBreakdown(state, actor), goal = victoryTarget();
 const progress = leaderProgress(player);
 const costs = player.loadout.flatMap(kind => STATS.map(stat => player.upgrades[kind][stat])).filter(level => level < 8).map(upgradeCost);
 const cheapest = costs.length ? Math.min(...costs) : null;
 const domination = state.domination[actor] ?? 0;
 const rival = state.players.filter(p => p.id !== actor).map(p => ({player: p, value: state.domination[p.id] ?? 0})).sort((a, b) => b.value - a.value)[0];
 const share = owned / PLAYABLE_COUNT * 100;
 return <header className="hud-top">
  <FactionIdentity flag={factionFlag(state.players, actor)} actor={actor} language={language} color={factionColor(actor)}/>
  <div className="hud-ledger" role="group" aria-label={text('stateLedger')}>
   <Metric icon="coin" label={text('gold')} className="resource-treasury" tip={<>
    <TipTitle aside={Math.floor(player.gold).toLocaleString()}>{text('treasuryLabel')}</TipTitle>
    <TipRow label={text('incomePerSecond')} value={`${signed(income)}${text('perSecond')}`} tone={income > 0 ? 'good' : 'muted'}/>
    <TipRow label={text('incomeSource').replace('{count}', String(owned))} value={`${income.toFixed(1)}${text('perSecond')}`}/>
    <TipRow label={text('captureReward')} value={`+${CAPTURE_REWARD}`} tone="good"/>
    <TipRow label={text('cheapestUpgrade')} value={cheapest === null ? text('allUpgradesMax') : cheapest} tone={cheapest !== null && player.gold >= cheapest ? 'good' : 'muted'}/>
   </>}>
    <strong>{Math.floor(player.gold).toLocaleString()}</strong>
    <small className="resource-delta" data-tone={income > 0 ? 'good' : 'muted'}>{signed(income)}{text('perSecond')}</small>
   </Metric>
   <Metric icon="sabres" label={text('army')} tip={<>
    <TipTitle aside={army.total.toLocaleString()}>{text('army')}</TipTitle>
    <TipRow label={text('armyGarrison')} value={army.garrison}/>
    <TipRow label={text('armyMarching')} value={army.marching}/>
    <TipRow label={text('armyEmbarked')} value={army.embarked}/>
    <TipNote>{text('noArmyCap')}</TipNote>
   </>}>
    <strong data-testid="army-total" title={text('noArmyCap')}>{army.total.toLocaleString()}</strong>
   </Metric>
   <Metric icon="territory" label={text('territory')} className="resource-territory" tip={<>
    <TipTitle aside={`${owned} / ${PLAYABLE_COUNT}`}>{text('territoryOwned')}</TipTitle>
    <TipRow label={text('territoryGoal')} value={goal} tone="gold"/>
    <TipRow label={text('territoryShare')} value={`${share.toFixed(1)}%`}/>
    <TipNote>{text('objectiveDesc').replace('{count}', String(goal))}</TipNote>
   </>}>
    <strong>{owned}<small> / {PLAYABLE_COUNT}</small></strong>
    <span className="micro-progress" aria-hidden="true"><i style={{width: `${Math.min(100, owned / goal * 100)}%`}}/></span>
   </Metric>
   <Metric icon="rank" label={text('level')} className="level-resource" tip={<>
    <TipTitle aside={`${player.level} / 8`}>{text('level')}</TipTitle>
    <TipRow label={text('levelProgress')} value={progress.complete ? text('max') : `${Math.floor(progress.value)} / ${progress.maximum} ${text('experience')}`}/>
    <TipRow label={text('talentsChosen')} value={player.talents.length}/>
    <TipRow label={text('reroll')} value={player.rerolls}/>
    {player.choices.length > 0 && <TipNote>{text('talentAvailable')}</TipNote>}
   </>}>
    <strong>{player.level}<small> / 8</small></strong>
    <span className="micro-progress" aria-hidden="true"><i style={{width: `${progress.percent}%`}}/></span>
   </Metric>
  </div>
  <div className="hud-alerts">
   {player.choices.length > 0 && <Tip content={<><TipTitle>{text('talents')}</TipTitle><TipNote>{text('talentAvailable')}</TipNote></>}>
    <button type="button" className="hud-alert" data-tone="gold" onClick={onTalents} aria-haspopup="dialog" aria-label={text('talentAvailable')}>
     <Icon name="laurel" size={22}/><b aria-hidden="true">!</b>
    </button>
   </Tip>}
   {domination > 0 && <Tip as="div" focusable tapToggle className="hud-alert" content={<><TipTitle aside={`${Math.floor(domination)} / ${DOMINATION_SECONDS}${text('seconds')}`}>{text('dominationAlert')}</TipTitle><TipNote>{text('dominationHint')}</TipNote></>}>
     <Icon name="crown" size={22}/><span className="hud-alert-count">{Math.floor(domination)}</span>
   </Tip>}
   {rival && rival.value > 0 && <Tip as="div" focusable tapToggle className="hud-alert" content={<><TipTitle aside={`${Math.floor(rival.value)} / ${DOMINATION_SECONDS}${text('seconds')}`}>{text('dominationAlert')}</TipTitle><TipRow label={<bdi>{playerName(language, rival.player)}</bdi>} value={`${Math.floor(rival.value)}${text('seconds')}`} tone="bad"/></>}>
     <span data-tone="bad"><Icon name="crown" size={22}/></span><span className="hud-alert-count" data-tone="bad">{Math.floor(rival.value)}</span>
   </Tip>}
  </div>
  {clock}
  {menu}
 </header>;
}
