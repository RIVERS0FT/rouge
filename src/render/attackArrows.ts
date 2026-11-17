import {ARROW_ART_UNIT,dispatchRibbon,type ScreenPoint} from './dispatchRibbon.ts';
import type {ArrowProjection} from './groundArrowProjection.ts';
import type {AttackRoute} from './attackRoutes.ts';

const ns='http://www.w3.org/2000/svg';
/** Persistent, static SVG routes: camera changes reproject them; no animation loop. */
export class AttackArrows {
 private element=document.createElementNS(ns,'svg');
 private paths=new Map<string,{ribbon:SVGPathElement;outline:SVGPathElement}>();
 private geometry=new Map<string,{d:string;outline:string}|null>();
 private projectionKey:string|undefined;
 constructor(host:HTMLElement){
  this.element.setAttribute('class','attack-arrows');this.element.setAttribute('data-testid','attack-arrows');
  this.element.setAttribute('aria-hidden','true');host.append(this.element);
 }
 draw(routes:readonly AttackRoute[],ground:(route:AttackRoute,copy:number)=>[ScreenPoint,ScreenPoint]|null,projection:ArrowProjection,width:number,height:number,color:(owner:number)=>string,projectionKey?:string){
  if(projectionKey===undefined||projectionKey!==this.projectionKey){this.geometry.clear();this.projectionKey=projectionKey;}
  const keep=new Set<string>(),used=new Set<string>();
  for(const route of routes)for(const copy of [-1,0,1]){
   const key=`${route.owner}:${route.from}:${route.to}:${copy}`;used.add(key);
   let geometry=this.geometry.get(key);
   if(geometry===undefined){
    const endpoints=ground(route,copy);geometry=null;
    if(endpoints){
     const [a,b]=endpoints,pad=40*ARROW_ART_UNIT;
     const x=Math.min(a.x,b.x)-pad,y=Math.min(a.y,b.y)-pad,right=Math.max(a.x,b.x)+pad,bottom=Math.max(a.y,b.y)+pad;
     const bounds=projection.polygon([{x,y},{x:right,y},{x:right,y:bottom},{x,y:bottom}]);
     if(bounds.length&&!bounds.every(p=>p.x<0)&&!bounds.every(p=>p.x>width)&&!bounds.every(p=>p.y<0)&&!bounds.every(p=>p.y>height)){
      const ribbon=dispatchRibbon(...endpoints,0,ARROW_ART_UNIT,projection);if(ribbon)geometry={d:ribbon.d,outline:ribbon.outline().d};
     }
    }
    this.geometry.set(key,geometry);
   }
   if(!geometry)continue;keep.add(key);
   let paths=this.paths.get(key);
   if(!paths){
    const ribbon=document.createElementNS(ns,'path'),outline=document.createElementNS(ns,'path');
    outline.dataset.attackOutline='';ribbon.dataset.owner=String(route.owner);ribbon.dataset.from=String(route.from);ribbon.dataset.to=String(route.to);
    paths={ribbon,outline};this.paths.set(key,paths);this.element.append(ribbon,outline);
   }
   const path=paths.ribbon;
   if(path.getAttribute('d')!==geometry.d)path.setAttribute('d',geometry.d);
   if(paths.outline.getAttribute('d')!==geometry.outline)paths.outline.setAttribute('d',geometry.outline);
   const fill=color(route.owner),units=String(route.units);
   if(path.getAttribute('fill')!==fill)path.setAttribute('fill',fill);
   if(path.dataset.units!==units)path.dataset.units=units;
  }
  for(const [key,paths]of this.paths)if(!keep.has(key)){paths.ribbon.remove();paths.outline.remove();this.paths.delete(key);}
  for(const key of this.geometry.keys())if(!used.has(key))this.geometry.delete(key);
  this.element.dataset.routes=String(routes.length);
 }
 dispose(){this.element.remove();this.paths.clear();this.geometry.clear();}
}
