import {useEffect,useRef,useState,type ImgHTMLAttributes,type PointerEvent} from 'react';
import {defaultAppearance,skinColors,slots,wardrobe,type BodyType,type CommanderAppearance} from '../game/portrait.ts';
import {t,type Language} from './i18n.ts';
import type {EditorView} from '../render/lobbyScene.ts';
import {Icon} from './icons.tsx';

function usePreview(appearance:CommanderAppearance|undefined,full:boolean,angle:number,retry=0) {
 const recipe=appearance?JSON.stringify(appearance):'',key=JSON.stringify([recipe,full,angle,retry]);
 const [result,setResult]=useState({key:'',image:'',failed:false});
 useEffect(()=>{
  if(!recipe)return;
  let current=true;
  const timer=setTimeout(async()=>{
   try{
    const {renderCommander}=await import('./commanderRender.ts');
    const image=await renderCommander(JSON.parse(recipe),full,angle);
    if(current)setResult({key,image,failed:false});
   }catch{if(current)setResult(previous=>({key,image:previous.image,failed:true}));}
  },50);
  return ()=>{current=false;clearTimeout(timer);};
 },[key,recipe,full,angle]);
 return {image:recipe?result.image:'',ready:result.key===key&&!result.failed,failed:result.key===key&&result.failed};
}

export function CommanderImage({appearance,full=false,fallback,...props}:ImgHTMLAttributes<HTMLImageElement>&{
 appearance?:CommanderAppearance;full?:boolean;fallback:string;
}) {
 const preview=usePreview(appearance,full,12);
 return <img {...props} src={appearance&&preview.ready?preview.image:fallback}
  data-custom-appearance={appearance?(preview.ready?'ready':preview.failed?'error':'loading'):undefined}/>;
}

const descriptions:Record<string,string>={
 european:'欧式',african:'非洲',american:'美式',arabic:'阿拉伯',asian:'亚洲',british:'英式',chinese:'中式',french:'法式',
 gb:'英国',admiral:'海军上将礼服',indian:'印度',japanese:'日式',russian:'俄式',military:'军用',common:'常服',court:'宫廷',greatcoat:'大衣',
 blue:'蓝色',red:'红色',white:'白色',short:'短发',haircut:'',royal:'王室',imperial:'皇家',cap:'便帽',high:'礼装',mid:'常装',
};
function optionName(id:string,language:Language){
 const tokens=id.split('_').slice(2);
 return language==='zh'?tokens.map(token=>descriptions[token]??token).join(' '):tokens.map(s=>s==='gb'?'British':s[0].toUpperCase()+s.slice(1)).join(' ');
}

