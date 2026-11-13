import {factionColor} from '../game/factionColors.ts';
import type {RoomInfo, Ticket} from '../platform/session.ts';
import {FlagImage} from './Flag.tsx';
import {validCount} from './dialogs/SetupDialog.tsx';
import {Icon} from './icons.tsx';
import {t, type Language} from './i18n.ts';

/** The LAN war room: room code, seats (humans and reserved computer seats),
 * host-only opponent configuration and the start control. */
export function Lobby({room, ticket, network, busy, language, aiDraft, maxAI, onAIDraft, onApplyAI, onLeave, onStart}: {
 room: RoomInfo | null; ticket: Ticket | null; network: 'connected' | 'reconnecting'; busy: boolean; language: Language;
 aiDraft: string; maxAI: number; onAIDraft: (value: string) => void; onApplyAI: (count: number) => void; onLeave: () => void; onStart: () => void;
}) {
 const text = (key: string) => t(language, key), humans = room?.seats.length ?? 0, total = humans + (room?.aiCount ?? 0);
 const host = ticket?.actor === 0, locked = busy || !host || Boolean(room?.started);
 return <section className="lobby window" aria-labelledby="lobby-title">
  <header className="window-band">
   <span className="window-kicker">{text('lanTitle')}</span>
   <h2 id="lobby-title">{text('waiting')}</h2>
  </header>
  <div className="lobby-body">
   <div className="room-code-plate"><span>{text('roomCode')}</span><div className="room-code">{ticket?.code}</div></div>
   <div className="seats">{Array.from({length: total}, (_, index) => {
    const seat = room?.seats[index], computer = !seat;
    return <div key={index} className="seat" data-ai={computer}>
     <span className="faction-dot" style={{background: factionColor(index)}}/>
     {seat?.flag && <FlagImage flag={seat.flag} language={language}/>}
     <span className="seat-name">{seat?.name ?? `${text('aiPlayer')} ${index - humans + 1}`}</span>
     <small>{seat ? text(seat.leader) : text('aiPlayer')}</small>
     {seat && <span className="seat-status" data-connected={seat.connected}>{text(seat.connected ? 'connected' : 'offline')}</span>}
     {index === 0 && seat && <b>{text('host')}</b>}
    </div>;
   })}</div>
   <div className="ai-count-field">
    <label htmlFor="lobby-ai-count">{text('aiCount')}</label>
    <input id="lobby-ai-count" type="number" inputMode="numeric" min={0} max={maxAI} step={1} placeholder={`0–${maxAI}`} data-testid="lobby-ai-count"
     value={aiDraft} disabled={locked} aria-invalid={!validCount(aiDraft, 0, maxAI)} aria-describedby="lobby-ai-range" onChange={event => onAIDraft(event.target.value)}/>
    <button type="button" className="secondary" data-testid="apply-lobby-ai" disabled={locked || !validCount(aiDraft, 0, maxAI) || Number(aiDraft) === (room?.aiCount ?? 0)} onClick={() => onApplyAI(Number(aiDraft))}>{text('apply')}</button>
    <small id="lobby-ai-range">{text('aiRange').replace('{min}', '0').replace('{max}', String(maxAI))} · {text('aiLoadWarning')}</small>
   </div>
   <p className="muted" data-testid="lobby-human-count">{text('humanMinimum').replace('{count}', String(room?.onlineHumans ?? 0))}</p>
   <div className={`connection ${network}`}>● {text(network)}</div>
  </div>
  <div className="lobby-footer row">
   <button type="button" className="secondary" onClick={onLeave}><Icon name="back" size={16}/>{text('leave')}</button>
   {host
    ? <button type="button" className="primary" disabled={busy || (room?.onlineHumans ?? 0) < 2} onClick={onStart}>{text('startMatch')} →</button>
    : <span className="muted">{text('waitingHost')}</span>}
  </div>
 </section>;
}
