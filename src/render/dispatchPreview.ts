import {ARROW_ART_UNIT,dispatchRibbon,type ScreenPoint} from './dispatchRibbon.ts';
import type {ArrowProjection} from './groundArrowProjection.ts';
import type {PaintedPreview,RoutePaintLayer} from './routePaintLayer.ts';

const ns='http://www.w3.org/2000/svg';
let nextPreview=0;
const svg=<K extends keyof SVGElementTagNameMap>(tag:K)=>document.createElementNS(ns,tag);
const attrs=(node:Element,values:Record<string,string|number>)=>{for(const [k,v] of Object.entries(values))node.setAttribute(k,String(v));};
const path=(tag:string)=>{const result=svg('path');result.setAttribute(tag,'');return result;};

/** Ground-projected arrow plus screen-space cursor and target feedback. Never intercepts input. */
export class DispatchPreview {
 private readonly element=svg('svg');
 private readonly tier=document.createElement('button');
 private readonly tierCount=document.createElement('span');
 private readonly tierHint=document.createElement('span');
 private readonly ribbon=path('data-dispatch-ribbon');
 private readonly ribbonMask=path('data-dispatch-ribbon-mask');
 private readonly target=path('data-dispatch-target');
 private readonly targetMask=path('data-dispatch-target-mask');
 private readonly glow=path('data-dispatch-glow');
 private readonly reticle=svg('circle');
 private readonly chevrons=svg('g');
 private readonly markers:SVGPathElement[]=[];
 private active:ReturnType<typeof dispatchRibbon>=null;
 private animation=0;
 private started=0;
 private releaseAt=0;
 private drawn:Omit<PaintedPreview,'markers'|'opacity'>|null=null;
 private paintedMarkers:PaintedPreview['markers']=[];
 private readonly layer?:RoutePaintLayer;
 constructor(host:HTMLElement,layer?:RoutePaintLayer){
  this.layer=layer;
  if(layer)this.element.style.opacity='0';
  const id=`dispatch-preview-${++nextPreview}`,defs=svg('defs'),clip=svg('clipPath'),targetClip=svg('clipPath');
  attrs(this.element,{'class':'dispatch-preview','data-testid':'dispatch-preview','aria-hidden':'true'});
  attrs(clip,{id:`${id}-ribbon`,'data-dispatch-clip':''});clip.append(this.ribbonMask);
  attrs(targetClip,{id:`${id}-target`});attrs(this.targetMask,{'clip-rule':'evenodd'});targetClip.append(this.targetMask);
  defs.append(clip,targetClip);
  attrs(this.chevrons,{'data-dispatch-chevrons':'','clip-path':`url(#${id}-ribbon)`});
  attrs(this.glow,{'clip-path':`url(#${id}-target)`});
  for(let i=0;i<32;i++){const marker=svg('path');this.markers.push(marker);this.chevrons.append(marker);}
  this.element.append(defs,this.glow,this.target,this.ribbon,this.chevrons,this.reticle);
  this.element.style.display='none';
  this.tier.type='button';this.tier.tabIndex=-1;this.tier.hidden=true;
  this.tier.className='dispatch-tier';this.tier.dataset.testid='dispatch-tier';
  this.tierHint.className='dispatch-tier-hint';this.tierHint.setAttribute('aria-hidden','true');
  this.tier.append(this.tierCount,this.tierHint);
  host.append(this.element,this.tier);
 }
 show(source:number){this.clear();this.element.style.display='';this.element.dataset.phase='dragging';this.element.dataset.source=String(source);this.started=performance.now();this.animation=requestAnimationFrame(this.frame);}
 draw(source:ScreenPoint,targetPoint:ScreenPoint|null,projection:ArrowProjection,cursor:ScreenPoint,target:number,targetPath:string,targetOutline=targetPath){
  this.element.dataset.target=String(target);
  this.active=targetPoint?dispatchRibbon(source,targetPoint,target>=0?0:undefined,ARROW_ART_UNIT,projection):null;
  const d=this.active?.d??'';
  attrs(this.ribbon,{d});attrs(this.ribbonMask,{d});
  if(this.target.getAttribute('d')!==targetOutline){attrs(this.target,{d:targetOutline});attrs(this.glow,{d:targetOutline});}
  if(this.targetMask.getAttribute('d')!==targetPath)attrs(this.targetMask,{d:targetPath});
  attrs(this.reticle,{cx:cursor.x,cy:cursor.y,r:9});
  this.drawn={d,target:targetOutline,targetMask:targetPath,cx:cursor.x,cy:cursor.y};
  this.paint(performance.now());
 }
 showTier(fraction:number,count:number,language:'zh'|'en',touch:boolean){
  const percent=`${fraction*100}%`,label=language==='zh'?`出兵 ${count} · ${percent}`:`Dispatch ${count} · ${percent}`;
  this.tier.hidden=false;this.tier.dataset.touch=String(touch);this.tier.dataset.fraction=String(fraction);this.tier.dataset.count=String(count);
  this.tier.setAttribute('aria-label',touch?`${label} · ${language==='zh'?'轻触切换档位':'Tap to change tier'}`:label);
  if(this.tierCount.textContent!==label)this.tierCount.textContent=label;
  this.tierHint.hidden=!touch;if(touch&&!this.tierHint.textContent)this.tierHint.textContent='⇄';
 }
 isTierControl(target:EventTarget|null){return target instanceof Node&&this.tier.contains(target);}
 release(){this.releaseAt=performance.now();this.element.dataset.phase='released';this.tier.hidden=true;}
 clear(){
  cancelAnimationFrame(this.animation);this.animation=0;this.active=null;this.releaseAt=0;
  this.element.style.display='none';this.element.style.opacity=this.layer?'0':'';this.tier.hidden=true;
  this.drawn=null;this.paintedMarkers=[];this.layer?.setPreview(null);
  delete this.element.dataset.phase;delete this.element.dataset.target;delete this.element.dataset.source;
 }
 dispose(){this.clear();this.element.remove();this.tier.remove();}
 private paint(time:number){
  if(this.layer&&this.drawn)this.layer.setPreview({...this.drawn,markers:this.paintedMarkers,opacity:this.releaseAt?Math.max(0,1-(time-this.releaseAt)/180):1});
 }
 private frame=(time:number)=>{
  if(this.releaseAt){
   const amount=Math.min(1,(time-this.releaseAt)/180);
   if(amount>=1){this.clear();return;}
   if(!this.layer)this.element.style.opacity=String(1-amount);
  }
  const geometry=this.active,spacing=34*ARROW_ART_UNIT;
  const phase=((time-this.started)*(.065*ARROW_ART_UNIT)%spacing+spacing)%spacing;
  const painted=[];
  for(let i=0;i<this.markers.length;i++){
   const marker=this.markers[i],t=geometry?(i*spacing+phase)/geometry.length:Infinity;
   if(!geometry||t>=geometry.tip){marker.style.display='none';continue;}
   const d=geometry.markerPath(t);marker.style.display=d?'':'none';
   const opacity=geometry.marker(t).opacity.toFixed(3);
   attrs(marker,{d,opacity});if(d)painted.push({d,opacity:Number(opacity)});
  }
  this.paintedMarkers=painted;this.paint(time);
  this.animation=requestAnimationFrame(this.frame);
 };
}
