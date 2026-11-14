import {dispatchRibbon,type ScreenPoint} from './dispatchRibbon.ts';

const ns='http://www.w3.org/2000/svg';
let nextPreview=0;
const svg=<K extends keyof SVGElementTagNameMap>(tag:K)=>document.createElementNS(ns,tag);
const attrs=(node:Element,values:Record<string,string|number>)=>{for(const [k,v] of Object.entries(values))node.setAttribute(k,String(v));};
const path=(tag:string)=>{const result=svg('path');result.setAttribute(tag,'');return result;};

/** Screen-space preview above either map projection, below the HUD. Never intercepts input. */
export class DispatchPreview {
 private readonly element=svg('svg');
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
 constructor(host:HTMLElement){
  const id=`dispatch-preview-${++nextPreview}`,defs=svg('defs'),clip=svg('clipPath'),targetClip=svg('clipPath');
  attrs(this.element,{'class':'dispatch-preview','data-testid':'dispatch-preview','aria-hidden':'true'});
  attrs(clip,{id:`${id}-ribbon`,'data-dispatch-clip':''});clip.append(this.ribbonMask);
  attrs(targetClip,{id:`${id}-target`});attrs(this.targetMask,{'clip-rule':'evenodd'});targetClip.append(this.targetMask);
  defs.append(clip,targetClip);
  attrs(this.chevrons,{'data-dispatch-chevrons':'','clip-path':`url(#${id}-ribbon)`});
  attrs(this.glow,{'clip-path':`url(#${id}-target)`});
  for(let i=0;i<32;i++){const marker=svg('path');attrs(marker,{d:'M-4,-4L0,-4L4,0L0,4L-4,4L0,0Z'});this.markers.push(marker);this.chevrons.append(marker);}
  this.element.append(defs,this.glow,this.target,this.ribbon,this.chevrons,this.reticle);
  this.element.style.display='none';
  host.append(this.element);
 }
 show(source:number){this.clear();this.element.style.display='';this.element.dataset.phase='dragging';this.element.dataset.source=String(source);this.started=performance.now();this.animation=requestAnimationFrame(this.frame);}
 draw(source:ScreenPoint,cursor:ScreenPoint,target:number,targetPath:string){
  this.element.dataset.target=String(target);
  this.active=dispatchRibbon(source,cursor);
  const d=this.active?.d??'';
  attrs(this.ribbon,{d});attrs(this.ribbonMask,{d});
  if(this.target.getAttribute('d')!==targetPath){attrs(this.target,{d:targetPath});attrs(this.glow,{d:targetPath});attrs(this.targetMask,{d:targetPath});}
  attrs(this.reticle,{cx:cursor.x,cy:cursor.y,r:9});
 }
 release(){this.releaseAt=performance.now();this.element.dataset.phase='released';}
 clear(){
  cancelAnimationFrame(this.animation);this.animation=0;this.active=null;this.releaseAt=0;
  this.element.style.display='none';this.element.style.opacity='';
  delete this.element.dataset.phase;delete this.element.dataset.target;delete this.element.dataset.source;
 }
 dispose(){this.clear();this.element.remove();}
 private frame=(time:number)=>{
  if(this.releaseAt){
   const amount=Math.min(1,(time-this.releaseAt)/180);
   if(amount>=1){this.clear();return;}
   this.element.style.opacity=String(1-amount);
  }
  const geometry=this.active,spacing=34;
  const phase=((time-this.started)*.065%spacing+spacing)%spacing;
  for(let i=0;i<this.markers.length;i++){
   const marker=this.markers[i],t=geometry?(i*spacing+phase)/geometry.length:Infinity;
   if(!geometry||t>=geometry.tip){marker.style.display='none';continue;}
   const p=geometry.marker(t);marker.style.display='';
   attrs(marker,{transform:`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.angle.toFixed(1)}) scale(${p.scale.toFixed(3)})`,opacity:p.opacity.toFixed(3)});
  }
  this.animation=requestAnimationFrame(this.frame);
 };
}
