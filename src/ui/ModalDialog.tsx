import {useEffect,useRef,type ReactNode} from 'react';

const FOCUSABLE='button:not(:disabled),[href],input:not(:disabled):not([hidden]),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]';
/** A single modal shell for settings and its archives sub-page. */
export function ModalDialog({children,className,label,closeLabel,onClose,pageKey}:{
 children:ReactNode;className?:string;label:string;closeLabel:string;onClose:()=>void;pageKey:string;
}) {
 const dialog=useRef<HTMLElement>(null);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  const key=(event:KeyboardEvent)=>{
   if(event.key!=='Tab'||!dialog.current)return;
   const nodes=Array.from(dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el=>el.getClientRects().length>0);
   if(!nodes.length){event.preventDefault();dialog.current.focus();return;}
   const first=nodes[0],last=nodes[nodes.length-1];
   if(event.shiftKey&&(document.activeElement===first||!dialog.current.contains(document.activeElement))){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&(document.activeElement===last||!dialog.current.contains(document.activeElement))){event.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',key);
  return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus({preventScroll:true});};
 },[]);
 useEffect(()=>{dialog.current?.querySelector<HTMLElement>('button')?.focus({preventScroll:true});dialog.current?.scrollTo(0,0);},[pageKey]);
 return <div className="modal-backdrop" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
  <section className={`modal ${className??''}`} ref={dialog} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
   <button className="modal-close" onClick={onClose} aria-label={closeLabel}>×</button>
   {children}
  </section>
 </div>;
}
