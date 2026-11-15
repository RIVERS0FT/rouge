import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {KINDS,UNITS,UNIT_ATTRIBUTES,type UnitStats} from '../game/content.ts';
import type {Kind} from '../game/types.ts';
import {t,type Language} from './i18n.ts';
import {unitTooltipPosition} from './unit-tooltip-position.ts';
import infantry from '../assets/units/infantry.webp';
import cavalry from '../assets/units/cavalry.webp';
import artillery from '../assets/units/artillery.webp';
import engineer from '../assets/units/engineer.webp';
import skirmisher from '../assets/units/skirmisher.webp';
import grenadier from '../assets/units/grenadier.webp';
import heavyCavalry from '../assets/units/heavyCavalry.webp';
import horseArtillery from '../assets/units/horseArtillery.webp';

export function UnitAttributes({values,language}:{values:UnitStats;language:Language}){
 return <span className="unit-attributes" data-testid="unit-attributes">{UNIT_ATTRIBUTES.map(key=><span className="unit-attribute" key={key} data-stat={key}><span>{t(language,`attribute.${key}`)}</span><strong>{key==='splash'&&values[key]===0?t(language,'singleTarget'):Number(values[key].toFixed(2))}{key==='attackSpeed'?` ${t(language,'attacksPerSecond')}`:key==='train'?` ${t(language,'gameSeconds')}`:key==='speed'||key==='seaSpeed'?` ${t(language,'distancePerSecond')}`:key==='splash'&&values[key]>0||key==='range'?` ${t(language,'mapUnits')}`:''}</strong></span>)}</span>;
}

const unitPortraits:Record<Kind,string>={infantry,cavalry,artillery,engineer,skirmisher,grenadier,heavyCavalry,horseArtillery};

// The adjacent unit name labels the control; the portrait is decorative.
export function UnitIcon({kind}:{kind:Kind}){
 return <img className="unit-icon" src={unitPortraits[kind]} alt="" decoding="async" draggable={false}/>;
}

