import {ARROW_ART_UNIT,dispatchRibbon,svgPath,type ScreenPoint} from './dispatchRibbon.ts';
import type {ArrowProjection} from './groundArrowProjection.ts';
import type {AttackRoute} from './attackRoutes.ts';
import type {PaintedRoute,RoutePaintLayer} from './routePaintLayer.ts';
import {marchRibbon,type GroundRoute} from './groundRouteMesh.ts';

const ns='http://www.w3.org/2000/svg';
function groundContour(a:ScreenPoint,b:ScreenPoint){
 const ribbon=dispatchRibbon(a,b,0,ARROW_ART_UNIT);
 if(!ribbon)return null;
 const outline=ribbon.outline();
 return {a,b,body:ribbon.projected,edge:outline.projected,paint:{d:ribbon.d,outline:outline.d}};
}
/** Persistent routes: camera changes reproject them; no animation loop. SVG paths are geometry metadata when a paint layer is supplied. */
export class AttackArrows {
 private element=document.createElementNS(ns,'svg');
 private group=document.createElementNS(ns,'g');
 private paths=new Map<string,{ribbon:SVGPathElement;outline:SVGPathElement;geometry?:PaintedRoute}>();
 private geometry=new Map<string,PaintedRoute|null>();
 private contours=new Map<string,NonNullable<ReturnType<typeof groundContour>>>();
 private legs=new Map<string,{ax:number;ay:number;bx:number;by:number;mesh:Float32Array}>();
 private projectionKey:string|undefined;
 private readonly layer?:RoutePaintLayer;
 constructor(host:HTMLElement,layer?:RoutePaintLayer){
  this.layer=layer;
  if(layer)this.element.style.opacity='0';
  this.element.setAttribute('class','attack-arrows');this.element.setAttribute('data-testid','attack-arrows');
  this.element.setAttribute('aria-hidden','true');this.element.append(this.group);host.append(this.element);
 }
 draw(routes:readonly AttackRoute[],ground:(route:AttackRoute,copy:number)=>[ScreenPoint,ScreenPoint]|null,projection:ArrowProjection,width:number,height:number,color:(owner:number)=>string,projectionKey?:string){
  if(projectionKey===undefined||projectionKey!==this.projectionKey){this.geometry.clear();this.projectionKey=projectionKey;}
  const keep=new Set<string>(),used=new Set<string>(),painted:GroundRoute[]=[];
  const affine=this.layer&&projection.affine,transform=affine?`matrix(${affine.join(' ')})`:'';
  if(transform){if(this.group.getAttribute('transform')!==transform)this.group.setAttribute('transform',transform);}
  else this.group.removeAttribute('transform');
  for(const route of routes)for(const copy of [-1,0,1]){
   const key=`${route.segment??(route.owner+':'+route.from+':'+route.to)}:${copy}`;
   if(route.segment&&this.layer){
    const endpoints=ground(route,copy);if(!endpoints)continue;
    const [a,b]=endpoints,pad=1;if(a.x===b.x&&a.y===b.y)continue;
    if(projection.mayIntersect&&!projection.mayIntersect(Math.min(a.x,b.x)-pad,Math.min(a.y,b.y)-pad,Math.max(a.x,b.x)+pad,Math.max(a.y,b.y)+pad))continue;
    used.add(key);
    let leg=this.legs.get(key);
    if(!leg||leg.ax!==a.x||leg.ay!==a.y||leg.bx!==b.x||leg.by!==b.y){
     leg={ax:a.x,ay:a.y,bx:b.x,by:b.y,mesh:marchRibbon(a,b)};this.legs.set(key,leg);
    }
    painted.push(leg.mesh);continue;
   }
   used.add(key);
   let geometry=this.geometry.get(key);
   if(geometry===undefined){
    const endpoints=ground(route,copy);geometry=null;
    if(endpoints){
     const [a,b]=endpoints,pad=40*ARROW_ART_UNIT;
     const x=Math.min(a.x,b.x)-pad,y=Math.min(a.y,b.y)-pad,right=Math.max(a.x,b.x)+pad,bottom=Math.max(a.y,b.y)+pad;
     if(projection.mayIntersect&&!projection.mayIntersect(x,y,right,bottom)){this.geometry.set(key,null);continue;}
     const bounds=projection.polygon([{x,y},{x:right,y},{x:right,y:bottom},{x,y:bottom}]);
     if(bounds.length&&!bounds.every(p=>p.x<0)&&!bounds.every(p=>p.x>width)&&!bounds.every(p=>p.y<0)&&!bounds.every(p=>p.y>height)){
      let contour=this.contours.get(key);
      if(!contour||contour.a.x!==a.x||contour.a.y!==a.y||contour.b.x!==b.x||contour.b.y!==b.y){
       contour=groundContour(a,b)??undefined;
       if(contour)this.contours.set(key,contour);
      }
      if(contour&&affine)geometry=contour.paint;
      else if(contour){
       const d=svgPath(projection.polygon(contour.body));
       if(d)geometry={d,outline:contour.edge.map(p=>svgPath(projection.polygon(p))).join('')};
      }
     }
    }
    this.geometry.set(key,geometry);
   }
   if(!geometry)continue;keep.add(key);
   if(this.layer)painted.push(this.contours.get(key)!);
   let paths=this.paths.get(key);
   if(!paths){
    const ribbon=document.createElementNS(ns,'path'),outline=document.createElementNS(ns,'path');
    outline.dataset.attackOutline='';ribbon.dataset.owner=String(route.owner);ribbon.dataset.from=String(route.from);ribbon.dataset.to=String(route.to);
    paths={ribbon,outline};this.paths.set(key,paths);this.group.append(ribbon,outline);
   }
   const path=paths.ribbon;
   if(paths.geometry!==geometry){
    if(paths.geometry?.d!==geometry.d)path.setAttribute('d',geometry.d);
    if(paths.geometry?.outline!==geometry.outline)paths.outline.setAttribute('d',geometry.outline);
    paths.geometry=geometry;
   }
   const fill=color(route.owner),units=String(route.units);
   if(path.getAttribute('fill')!==fill)path.setAttribute('fill',fill);
   if(path.dataset.units!==units)path.dataset.units=units;
  }
  for(const [key,paths]of this.paths)if(!keep.has(key)){paths.ribbon.remove();paths.outline.remove();this.paths.delete(key);}
  for(const key of this.geometry.keys())if(!used.has(key))this.geometry.delete(key);
  for(const key of this.contours.keys())if(!used.has(key))this.contours.delete(key);
  for(const key of this.legs.keys())if(!used.has(key))this.legs.delete(key);
  this.element.dataset.visibleLegs=String(this.legs.size);
  this.element.dataset.routes=String(routes.length);this.layer?.setWorldRoutes(painted);
 }
 dispose(){this.layer?.setCommitted([]);this.element.remove();this.paths.clear();this.geometry.clear();this.contours.clear();}
}
