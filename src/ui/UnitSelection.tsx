import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {KINDS,UNITS,UNIT_ATTRIBUTES,type UnitStats} from '../game/content.ts';
import type {Kind} from '../game/types.ts';
import {t,type Language} from './i18n.ts';

export function UnitAttributes({values,language}:{values:UnitStats;language:Language}){
 return <span className="unit-attributes" data-testid="unit-attributes">{UNIT_ATTRIBUTES.map(key=><span className="unit-attribute" key={key} data-stat={key}><span>{t(language,`attribute.${key}`)}</span><strong>{key==='splash'&&values[key]===0?t(language,'singleTarget'):Number(values[key].toFixed(2))}{key==='attackSpeed'?` ${t(language,'attacksPerSecond')}`:key==='train'?` ${t(language,'gameSeconds')}`:key==='speed'||key==='seaSpeed'?` ${t(language,'distancePerSecond')}`:key==='splash'&&values[key]>0||key==='range'?` ${t(language,'mapUnits')}`:''}</strong></span>)}</span>;
}

/** Local vector insignia stay sharp at any size and do not depend on a symbol font. */
function UnitIcon({kind}:{kind:Kind}){
 const cavalry=kind==='cavalry'||kind==='heavyCavalry',cannon=kind==='artillery'||kind==='horseArtillery';
 return <svg className="unit-icon" viewBox="0 0 120 100" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
  <path className="unit-icon-shield" d="M60 8 98 23v33L60 91 22 56V23Z"/>
  {cavalry?<><path d="m39 72 3-19 14-13-7-12 16 3 8-12 11 24-10 10 1 19H39Z" fill="currentColor" fillOpacity=".16"/><path d="m58 42 15 3m-26 8 10 9m14-26h1"/>{kind==='heavyCavalry'&&<path d="m32 31 9-5m-6 13 9-5m5 39h34M55 23l7 3"/>}</>:cannon?<><circle cx="48" cy="65" r="13"/><path d="m48 52 39-20 5 12-39 18m7 7 22 7M35 76h52m-39-24v26m-13-13h26"/>{kind==='horseArtillery'&&<path d="m30 34 12-8 6 12-8 8H28l3-8"/>}</>:kind==='engineer'?<><path d="m38 75 39-48m-44 1c14-8 28-3 37 11M78 25l10 9m-46 5 39 35m-2-5 5 5-5 5-5-5"/></>:kind==='grenadier'?<><circle cx="58" cy="60" r="20" fill="currentColor" fillOpacity=".16"/><path d="M56 40v-7h10v8m-5-8 5-9 9 2m-1-8 3-5m3 15 6 2m-36 29a9 9 0 0 1 6-9"/></>:<><path d="m38 74 42-49m-47 46 9 8m29-45 8 7m-37 22 8 7"/>{kind==='skirmisher'?<><path d="M35 34c13-14 35-14 50 0M60 29v16"/><path d="m31 44 8-7 8 7"/></>:<><path d="m41 25 42 49m-7 4 9-8m-40-36-7 7"/><path d="M50 23h20l6 7H44Z"/></>}</>}
 </svg>;
}

export function UnitSelection({value,onChange,language}:{value:Kind;onChange:(kind:Kind)=>void;language:Language}){
 const[active,setActive]=useState<Kind|null>(null),[position,setPosition]=useState<CSSProperties>({visibility:'hidden'});
 const keyboardFocus=useRef(false),pointerDown=useRef(false),touchToggle=useRef(false);
 const grid=useRef<HTMLDivElement>(null),tooltip=useRef<HTMLDivElement>(null),hideTimer=useRef<ReturnType<typeof setTimeout>>();
 const buttons=useRef<Partial<Record<Kind,HTMLButtonElement|null>>>({});
 const cancelHide=()=>clearTimeout(hideTimer.current);
 const show=(kind:Kind)=>{cancelHide();setActive(kind);};
 const leave=(kind:Kind)=>{cancelHide();hideTimer.current=setTimeout(()=>{if(!keyboardFocus.current||document.activeElement!==buttons.current[kind])setActive(current=>current===kind?null:current);},120);};
 useEffect(()=>()=>cancelHide(),[]);
 useEffect(()=>{
  if(!active)return;
  const dismiss=(event:PointerEvent)=>{if(!grid.current?.contains(event.target as Node)&&!tooltip.current?.contains(event.target as Node))setActive(null);};
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();cancelHide();setActive(null);}};
  document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',key,true);
  return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',key,true);};
 },[active]);
 useLayoutEffect(()=>{
  if(!active)return;
  const place=()=>{
   const anchor=buttons.current[active]?.getBoundingClientRect(),tip=tooltip.current;if(!anchor||!tip)return;
   const width=Math.min(340,window.innerWidth-24);tip.style.width=`${width}px`;
   const height=Math.min(tip.scrollHeight+2,window.innerHeight-24);
   if(anchor.bottom<=12||anchor.top>=window.innerHeight-12){setActive(null);return;}
   const below=Math.max(0,window.innerHeight-anchor.bottom-20),above=Math.max(0,anchor.top-20);
   const useBelow=below>=height||below>=above,maxHeight=Math.max(1,useBelow?below:above);
   // Never cover the active trigger: a second touch must always be able to dismiss.
   // Short landscapes scroll the tooltip itself instead of obscuring its trigger.
   const top=useBelow?anchor.bottom+8:anchor.top-Math.min(height,maxHeight)-8;
   setPosition({width,left:Math.max(12,Math.min(anchor.left+(anchor.width-width)/2,window.innerWidth-width-12)),top:Math.max(12,top),maxHeight});
  };
  place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[active,language]);
 return <div ref={grid} className="unit-grid" aria-label={t(language,'chooseUnits')}>{KINDS.map(kind=><div className="unit-choice" key={kind}>
  <button ref={node=>{buttons.current[kind]=node;}} className={`unit-card ${value===kind?'chosen':''}`} aria-pressed={value===kind} aria-label={t(language,kind)} aria-describedby={active===kind?`unit-tooltip-${kind}`:undefined} data-testid={`choose-unit-${kind}`} onFocus={()=>{keyboardFocus.current=!pointerDown.current;show(kind);}} onBlur={()=>setActive(current=>current===kind?null:current)} onPointerEnter={event=>{if(event.pointerType==='mouse'){keyboardFocus.current=false;show(kind);}}} onPointerDown={event=>{pointerDown.current=true;keyboardFocus.current=false;touchToggle.current=event.pointerType!=='mouse'&&active===kind;}} onPointerCancel={()=>{pointerDown.current=false;touchToggle.current=false;}} onPointerLeave={()=>leave(kind)} onClick={()=>{onChange(kind);cancelHide();if(touchToggle.current)setActive(null);else show(kind);pointerDown.current=false;touchToggle.current=false;}}>
   <span className="unit-name">{t(language,kind)}</span><UnitIcon kind={kind}/>
  </button>
 </div>)}{active&&createPortal(<div ref={tooltip} id={`unit-tooltip-${active}`} data-testid={`unit-tooltip-${active}`} className="unit-tooltip" role="tooltip" style={position} onPointerEnter={cancelHide} onPointerLeave={()=>leave(active)}>
  <strong>{t(language,active)}</strong><p>{t(language,`${active}.desc`)}</p><UnitAttributes values={UNITS[active]} language={language}/><small>{t(language,'baseStats')}</small>
 </div>,document.body)}</div>;
}
