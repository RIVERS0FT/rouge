import {ARROW_ART_UNIT,dispatchRibbon,type ScreenPoint} from './dispatchRibbon.ts';
import type {ArrowProjection} from './groundArrowProjection.ts';
import type {AttackRoute} from './attackRoutes.ts';

const ns='http://www.w3.org/2000/svg';
/** Persistent, static SVG routes: camera changes reproject them; no animation loop. */
export class AttackArrows {
 private element=document.createElementNS(ns,'svg');
 private paths=new Map<string,SVGPathElement>();
 constructor(host:HTMLElement){
  this.element.setAttribute('class','attack-arrows');this.element.setAttribute('data-testid','attack-arrows');
  this.element.setAttribute('aria-hidden','true');host.append(this.element);
 }
 draw(routes:readonly AttackRoute[],ground:(route:AttackRoute,copy:number)=>[ScreenPoint,ScreenPoint]|null,projection:ArrowProjection,width:number,height:number,color:(owner:number)=>string){
  const keep=new Set<string>();
  for(const route of routes)for(const copy of [-1,0,1]){
   const endpoints=ground(route,copy);if(!endpoints)continue;
   const [a,b]=endpoints,pad=40*ARROW_ART_UNIT;
   const x=Math.min(a.x,b.x)-pad,y=Math.min(a.y,b.y)-pad,right=Math.max(a.x,b.x)+pad,bottom=Math.max(a.y,b.y)+pad;
   const bounds=projection.polygon([{x,y},{x:right,y},{x:right,y:bottom},{x,y:bottom}]);
   if(!bounds.length||bounds.every(p=>p.x<0)||bounds.every(p=>p.x>width)||bounds.every(p=>p.y<0)||bounds.every(p=>p.y>height))continue;
   const geometry=dispatchRibbon(...endpoints,0,ARROW_ART_UNIT,projection);if(!geometry)continue;
   const key=`${route.owner}:${route.from}:${route.to}:${copy}`;keep.add(key);
   let path=this.paths.get(key);
   if(!path){path=document.createElementNS(ns,'path');path.dataset.owner=String(route.owner);path.dataset.from=String(route.from);path.dataset.to=String(route.to);this.paths.set(key,path);this.element.append(path);}
   if(path.getAttribute('d')!==geometry.d)path.setAttribute('d',geometry.d);
   path.style.strokeWidth=String(geometry.outlineWidth);path.setAttribute('fill',color(route.owner));path.dataset.units=String(route.units);
  }
  for(const [key,path]of this.paths)if(!keep.has(key)){path.remove();this.paths.delete(key);}
  this.element.dataset.routes=String(routes.length);
 }
 dispose(){this.element.remove();this.paths.clear();}
}
