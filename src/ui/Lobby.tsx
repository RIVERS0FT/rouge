import {useEffect, useState} from 'react';
import {LobbyStage} from './LobbyStage.tsx';
import type {Workshop} from './CommanderAppearance.tsx';
import type {RoomInfo, Ticket} from '../platform/session.ts';
import {FlagImage} from './Flag.tsx';
import {Icon} from './icons.tsx';
import {t, type Language} from './i18n.ts';
import {ModalDialog} from './ModalDialog.tsx';
import {NumberStepper, validCount} from './NumberStepper.tsx';
import {SeatRow} from './Room.tsx';
import {LanguageSwitch} from './StartMenu.tsx';
import './lobby.css';

/** Plain HTTP on a LAN may only support the selection-based clipboard API. */
async function copyText(value: string): Promise<boolean> {
 try {await navigator.clipboard.writeText(value); return true;}
 catch {
  const previous = document.activeElement;
  const area = document.createElement('textarea');
  area.value = value; area.readOnly = true; area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.append(area); area.select();
  try {return document.execCommand('copy');} catch {return false;} finally {
   area.remove();
   if(previous instanceof HTMLElement && previous.isConnected) previous.focus({preventScroll: true});
  }
 }
}

export function Lobby({room, ticket, network, busy, language, aiDraft, maxAI, onLanguage, onAIDraft, onApplyAI, onLeave, onStart, onDeployment, onCustomize,editor}: {
 editor?:Workshop;
 room: RoomInfo | null; ticket: Ticket | null; network: 'connected' | 'reconnecting'; busy: boolean; language: Language;
 aiDraft: string; maxAI: number; onLanguage: (language: Language) => void; onAIDraft: (value: string) => void;
 onApplyAI: (count: number) => void; onLeave: () => void; onStart: () => void; onDeployment: () => void; onCustomize: () => void;
}) {
 const text = (key: string) => t(language, key);
 const seats = room?.seats ?? [], ai = room?.aiCount ?? 0, total = seats.length + ai, online = room?.onlineHumans ?? 0;
 const hostId = room?.host ?? 0, host = ticket?.actor === hostId, ready = online >= (room?.minPlayers ?? 2);
 const locked = busy || !host || !room || room.started || network !== 'connected';
 const [panel, setPanel] = useState<'invite' | 'settings' | null>(null);
 const [copied, setCopied] = useState(false);
 const [page, setPage] = useState(0);
 const [portrait, setPortrait] = useState(() => matchMedia('(max-aspect-ratio: 4/5)').matches);
 useEffect(() => {
  if(!panel) return;
  const close = (event: KeyboardEvent) => {
   if(event.key === 'Escape') {event.preventDefault(); setPanel(null);}
  };
  document.addEventListener('keydown', close);
  return () => document.removeEventListener('keydown', close);
 }, [panel]);
 useEffect(() => {
  const mq = matchMedia('(max-aspect-ratio: 4/5)'), resize = () => setPortrait(mq.matches);
  mq.addEventListener('change', resize);
  return () => mq.removeEventListener('change', resize);
 }, []);
 useEffect(() => {
  if(!copied) return;
  const timer = setTimeout(() => setCopied(false), 2000);
  return () => clearTimeout(timer);
 }, [copied]);
 const size = portrait ? 1 : 3, pages = Math.max(1, Math.ceil(seats.length / size)), current = Math.min(page, pages - 1);
 const group = seats.slice(current * size, (current + 1) * size);
 // Place the host in the foremost, middle position of the first three-person tableau.
 const positions = group.length === 1 ? ['solo'] : ['center', 'left', 'right'];
 const canInvite = room && !room.started && total < room.capacity;
 // An open place in the tableau becomes the invitation; with none on screen it sits by the room code.
 const openPlace = canInvite && !portrait && current === pages - 1 && group.length < 3 ? (group.length === 1 ? 'left' : 'right') : null;
 const invite = () => setPanel('invite');
 async function copyCode() {
  if(!ticket) return;
  if(await copyText(ticket.code)) setCopied(true);
  else setPanel('invite');
 }

 const me=seats.find(seat=>seat.id===ticket?.actor);
 return <section className="lobby party-room" data-editing={Boolean(editor)} aria-labelledby="lobby-title">
  <LobbyStage seats={editor&&me?[{...me,appearance:editor.draft}]:group} language={language} editor={editor}/>
  <header className="party-header">
   <div className="party-brand">ROUGE{language === 'zh' && <span> · 诸省之争</span>}</div>
   <h2 id="lobby-title">{text('partyLobby')}</h2>
   <div className="party-network" data-state={network} role="status"><i/>{text(network === 'connected' ? 'lanNetwork' : 'reconnecting')}</div>
   <button type="button" className="party-code" data-testid="copy-room-code" onClick={copyCode} disabled={!ticket}
    aria-label={text('copy')} title={text('copy')}>
    <span>{text('roomCode')}</span><strong className="room-code">{ticket?.code}</strong><Icon name="copy" size={17}/>
   </button>
   {canInvite && !openPlace && <button type="button" className="party-invite-link" onClick={invite} aria-haspopup="dialog">
    <Icon name="plus" size={16}/>{text('invitePlayer')}
   </button>}
  </header>
  <div className="party-stage" aria-label={text('players')}>
   {group.map((seat,i) => <article key={seat.id} className="party-member" data-seat={seat.id} data-position={positions[i]} data-online={seat.connected}
     data-leader={seat.leader} data-custom={Boolean(seat.appearance)}>
     <div className="party-nameplate">
      <div className="party-name">{seat.flag && <FlagImage flag={seat.flag} language={language}/>}<strong title={seat.name}>{seat.name}</strong></div>
      <div className="party-role">{seat.id === hostId && <><Icon name="crown" size={16}/>{text('host')}</>}
       {seat.id !== hostId && seat.connected && text('joinedRoom')}
       {!seat.connected && <span className="party-offline">{text('offline')}</span>}
       {seat.id === ticket?.actor && <small>· {text('sideYou')}</small>}
      </div>
     </div>
    </article>)}
   {openPlace && <button type="button" className="party-invite" data-position={openPlace} onClick={invite} aria-haspopup="dialog">
    <span className="party-name"><Icon name="plus" size={18}/>{text('invitePlayer')}</span>
    <span className="party-role">{text('openSeat')}</span>
   </button>}
   {pages > 1 && <nav className="party-pages" aria-label={text('players')}>
    <button type="button" aria-label={text('partyPrevious')} disabled={current===0} onClick={() => setPage(current-1)}><Icon name="back" size={18}/></button>
    <span>{current+1} / {pages}</span>
    <button type="button" aria-label={text('partyNext')} disabled={current+1===pages} onClick={() => setPage(current+1)}><Icon name="forward" size={18}/></button>
   </nav>}
  </div>
  <footer className="party-footer">
   <div className="party-actions">
    <button type="button" className="party-leave" onClick={onLeave}><Icon name="exit" size={18}/>{text('leave')}</button>
    <button type="button" className="party-settings" data-testid="lobby-customize" disabled={busy || !room || room.started || network!=='connected'} onClick={onCustomize}>
     <Icon name="military" size={18}/>{text('customCommander')}
    </button>
    <button type="button" className="party-settings" data-testid="room-settings" onClick={() => setPanel('settings')} aria-haspopup="dialog">
     <Icon name="gear" size={18}/>{text('campaignSettings')}{ai > 0 && <small>{text('aiTag')} × {ai}</small>}
    </button>
   </div>
   <small className="party-ready" data-testid="lobby-human-count" data-ready={ready}>{text('humanMinimum').replace('{count}',String(online))}</small>
   {host ? <button type="button" className="party-launch" disabled={locked || !ready} onClick={onStart}>
    {text('startMatch')}<Icon name="forward" size={20}/>
   </button> : <span className="party-wait"><Icon name="hourglass" size={16}/>{text('waitingHost')}</span>}
  </footer>
  <span role="status" className={copied ? 'party-feedback' : 'visually-hidden'}>{copied && text('copied')}</span>
  {panel && <ModalDialog label={text(panel === 'invite' ? 'invitePlayer' : 'campaignSettings')}
   title={text(panel === 'invite' ? 'invitePlayer' : 'campaignSettings')} className="party-dialog"
   closeLabel={text('close')} pageKey={panel} onClose={() => setPanel(null)}>
   {panel === 'invite' ? <>
    <p>{text('inviteHint')}</p>
    <label className="party-share">{text('roomCode')}<input readOnly value={ticket?.code ?? ''} onFocus={event => event.currentTarget.select()}/></label>
    <button type="button" className="secondary" disabled={!ticket} onClick={copyCode}><Icon name="copy" size={16}/>{text(copied ? 'copied' : 'copy')}</button>
   </> : <>
    <h3>{text('players')} · {total}</h3>
    <div className="seats">{seats.map(seat => <SeatRow key={seat.id} language={language} index={seat.id} name={seat.name} flag={seat.flag}
     detail={text(seat.appearance?'customCommander':seat.leader)} you={ticket?.actor === seat.id} host={seat.id === hostId} connected={seat.connected}/>)}
     {Array.from({length: ai}, (_,i) => <SeatRow key={`ai-${i}`} language={language} index={seats.length+i} name={`${text('aiPlayer')} ${i+1}`} detail={text('aiTag')} ai/>)}</div>
    <div className="setup-ai party-ai">
     <label htmlFor="lobby-ai-count">{text('aiCount')}</label>
     <NumberStepper id="lobby-ai-count" testId="lobby-ai-count" value={aiDraft} min={0} max={maxAI} disabled={locked} describedBy="lobby-ai-range"
      fewerLabel={text('aiFewer')} moreLabel={text('aiMore')} onChange={onAIDraft}/>
     <button type="button" className="secondary" data-testid="apply-lobby-ai" disabled={locked || !validCount(aiDraft,0,maxAI) || Number(aiDraft) === ai} onClick={() => onApplyAI(Number(aiDraft))}>{text('apply')}</button>
     <small id="lobby-ai-range">{text('aiRange').replace('{min}', '0').replace('{max}', String(maxAI))} · {text('aiLoadWarning')}</small>
    </div>
    {host && <button type="button" className="secondary" data-testid="room-deployment" disabled={locked}
     onClick={() => {setPanel(null); onDeployment();}}>{text('setup')}<Icon name="forward" size={16}/></button>}
    <div className="party-language">{text('language')}<LanguageSwitch language={language} onLanguage={onLanguage}/></div>
   </>}
  </ModalDialog>}
 </section>;
}
