import type {CommanderAppearance} from '../game/portrait.ts';
import type {ReactNode} from 'react';
import {factionColor} from '../game/factionColors.ts';
import type {Flag} from '../game/flags.ts';
import type {Leader} from '../game/types.ts';
import {FlagImage} from './Flag.tsx';
import {Icon} from './icons.tsx';
import {t, type Language} from './i18n.ts';
import {LeaderBust} from './LeaderBust.tsx';

/** The commander as the room's centrepiece: a full-height leader portrait with the flag,
 * portrait title and commander name set at its foot. While deploying, the portrait and the
 * flag open their appearance editors and the name is typed in place; in a room they are fixed. */
export function RoomHero({language, leader, appearance, flag, name, tags, edit}: {
 language: Language; leader?: Leader; appearance?:CommanderAppearance; flag?: Flag; name: string; tags?: ReactNode;
 edit?: {onAppearance: (target: 'playerLeader' | 'playerFlag') => void; onName: (value: string) => void};
}) {
 const text = (key: string) => t(language, key);
 const portrait = leader && <LeaderBust appearance={appearance} leader={leader} label={appearance?name:text(leader)}/>, emblem = flag && <FlagImage flag={flag} language={language}/>;
 return <section className="room-hero" data-leader={leader}>
  {edit
   ? <button type="button" className="room-hero-portrait" data-testid="edit-player-leader" data-leader={leader} aria-label={text('editPlayerLeader')} aria-haspopup="dialog"
    onClick={() => edit.onAppearance('playerLeader')}>{portrait}<span className="room-hero-edit">{text('editAppearance')}<Icon name="forward" size={13}/></span></button>
   : <div className="room-hero-portrait">{portrait}</div>}
  <div className="room-hero-plate">
   {edit
    ? <button type="button" className="room-hero-flag" data-testid="edit-player-flag" aria-label={text('editPlayerFlag')} aria-haspopup="dialog" onClick={() => edit.onAppearance('playerFlag')}>{emblem}</button>
    : <span className="room-hero-flag">{emblem}</span>}
   <div className="room-hero-copy">
    {leader && !appearance && <span className="room-hero-title">{text(leader)}</span>}
    {edit
     ? <label className="room-hero-name"><span>{text('commander')}</span>
      <input data-testid="commander-name" value={name} maxLength={24} aria-invalid={!name.trim()} onChange={event => edit.onName(event.target.value)}/></label>
     : <strong className="room-hero-name">{name}</strong>}
    {tags && <span className="room-hero-tags">{tags}</span>}
   </div>
  </div>
 </section>;
}

/** One seat of a room: faction colour, flag (a hatched plate for computer seats), name, tags,
 * a detail such as the portrait title, and the connection of human players in a live room. */
export function SeatRow({language, index, name, flag, detail, you = false, host = false, ai = false, connected}: {
 language: Language; index: number; name: string; flag?: Flag; detail?: string; you?: boolean; host?: boolean; ai?: boolean; connected?: boolean;
}) {
 return <div className="seat" data-ai={ai} data-you={you || undefined}>
  <span className="faction-dot" style={{background: factionColor(index)}}/>
  <span className="seat-emblem">{flag && <FlagImage flag={flag} language={language}/>}</span>
  <span className="seat-name">{name}</span>
  {you && <b className="seat-tag you">{t(language, 'sideYou')}</b>}
  {host && <b className="seat-tag">{t(language, 'host')}</b>}
  {detail && <small>{detail}</small>}
  {connected !== undefined && <span className="seat-status" data-connected={connected}><span className="seat-status-text">{t(language, connected ? 'connected' : 'offline')}</span></span>}
 </div>;
}
