import {useEffect,useRef,useState} from 'react';
import type {Seat} from '../platform/session.ts';
import type {EditorView,LobbyScene} from '../render/lobbyScene.ts';
import {AppearanceEditor,type Workshop} from './CommanderAppearance.tsx';
import {t,type Language} from './i18n.ts';

const bustView:EditorView={full:false};
export function LobbyStage({seats,language,editor}:{seats:Seat[];language:Language;editor?:Workshop}){
 const canvas=useRef<HTMLCanvasElement>(null),scene=useRef<LobbyScene|null>(null),latest=useRef(seats);
 const [failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 const [view,setView]=useState(bustView),[rendered,setRendered]=useState('');
 const activeView=editor?view:null,latestView=useRef(activeView);
 useEffect(()=>{latestView.current=activeView;scene.current?.setEditor(activeView);if(!activeView){setView(bustView);setRendered('');}},[activeView]);
 useEffect(()=>{
  let active=true;
  const fail=()=>{if(active)setFailed(true);};
  async function mount(){
   const {LobbyScene}=await import('../render/lobbyScene.ts');
   if(!active)return;
   const el=canvas.current!;
   const instance=new LobbyScene(el,el.closest<HTMLElement>('.party-room')!,fail,recipe=>{if(active)setRendered(recipe);});
   scene.current=instance;instance.setEditor(latestView.current);instance.setSeats(latest.current);await instance.load();
  }
  mount().catch(fail);
  return ()=>{active=false;scene.current?.dispose();scene.current=null;};
 },[attempt]);
 useEffect(()=>{latest.current=seats;scene.current?.setSeats(seats);},[seats]);
 const retry=()=>{setRendered('');setFailed(false);setAttempt(n=>n+1);};
 return <>
  <canvas key={attempt} className="party-canvas" data-testid="party-scene" ref={canvas} tabIndex={0}
   aria-label={t(language,'lobbyCamera')} title={t(language,'lobbyCamera')}/>
  {editor&&<AppearanceEditor language={language} editor={editor} view={view} onView={setView} onRotate={degrees=>scene.current?.rotateEditor(degrees)}
   ready={rendered===JSON.stringify(editor.draft)} failed={failed} onRetry={retry}/>}
  {failed&&!editor&&<div className="party-scene-error" role="alert">{t(language,'lobbySceneError')}
   <button className="secondary" onClick={retry}>{t(language,'appearanceRetry')}</button></div>}
 </>;
}
