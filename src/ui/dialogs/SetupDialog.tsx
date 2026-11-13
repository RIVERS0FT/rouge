import type {Flag} from '../../game/flags.ts';
import type {Kind, Leader} from '../../game/types.ts';
import {FlagImage} from '../Flag.tsx';
import {LeaderBust} from '../LeaderBust.tsx';
import {SectionRibbon} from '../hud/DockPanel.tsx';
import {t, type Language} from '../i18n.ts';
import {UnitSelection} from '../UnitSelection.tsx';

export const validCount = (value: string, min: number, max: number) =>
 /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max;

/** Campaign deployment body: appearance, the single starting unit type,
 * computer opponents and the commander name, then start / create / join. */
export function SetupDialog({mode, language, flag, leader, loadout, aiCount, maxAI, name, code, busy, onAppearance, onLoadout, onAICount, onName, onCode, onStart, onCreateRoom, onJoinRoom}: {
 mode: 'setupSolo' | 'setupLan'; language: Language; flag: Flag; leader: Leader; loadout: Kind[]; aiCount: string; maxAI: number; name: string;
 code: string; busy: boolean; onAppearance: (target: 'playerLeader' | 'playerFlag') => void; onLoadout: (kind: Kind) => void; onAICount: (value: string) => void;
 onName: (value: string) => void; onCode: (value: string) => void; onStart: () => void; onCreateRoom: () => void; onJoinRoom: () => void;
}) {
 const text = (key: string) => t(language, key), solo = mode === 'setupSolo', minAI = solo ? 1 : 0;
 const range = text('aiRange').replace('{min}', String(minAI)).replace('{max}', String(maxAI));
 const validAI = validCount(aiCount, minAI, maxAI), validName = name.trim().length > 0;
 return <>
  <SectionRibbon>{text('playerAppearance')}</SectionRibbon>
  <div className="setup-identity" data-testid="setup-identity">
   <button type="button" className="setup-flag-entry" data-testid="edit-player-flag" aria-label={text('editPlayerFlag')} aria-haspopup="dialog" onClick={() => onAppearance('playerFlag')}>
    <span className="faction-emblem-frame"><FlagImage flag={flag} language={language}/></span>
    <span>{text('playerFlag')}<small>{text('editAppearance')} ↗</small></span>
   </button>
   <button type="button" className="setup-leader-entry" data-testid="edit-player-leader" data-leader={leader} aria-label={text('editPlayerLeader')} aria-haspopup="dialog" onClick={() => onAppearance('playerLeader')}>
    <span className="setup-leader-art"><LeaderBust leader={leader} label={text(leader)}/></span>
    <span>{text(leader)}<small>{text('editAppearance')} ↗</small></span>
   </button>
  </div>
  <SectionRibbon>{text('chooseUnits')}</SectionRibbon>
  <UnitSelection value={loadout[0]} onChange={kind => onLoadout(kind)} language={language}/>
  <div className="ai-count-field">
   <label htmlFor="setup-ai-count">{text('aiCount')}</label>
   <input id="setup-ai-count" data-testid="setup-ai-count" type="number" inputMode="numeric" min={minAI} max={maxAI} step={1} placeholder={`${minAI}–${maxAI}`}
    value={aiCount} aria-invalid={!validAI} aria-describedby="setup-ai-range" onChange={event => onAICount(event.target.value)}/>
   <small id="setup-ai-range">{range} · {text('aiLoadWarning')}</small>
  </div>
  <div className="setup-footer">
   <label>{text('commander')}<input data-testid="commander-name" value={name} maxLength={24} onChange={event => onName(event.target.value)}/></label>
   {solo
    ? <button type="button" className="primary" data-testid="begin-campaign" disabled={!validName || !validAI} onClick={onStart}>{text('start')} →</button>
    : <div className="lan-actions">
     <button type="button" className="primary" disabled={busy || !validName || !validAI} onClick={onCreateRoom}>{text('createRoom')}</button>
     <div className="join-row">
      <input placeholder={text('roomCode')} value={code} maxLength={6} onChange={event => onCode(event.target.value.toUpperCase().replace(/[^A-F0-9]/g, ''))}/>
      <button type="button" className="secondary" disabled={busy || code.length !== 6 || !validName} onClick={onJoinRoom}>{text('joinRoom')}</button>
     </div>
    </div>}
  </div>
 </>;
}
