import {dispatchRibbon,type ScreenPoint} from './dispatchRibbon.ts';
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
 draw(routes:readonly AttackRoute[],project:(route:AttackRoute,copy:number)=>[ScreenPoint,ScreenPoint]|null,color:(owner:number)=>string){
  const keep=new Set<string>();
  for(const route of routes)for(const copy of [-1,0,1]){
   const endpoints=project(route,copy);if(!endpoints)continue;
   const geometry=dispatchRibbon(...endpoints,0);if(!geometry)continue;
   const key=`${route.owner}:${route.from}:${route.to}:${copy}`;keep.add(key);
   let path=this.paths.get(key);
   if(!path){path=document.createElementNS(ns,'path');path.dataset.owner=String(route.owner);path.dataset.from=String(route.from);path.dataset.to=String(route.to);this.paths.set(key,path);this.element.append(path);}
   if(path.getAttribute('d')!==geometry.d)path.setAttribute('d',geometry.d);
   path.setAttribute('fill',color(route.owner));path.dataset.units=String(route.units);
  }
  for(const [key,path]of this.paths)if(!keep.has(key)){path.remove();this.paths.delete(key);}
  this.element.dataset.routes=String(routes.length);
 }
 dispose(){this.element.remove();this.paths.clear();}
}
