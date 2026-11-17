import {useEffect,useRef,useState,type MutableRefObject} from 'react';
import {WorldRenderer} from '../render/WorldRenderer.ts';
import type {MarchFraction} from '../game/countryActions.ts';
import type {GameState} from '../game/types.ts';
import {t,type Language} from './i18n.ts';
export function World({state,selected,actor,language,onPick,onMode,onDispatch,onArmy,selectedArmy=null,worldRef}:{state:GameState;selected:number;actor:number;language:Language;onPick:(id:number,attack:boolean)=>void;onMode:(near:boolean)=>void;onDispatch:(sources:number[],target:number,fraction:MarchFraction)=>void;onArmy?:(id:number)=>void;selectedArmy?:number|null;worldRef:MutableRefObject<WorldRenderer|null>}){
 const host=useRef<HTMLDivElement>(null),callbacks=useRef({onPick,onMode,onDispatch,onArmy}),[error,setError]=useState(false);callbacks.current={onPick,onMode,onDispatch,onArmy};
 useEffect(()=>{let world:WorldRenderer|undefined;try{world=new WorldRenderer(host.current!,(id,attack)=>callbacks.current.onPick(id,attack),near=>callbacks.current.onMode(near),(sources,target,fraction)=>callbacks.current.onDispatch(sources,target,fraction),id=>callbacks.current.onArmy?.(id));worldRef.current=world;}catch(e){console.error(e);setError(true);}return()=>{world?.dispose();worldRef.current=null;};},[worldRef]);
 useEffect(()=>{worldRef.current?.update(state,selected,language,actor);},[state,selected,language,actor,worldRef]);
 useEffect(()=>{worldRef.current?.setSelectedArmy(selectedArmy);},[selectedArmy,worldRef]);
 return <div className="world" ref={host} data-testid="world">{error&&<div className="render-error" role="alert">{t(language,'error.webgl')}</div>}</div>;
}
