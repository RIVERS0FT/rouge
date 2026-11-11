import {useRef,useState,type PointerEvent} from 'react';
import {FLAG_PRESETS,FLAG_PATTERNS,FLAG_SHAPES,MAX_FLAG_SHAPES,flagShapeFromDrag,type Flag,type FlagShape} from '../game/flags.ts';
import {FlagImage,FlagShapeArt,FLAG_NAMES,PATTERN_NAMES} from './Flag.tsx';
import type {Language} from './i18n.ts';
const SHAPE_NAMES={circle:['圆形','Circle'],rect:['矩形','Rectangle'],triangle:['三角形','Triangle'],star:['星形','Star']} as const;
export function FlagEditor({value,onChange,language}:{value:Flag;onChange:(flag:Flag)=>void;language:Language}){
 const zh=language==='zh',index=zh?0:1;
 const [brush,setBrush]=useState<FlagShape['kind']>('circle'),[ink,setInk]=useState('#ffffff'),[preview,setPreview]=useState<FlagShape|null>(null),[selected,setSelected]=useState(-1);
 const [history,setHistory]=useState<Flag[]>([]),drag=useRef<{id:number;start:{x:number;y:number}}|null>(null);
 const commit=(next:Flag)=>{setHistory(h=>[...h.slice(-29),structuredClone(value)]);onChange(next);};
 const point=(event:PointerEvent<SVGSVGElement>)=>{const r=event.currentTarget.getBoundingClientRect();return{x:(event.clientX-r.left)/r.width*90,y:(event.clientY-r.top)/r.height*60};};
 const cancel=()=>{drag.current=null;setPreview(null);};
 const start=(event:PointerEvent<SVGSVGElement>)=>{
  if(value.type!=='custom'||(value.shapes?.length??0)>=MAX_FLAG_SHAPES||drag.current||event.button!==0)return;
  event.preventDefault();drag.current={id:event.pointerId,start:point(event)};event.currentTarget.setPointerCapture(event.pointerId);setPreview(null);
 };
 const move=(event:PointerEvent<SVGSVGElement>)=>{if(drag.current?.id===event.pointerId)setPreview(flagShapeFromDrag(brush,ink,drag.current.start,point(event)));};
 const finish=(event:PointerEvent<SVGSVGElement>)=>{
  if(drag.current?.id!==event.pointerId)return;
  const shape=flagShapeFromDrag(brush,ink,drag.current.start,point(event));cancel();
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  if(shape&&value.type==='custom'&&(value.shapes?.length??0)<MAX_FLAG_SHAPES){setSelected(value.shapes?.length??0);commit({...value,shapes:[...(value.shapes??[]),shape]});}
 };
 return <section className="flag-editor" data-testid="flag-editor">
  <div className="flag-controls"><FlagImage flag={value} language={language}/><label>{zh?'预设 / 自定义':'Preset / Custom'}<select aria-label={zh?'旗帜类型':'Flag type'} value={value.type==='preset'?value.id:'custom'} onChange={e=>{cancel();setSelected(-1);commit(e.target.value==='custom'?{type:'custom',pattern:'horizontal',colors:['#243e4b','#ffffff','#d0b67d']}:{type:'preset',id:e.target.value as typeof FLAG_PRESETS[number]});}}>{FLAG_PRESETS.map(id=><option key={id} value={id}>{FLAG_NAMES[id][index]}</option>)}<option value="custom">{zh?'自定义':'Custom'}</option></select></label>
  {value.type==='custom'&&<><label>{zh?'图案':'Pattern'}<select aria-label={zh?'旗帜图案':'Flag pattern'} value={value.pattern} onChange={e=>commit({...value,pattern:e.target.value as typeof FLAG_PATTERNS[number]})}>{FLAG_PATTERNS.map(p=><option key={p} value={p}>{PATTERN_NAMES[p][index]}</option>)}</select></label>{value.colors.map((color,i)=><label key={i}>{zh?'颜色':'Color'} {i+1}<input type="color" aria-label={`${zh?'旗帜颜色':'Flag color'} ${i+1}`} value={color} onChange={e=>{const colors=[...value.colors] as [string,string,string];colors[i]=e.target.value;commit({...value,colors});}}/></label>)}</>}</div>
  {value.type==='custom'&&<div className="flag-drawing">
   <div className="flag-brushes"><label>{zh?'形状画笔':'Shape brush'}<select data-testid="flag-shape-brush" value={brush} onChange={e=>{cancel();setBrush(e.target.value as FlagShape['kind']);}}>{FLAG_SHAPES.map(k=><option key={k} value={k}>{SHAPE_NAMES[k][index]}</option>)}</select></label><label>{zh?'画笔颜色':'Brush color'}<input type="color" data-testid="flag-brush-color" value={ink} onChange={e=>setInk(e.target.value)}/></label></div>
   <div className="flag-drawing-canvas"><FlagImage flag={value} language={language} cloth={false}/><svg data-testid="flag-drawing-surface" viewBox="0 0 90 60" aria-label={zh?'拖动绘制旗帜图形':'Drag to draw flag shapes'} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}>{preview&&<g opacity=".7"><FlagShapeArt shape={preview}/></g>}</svg></div>
   <div className="flag-drawing-actions"><label>{zh?'已绘图形':'Drawn shapes'}<select data-testid="flag-shape-selection" value={selected} onChange={e=>setSelected(Number(e.target.value))}><option value={-1}>{zh?'选择图形':'Select a shape'}</option>{value.shapes?.map((shape,i)=><option value={i} key={i}>{i+1}. {SHAPE_NAMES[shape.kind][index]}</option>)}</select></label><button type="button" className="secondary" data-testid="flag-delete-shape" disabled={selected<0||selected>=(value.shapes?.length??0)} onClick={()=>{commit({...value,shapes:value.shapes?.filter((_,i)=>i!==selected)});setSelected(-1);}}>{zh?'删除选中':'Delete selected'}</button><button type="button" className="secondary" data-testid="flag-clear-shapes" disabled={!value.shapes?.length} onClick={()=>{commit({...value,shapes:[]});setSelected(-1);}}>{zh?'清空图形':'Clear shapes'}</button><span aria-live="polite" data-testid="flag-shape-count">{value.shapes?.length??0} / {MAX_FLAG_SHAPES}</span></div>
  </div>}
  <button type="button" className="secondary flag-undo" data-testid="flag-undo" disabled={!history.length} onClick={()=>{cancel();const previous=history.at(-1);if(previous){onChange(previous);setHistory(history.slice(0,-1));setSelected(-1);}}}>{zh?'撤销上一步':'Undo last change'}</button>
 </section>;
}