export function UnitSelection({value,onChange,language}:{value:Kind;onChange:(kind:Kind)=>void;language:Language}){
 const[active,setActive]=useState<Kind|null>(null),[position,setPosition]=useState<CSSProperties>({visibility:'hidden'});
 const keyboardFocus=useRef(false),pointerDown=useRef(false),touchToggle=useRef(false);
 const grid=useRef<HTMLDivElement>(null),tooltip=useRef<HTMLDivElement>(null),hideTimer=useRef<ReturnType<typeof setTimeout>>();
 // Removing a portal can expose another card under a stationary mouse.
 // Escape stays dismissed until actual movement or explicit focus/click intent.
 const dismissedPointer=useRef<{x:number;y:number}|null>(null),lastPointer=useRef({x:0,y:0});
 const buttons=useRef<Partial<Record<Kind,HTMLButtonElement|null>>>({});
 const cancelHide=()=>clearTimeout(hideTimer.current);
 const show=(kind:Kind)=>{cancelHide();setActive(kind);};
 const leave=(kind:Kind)=>{cancelHide();hideTimer.current=setTimeout(()=>{if(!keyboardFocus.current||document.activeElement!==buttons.current[kind])setActive(current=>current===kind?null:current);},120);};
 useEffect(()=>{
  const move=(event:PointerEvent)=>{if(event.pointerType==='mouse'){
   const point={x:event.clientX,y:event.clientY};
   if(dismissedPointer.current&&(point.x!==dismissedPointer.current.x||point.y!==dismissedPointer.current.y))dismissedPointer.current=null;
   lastPointer.current=point;
  }};
  document.addEventListener('pointermove',move,true);
  return()=>{cancelHide();document.removeEventListener('pointermove',move,true);};
 },[]);
 useLayoutEffect(()=>{
  if(!active)return;
  const dismiss=(event:PointerEvent)=>{if(!grid.current?.contains(event.target as Node)&&!tooltip.current?.contains(event.target as Node))setActive(null);};
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();cancelHide();dismissedPointer.current={...lastPointer.current};setActive(null);}};
  document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',key,true);
  return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',key,true);};
 },[active]);
 useLayoutEffect(()=>{
  if(!active)return;
  const place=(reveal=false):void=>{
   const button=buttons.current[active],anchor=button?.getBoundingClientRect(),tip=tooltip.current,area=grid.current?.getBoundingClientRect();if(!button||!anchor||!tip||!area)return;
   // Measure the unconstrained panel at its responsive width before placing it.
   const width=Math.min(380,window.innerWidth-24);tip.style.width=`${width}px`;
   const modal=grid.current?.closest('.setup-modal');
   const close=modal?.querySelector('.modal-close')?.getBoundingClientRect();
   const body=modal?.querySelector('.modal-body'),bodyRect=body?.getBoundingClientRect();
   const bounds={top:Math.max(12,close?close.bottom+8:0),bottom:window.innerHeight-12};
   // Once manual scrolling hides the card, dismiss instead of following it offscreen.
   if(bodyRect&&(anchor.bottom<=bodyRect.top||anchor.top>=bodyRect.bottom)){setActive(null);return;}
   const height=tip.getBoundingClientRect().height;
   const placement=unitTooltipPosition(anchor,{width,height},{width:window.innerWidth,height:window.innerHeight},bounds);
   if(!placement){
    // Narrow phones have no side space. Reveal enough room beside the card once,
    // without constraining the panel or pulling back after manual scrolling.
    if(reveal&&body&&height+anchor.height+8<=bounds.bottom-bounds.top){
     const current=body.scrollTop,max=body.scrollHeight-body.clientHeight;
     const below=Math.ceil(current+anchor.bottom+8+height-bounds.bottom)+2;
     const above=Math.floor(current+anchor.top-bounds.top-height-8)-2;
     const target=[below,above].filter(next=>next>=0&&next<=max).sort((a,b)=>Math.abs(a-current)-Math.abs(b-current))[0];
     if(target!==undefined){body.scrollTop=target;place();return;}
    }
    setActive(null);return;
   }
   setPosition({...placement,width});
  };
  const update=()=>place();
  place(true);window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
  return()=>{window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};
 },[active,language]);
 // Pointer-enter can fire under a stationary mouse when an appearance editor closes.
 // Require movement for hover intent; focus and taps still open the tooltip directly.
 // Pointer focus happens before click: wait for selection before revealing a tooltip
 // that may scroll the card away from the pointer. Keyboard focus can reveal it now.
 return <div ref={grid} className="unit-grid" aria-label={t(language,'chooseUnits')}>{KINDS.map(kind=><div className="unit-choice" key={kind}>
  <button ref={node=>{buttons.current[kind]=node;}} className={`unit-card ${value===kind?'chosen':''}`} aria-pressed={value===kind} aria-label={t(language,kind)} aria-describedby={active===kind?`unit-tooltip-${kind}`:undefined} data-testid={`choose-unit-${kind}`} onFocus={()=>{dismissedPointer.current=null;keyboardFocus.current=!pointerDown.current;if(keyboardFocus.current)show(kind);}} onBlur={()=>setActive(current=>current===kind?null:current)} onPointerMove={event=>{if(event.pointerType==='mouse'&&!dismissedPointer.current){keyboardFocus.current=false;show(kind);}}} onPointerDown={event=>{dismissedPointer.current=null;pointerDown.current=true;keyboardFocus.current=false;touchToggle.current=event.pointerType!=='mouse'&&active===kind;}} onPointerCancel={()=>{pointerDown.current=false;touchToggle.current=false;}} onPointerLeave={()=>leave(kind)} onClick={()=>{onChange(kind);cancelHide();if(touchToggle.current)setActive(null);else show(kind);pointerDown.current=false;touchToggle.current=false;}}>
   <span className="unit-name">{t(language,kind)}</span><UnitIcon kind={kind}/>
  </button>
 </div>)}{active&&createPortal(<div ref={tooltip} id={`unit-tooltip-${active}`} data-testid={`unit-tooltip-${active}`} className="unit-tooltip" role="tooltip" style={position} onPointerEnter={cancelHide} onPointerLeave={()=>leave(active)}>
  <strong>{t(language,active)}</strong><p>{t(language,`${active}.desc`)}</p><UnitAttributes values={UNITS[active]} language={language}/><small>{t(language,'baseStats')}</small>
 </div>,document.body)}</div>;
}