export interface Workshop {
 draft:CommanderAppearance;onChange:(draft:CommanderAppearance)=>void;onApply:(draft:CommanderAppearance)=>void;
 onClose:()=>void;onPresets?:()=>void;busy:boolean;message:string;
}
export function AppearanceEditor({language,editor,view,onView,onRotate,ready,failed,onRetry}:{
 language:Language;editor:Workshop;view:EditorView;onView:(view:EditorView)=>void;ready:boolean;failed:boolean;onRetry:()=>void;
 onRotate:(degrees:number)=>void;
}){
 const {draft,onChange}=editor,[outfit,setOutfit]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null),text=(key:string)=>t(language,key);
 const drag=useRef<{id:number;x:number}|null>(null);
 useEffect(()=>{const el=dialog.current!;el.showModal();return ()=>el.close();},[]);
 function set<K extends keyof CommanderAppearance>(key:K,value:CommanderAppearance[K]){onChange({...draft,[key]:value});}
 function setBody(body:BodyType){
  onChange({...defaultAppearance(body),skin:draft.skin,hairColor:draft.hairColor,age:draft.age,cheek:draft.cheek,nose:draft.nose});
 }
 function startDrag(event:PointerEvent<HTMLDivElement>){
  if(drag.current||!event.isPrimary||event.button!==0||event.target!==event.currentTarget)return;
  event.currentTarget.setPointerCapture(event.pointerId);
  drag.current={id:event.pointerId,x:event.clientX};
 }
 function endDrag(event:PointerEvent<HTMLDivElement>){
  if(drag.current?.id!==event.pointerId)return;
  drag.current=null;
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
 }
 function moveDrag(event:PointerEvent<HTMLDivElement>){
  const pointer=drag.current;
  if(pointer?.id!==event.pointerId)return;
  if(!(event.buttons&1)){endDrag(event);return;}
  const delta=event.clientX-pointer.x;
  pointer.x=event.clientX;
  onRotate(delta*360/Math.max(1,event.currentTarget.clientWidth));
 }
 return <dialog ref={dialog} className="commander-workshop" aria-labelledby="workshop-title" onCancel={event=>{event.preventDefault();editor.onClose();}}>
  <div className="workshop-subject">
   <div className="workshop-preview-space" data-testid="appearance-preview" data-ready={ready}
    role="group" tabIndex={0} aria-label={text('rotateCommander')} title={text('rotateCommander')} aria-keyshortcuts="ArrowLeft ArrowRight"
    onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
    onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();onRotate(event.key==='ArrowLeft'?-5:5);}}}>
    {(!ready||failed)&&<div className="workshop-status" role="status">{text(failed?'appearanceFailed':'appearanceLoading')}{failed&&<button type="button" onClick={onRetry}>{text('appearanceRetry')}</button>}</div>}
   </div>
   <div className="workshop-camera">
    {[false,true].map(value=><button type="button" key={String(value)} aria-pressed={view.full===value} onClick={()=>onView({full:value})}>{text(value?'appearanceFull':'appearanceBust')}</button>)}
   </div>
  </div>
  <section className="workshop-panel">
   <header><h2 id="workshop-title">{text('customCommander')}</h2><button type="button" aria-label={text('close')} onClick={editor.onClose}>×</button></header>
   <nav aria-label={text('customCommander')}>{[false,true].map(value=><button type="button" key={String(value)} data-testid={value?'outfit-tab':'face-tab'} aria-pressed={outfit===value} onClick={()=>setOutfit(value)}>{text(value?'appearanceOutfit':'appearanceFace')}</button>)}</nav>
   <div className="workshop-fields" key={String(outfit)}>
   {!outfit&&<>
   <label>{text('appearanceBody')}<select data-testid="appearance-body" value={draft.body} onChange={e=>setBody(e.target.value as BodyType)}>
    <option value="male">{text('appearanceMale')}</option><option value="female">{text('appearanceFemale')}</option></select></label>
   <fieldset className="skin-swatches"><legend>{text('appearanceSkin')}</legend>{skinColors.map((color,i)=><button type="button" style={{backgroundColor:color}} key={color} aria-pressed={draft.skin===i} aria-label={text('appearanceSkin')+' '+(i+1)} onClick={()=>set('skin',i)}/>)}</fieldset>
   {(['cheek','nose','age'] as const).map(field=><label key={field}>{text('appearance.'+field)}
    <span className="workshop-value"><input type="range" data-testid={'appearance-'+field} min={field==='age'?0:-100} max="100" value={draft[field]} onChange={e=>set(field,Number(e.target.value))}/><output>{draft[field]}</output></span></label>)}
   <label>{text('appearanceHairColor')}<input type="color" value={draft.hairColor} onChange={e=>set('hairColor',e.target.value)}/></label>
   </>}
   {slots.filter(slot=>wardrobe[draft.body][slot].length>0&&outfit===['uniform','trousers','hat','shoulders'].includes(slot)).map(slot=><label key={slot}>{text('appearance.'+slot)}
    <select data-testid={'appearance-'+slot} value={draft[slot]} onChange={e=>set(slot,e.target.value)}>
     {slot!=='uniform'&&slot!=='trousers'&&<option value="">{text('appearanceNone')}</option>}
     {wardrobe[draft.body][slot].map(id=><option key={id} value={id}>{optionName(id,language)}</option>)}
    </select></label>)}
  </div>
   {editor.message&&<div className="workshop-message" role="status">{editor.message}</div>}
   <footer>{editor.onPresets&&<button type="button" className="workshop-presets" onClick={editor.onPresets}>{text('appearancePresets')}</button>}
    <button type="button" className="workshop-apply" data-testid="apply-appearance" disabled={!ready||failed||editor.busy} onClick={()=>editor.onApply(draft)}>{text('applyAppearance')}<Icon name="forward" size={15}/></button></footer>
  </section>
 </dialog>;
}
