import type {CommanderAppearance} from '../../game/portrait.ts';
import type {Flag} from '../../game/flags.ts';
import type {Kind, Leader} from '../../game/types.ts';
import type {Seat} from '../../platform/session.ts';
import {SectionRibbon} from '../hud/DockPanel.tsx';
import {Icon, type IconName} from '../icons.tsx';
import {t, type Language} from '../i18n.ts';
import {NumberStepper, validCount} from '../NumberStepper.tsx';
import {RoomHero, SeatRow} from '../Room.tsx';
import {UnitSelection} from '../UnitSelection.tsx';

export {validCount};
/** Creating covers single player and hosting a LAN room; joining enters another host's room. */
export type SetupMode = 'setupSolo' | 'setupLan' | 'setupJoin';

// The seat preview lists the first computer seats; the rest are counted.
const PREVIEW_AI_SEATS = 5;

/** Deployment set as a room with your commander at its centre. Creating starts with the mode
 * (single player or a LAN room) and previews the seats the opponent count fills; joining starts
 * with the host's room code. The starting unit type is shared, and a footer that stays in reach
 * carries the one forward action: start, create or join. */
export function SetupDialog({mode, language, flag, leader, appearance, loadout, aiCount, maxAI, name, code, busy, inRoom, roomSeats, onMode, onAppearance, onLoadout, onAICount, onName, onCode, onStart, onCreateRoom, onJoinRoom}: {
 mode: SetupMode; language: Language; flag: Flag; leader: Leader; appearance?:CommanderAppearance; loadout: Kind[]; aiCount: string; maxAI: number; name: string;
 code: string; busy: boolean; inRoom: boolean; roomSeats?: Seat[]; onMode: (mode: SetupMode) => void; onAppearance: (target: 'playerLeader' | 'playerFlag') => void; onLoadout: (kind: Kind) => void;
 onAICount: (value: string) => void; onName: (value: string) => void; onCode: (value: string) => void; onStart: () => void; onCreateRoom: () => void; onJoinRoom: () => void;
}) {
 const text = (key: string) => t(language, key), solo = mode === 'setupSolo', joining = mode === 'setupJoin', minAI = solo ? 1 : 0;
 // The desktop client plays offline only.
 const lanAvailable = import.meta.env.MODE !== 'desktop';
 const range = text('aiRange').replace('{min}', String(minAI)).replace('{max}', String(maxAI));
 const validAI = validCount(aiCount, minAI, maxAI), validName = name.trim().length > 0;
 const aiSeats = validAI ? Number(aiCount) : 0, shownAI = Math.min(aiSeats, PREVIEW_AI_SEATS);
 const guests = inRoom && !solo ? (roomSeats ?? []).filter(seat => seat.id !== 0) : [];
 const modeOption = (value: SetupMode, icon: IconName, label: string, available = true) =>
  <button type="button" data-testid={value === 'setupSolo' ? 'setup-mode-solo' : 'setup-mode-lan'} aria-pressed={mode === value} disabled={!available}
   title={available ? undefined : text('desktopSoloOnly')} onClick={() => onMode(value)}>
   <span className="setup-mode-mark" aria-hidden="true"><Icon name={icon} size={17}/></span>{text(label)}
  </button>;
 return <>
  <div className="room-layout">
   <RoomHero appearance={appearance} language={language} leader={leader} flag={flag} name={name} edit={{onAppearance, onName}}/>
   <div className="room-panel">
    {joining
     ? <div className="setup-join">
      <label htmlFor="join-room-code">{text('roomCode')}</label>
      <input id="join-room-code" data-testid="join-room-code" placeholder={text('roomCode')} value={code} maxLength={6} autoComplete="off" spellCheck={false}
       onChange={event => onCode(event.target.value.toUpperCase().replace(/[^A-F0-9]/g, ''))}/>
     </div>
     : <>
      <div className="setup-mode" role="group" aria-label={text('gameMode')}>
       {modeOption('setupSolo', 'sabres', 'single')}
       {modeOption('setupLan', 'banner', 'multiplayer', lanAvailable)}
      </div>
      <SectionRibbon aside={1 + guests.length + aiSeats}>{text('players')}</SectionRibbon>
      <div className="seats" data-testid="setup-seats">
       <SeatRow language={language} index={0} name={name.trim() || text('yourName')} flag={flag} detail={text(appearance?'customCommander':leader)} you host={!solo}/>
       {guests.map(seat => <SeatRow key={seat.id} language={language} index={seat.id} name={seat.name} flag={seat.flag} detail={text(seat.appearance?'customCommander':seat.leader)} connected={seat.connected}/>)}
       {Array.from({length: shownAI}, (_, index) => <SeatRow key={`ai-${index}`} language={language} index={guests.length + index + 1} name={`${text('aiPlayer')} ${index + 1}`} detail={text('aiTag')} ai/>)}
       {aiSeats > shownAI && <p className="seat-note">{text('moreItems').replace('{count}', String(aiSeats - shownAI))}</p>}
       {!solo && !guests.length && <p className="seat-note seat-open">{text('waiting')}</p>}
      </div>
      <SectionRibbon>{text('campaignSettings')}</SectionRibbon>
      <div className="setup-ai">
       <label htmlFor="setup-ai-count">{text('aiCount')}</label>
       <NumberStepper id="setup-ai-count" testId="setup-ai-count" value={aiCount} min={minAI} max={maxAI} describedBy="setup-ai-range"
        fewerLabel={text('aiFewer')} moreLabel={text('aiMore')} onChange={onAICount}/>
       <small id="setup-ai-range">{range} · {text('aiLoadWarning')}</small>
      </div>
     </>}
    <SectionRibbon>{text('chooseUnits')}</SectionRibbon>
    <UnitSelection value={loadout[0]} onChange={kind => onLoadout(kind)} language={language}/>
   </div>
  </div>
  <div className="setup-footer">
   {solo && <button type="button" className="primary launch" data-testid="begin-campaign" disabled={!validName || !validAI} onClick={onStart}>{text('start')}<Icon name="forward" size={18}/></button>}
   {mode === 'setupLan' && <button type="button" className="primary launch" disabled={busy || !validName || !validAI} onClick={onCreateRoom}>{text(inRoom ? 'apply' : 'createRoom')}<Icon name="forward" size={18}/></button>}
   {joining && <button type="button" className="primary launch" disabled={busy || code.length !== 6 || !validName} onClick={onJoinRoom}>{text('joinRoom')}<Icon name="forward" size={18}/></button>}
  </div>
 </>;
}
