import {useEffect,useRef,useState,type MutableRefObject} from 'react';
import {WorldRenderer} from '../render/WorldRenderer.ts';
import type {GameState} from '../game/types.ts';
import {t,type Language} from './i18n.ts';
export function World({state,selected,language,onPick,onMode,worldRef}:{state:GameState;selected:number;language:Language;onPick:(id:number,attack:boolean)=>void;onMode:(near:boolean)=>void;worldRef:MutableRefObject<WorldRenderer|null>}){
 const host=useRef<HTMLDivElement>(null),callbacks=useRef({onPick,onMode}),[error,setError]=useState(false);callbacks.current={onPick,onMode};
 useEffect(()=>{let world:WorldRenderer|undefined;try{world=new WorldRenderer(host.current!,(id,attack)=>callbacks.current.onPick(id,attack),near=>callbacks.current.onMode(near));worldRef.current=world;}catch(e){console.error(e);setError(true);}return()=>{world?.dispose();worldRef.current=null;};},[worldRef]);
 useEffect(()=>{worldRef.current?.update(state,selected,language);},[state,selected,language,worldRef]);
 return <div className="world" ref={host} data-testid="world">{error&&<div className="render-error" role="alert">{t(language,'error.webgl')}</div>}</div>;
}
