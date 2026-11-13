import {useEffect, useRef, type ReactNode} from 'react';
import {Icon} from './icons.tsx';

const FOCUSABLE = 'button:not(:disabled),[href],input:not(:disabled):not([hidden]),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]';

/**
 * One modal window shell: brass-framed body, optional claret title band, a
 * round close medallion, Tab focus containment and focus restoration.
 * The close button stays first in DOM order so it receives initial focus.
 */
export function ModalDialog({children, className, label, closeLabel, onClose, pageKey, title, kicker}: {
 children: ReactNode; className?: string; label: string; closeLabel: string; onClose: () => void; pageKey: string; title?: ReactNode; kicker?: ReactNode;
}) {
 const dialog = useRef<HTMLElement>(null), body = useRef<HTMLDivElement>(null);
 useEffect(() => {
  const previous = document.activeElement as HTMLElement | null;
  const key = (event: KeyboardEvent) => {
   if(event.key !== 'Tab' || !dialog.current) return;
   const nodes = Array.from(dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.getClientRects().length > 0);
   if(!nodes.length) {event.preventDefault(); dialog.current.focus(); return;}
   const first = nodes[0], last = nodes[nodes.length - 1];
   if(event.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement))) {event.preventDefault(); last.focus();}
   else if(!event.shiftKey && (document.activeElement === last || !dialog.current.contains(document.activeElement))) {event.preventDefault(); first.focus();}
  };
  document.addEventListener('keydown', key);
  return () => {document.removeEventListener('keydown', key); if(previous?.isConnected) previous.focus({preventScroll: true});};
 }, []);
 useEffect(() => {
  dialog.current?.querySelector<HTMLElement>('button')?.focus({preventScroll: true});
  body.current?.scrollTo(0, 0);
 }, [pageKey]);
 return <div className="modal-backdrop" onClick={event => {if(event.target === event.currentTarget) onClose();}}>
  <section className={`modal ${className ?? ''}`} ref={dialog} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
   <button type="button" className="modal-close" onClick={onClose} aria-label={closeLabel}><Icon name="close" size={18}/></button>
   {title !== undefined && <header className="window-band">{kicker && <span className="window-kicker">{kicker}</span>}<h2>{title}</h2></header>}
   <div className="modal-body" ref={body}>{children}</div>
  </section>
 </div>;
}
