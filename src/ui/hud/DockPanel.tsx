import type {ReactNode, Ref} from 'react';
import {Icon} from '../icons.tsx';

/**
 * Shared frame for every docked window: a claret title band with brass
 * keylines, an independently scrolling body and an optional footer. Docked
 * windows are non-modal; the map stays live beside them.
 */
export function DockPanel({id, className = '', bandClassName = '', bodyRef, kicker, title, titleId, status, leading, closeLabel, onClose, children, footer}: {
 id: string; className?: string; bandClassName?: string; bodyRef?: Ref<HTMLDivElement>; kicker: ReactNode; title: ReactNode; titleId: string;
 status?: ReactNode; leading?: ReactNode; closeLabel: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
 return <aside id={id} className={`dock-panel ${className}`} aria-labelledby={titleId}>
  <header className={`dock-band ${bandClassName}`}>
   {leading && <div className="dock-band-leading">{leading}</div>}
   <span className="dock-kicker">{kicker}</span>
   <h2 id={titleId}>{title}</h2>
   {status}
   <button type="button" className="dock-close" onClick={onClose} aria-label={closeLabel} title={closeLabel}><Icon name="close" size={16}/></button>
  </header>
  <div className="dock-body" ref={bodyRef}>{children}</div>
  {footer}
 </aside>;
}

/** A slim claret ribbon that titles a section inside a panel. */
export function SectionRibbon({children, aside}: {children: ReactNode; aside?: ReactNode}) {
 return <div className="section-ribbon"><span>{children}</span>{aside !== undefined && <b>{aside}</b>}</div>;
}

/** Segmented progress used for upgrade levels and garrison slots. */
export function Pips({value, total, className = ''}: {value: number; total: number; className?: string}) {
 return <span className={`pips ${className}`} aria-hidden="true">
  {Array.from({length: total}, (_, index) => <i key={index} data-on={index < value}/>)}
 </span>;
}
