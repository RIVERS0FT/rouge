import {useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {placeTip, type TipPlacement} from './tipPlacement.ts';

export type {TipPlacement};

type TipProps = {
 content: ReactNode;
 children: ReactNode;
 placement?: TipPlacement;
 className?: string;
 as?: 'span' | 'div' | 'li';
 /** Non-button triggers become focusable so keyboard users can read them. */
 focusable?: boolean;
 /** Touch users can tap informational (non-button) triggers to read them. */
 tapToggle?: boolean;
 testId?: string;
 style?: CSSProperties;
 label?: string;
};

/**
 * A rich, live tooltip in the grand-strategy style: hover (with a short delay),
 * keyboard focus or a tap reveals a breakdown panel rendered in a portal.
 * Hover tooltips never swallow Escape, so the menu shortcut keeps working while
 * the pointer rests on the HUD; keyboard-opened tooltips dismiss first.
 */
export function Tip({content, children, placement = 'below', className, as: Tag = 'span', focusable = false, tapToggle = false, testId, style, label}: TipProps) {
 const id = `tip-${useId().replace(/:/g, '')}`;
 const anchor = useRef<HTMLElement | null>(null), tip = useRef<HTMLDivElement>(null);
 const timer = useRef<ReturnType<typeof setTimeout>>();
 const [open, setOpen] = useState<null | 'hover' | 'focus' | 'tap'>(null);
 // Pressing the trigger dismisses a hover tooltip until the pointer leaves, so a
 // freshly opened panel is never covered by the hint that pointed to it.
 const suppressed = useRef(false);
 const [position, setPosition] = useState<CSSProperties>({visibility: 'hidden', top: 0, left: 0});
 const clear = () => clearTimeout(timer.current);
 const show = useCallback((reason: 'hover' | 'focus' | 'tap', wait = 0) => {
  clear();
  if(wait) timer.current = setTimeout(() => setOpen(current => current ?? reason), wait);
  else setOpen(reason);
 }, []);
 const hide = useCallback(() => {clear(); setOpen(null);}, []);
 useEffect(() => clear, []);
 useLayoutEffect(() => {
  if(!open || !anchor.current || !tip.current) return;
  const place = () => {
   if(!anchor.current || !tip.current) return;
   const rect = anchor.current.getBoundingClientRect();
   if(!rect.width && !rect.height) {setOpen(null); return;}
   const next = placeTip(rect, {width: tip.current.offsetWidth, height: tip.current.offsetHeight}, {width: window.innerWidth, height: window.innerHeight}, placement);
   setPosition({top: next.top, left: next.left});
  };
  place();
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
  return () => {window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);};
 }, [open, placement, content]);
 useEffect(() => {
  if(!open) {setPosition({visibility: 'hidden', top: 0, left: 0}); return;}
  const key = (event: KeyboardEvent) => {
   if(event.key !== 'Escape') return;
   if(open !== 'hover') {event.preventDefault(); event.stopImmediatePropagation();}
   hide();
  };
  const outside = (event: PointerEvent) => {if(!anchor.current?.contains(event.target as Node)) hide();};
  document.addEventListener('keydown', key, true);
  document.addEventListener('pointerdown', outside, true);
  return () => {document.removeEventListener('keydown', key, true); document.removeEventListener('pointerdown', outside, true);};
 }, [open, hide]);
 // The wrapper tag varies, but every option is a plain HTML element with the same props.
 const Element = Tag as 'div';
 return <Element ref={(node: HTMLDivElement | null) => {anchor.current = node;}} className={className} style={style} data-testid={testId}
  tabIndex={focusable ? 0 : undefined} aria-label={label} aria-describedby={open ? id : undefined}
  onPointerEnter={event => {if(event.pointerType === 'mouse' && !suppressed.current) show('hover', 220);}}
  onPointerLeave={event => {
   if(event.pointerType !== 'mouse') return;
   suppressed.current = false;
   if(open !== 'focus' && open !== 'tap') hide(); else clear();
  }}
  onPointerDown={event => {if(!tapToggle && event.pointerType === 'mouse') {suppressed.current = true; hide();}}}
  onFocus={event => {if(!suppressed.current && (event.target as HTMLElement).matches(':focus-visible')) show('focus');}}
  onBlur={() => {if(open === 'focus') hide();}}
  onClick={tapToggle ? () => setOpen(current => current ? null : 'tap') : undefined}>
  {children}
  {open && createPortal(<div ref={tip} id={id} role="tooltip" className="hud-tip" style={position}>{content}</div>, document.body)}
 </Element>;
}

export function TipTitle({children, aside}: {children: ReactNode; aside?: ReactNode}) {
 return <div className="tip-title"><span>{children}</span>{aside !== undefined && <b>{aside}</b>}</div>;
}
export function TipRow({label, value, tone}: {label: ReactNode; value: ReactNode; tone?: 'good' | 'bad' | 'gold' | 'muted'}) {
 return <div className="tip-row"><span>{label}</span><b data-tone={tone}>{value}</b></div>;
}
export function TipNote({children}: {children: ReactNode}) {
 return <p className="tip-note">{children}</p>;
}
