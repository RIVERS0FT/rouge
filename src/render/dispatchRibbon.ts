import type {ArrowProjection} from './groundArrowProjection.ts';

export type ScreenPoint={x:number;y:number};
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const svgPoint=(point:ScreenPoint)=>`${point.x.toFixed(2)},${point.y.toFixed(2)}`;
const svgPath=(points:readonly ScreenPoint[])=>points.length>=3?`M${points.map(svgPoint).join('L')}Z`:'';
// Size of an artwork unit on the map, independent of the camera or viewport.
export const ARROW_ART_UNIT=.4;
const CHEVRON=[[-4,-4],[0,-4],[4,0],[0,4],[-4,4],[0,0]];

export function dispatchThreshold(pointerType:string){
 return pointerType==='touch'||pointerType==='pen'?8:5;
}

export function dispatchSources(members:readonly number[],target:number,actor:number,owners:readonly number[],counts:ArrayLike<number>):number[]{
 if(actor<0||target<0)return [];
 return members.filter(id=>id!==target&&owners[id]===actor&&counts[id]>0);
}

/** One curved silhouette. The shoulder and body are the same fill, not overlaid shapes. */
export function dispatchRibbon(source:ScreenPoint,cursor:ScreenPoint,endGap?:number,unit=1,projection?:ArrowProjection){
 const dx=cursor.x-source.x,dy=cursor.y-source.y,distance=Math.hypot(dx,dy);
 if(distance<5*unit)return null;
 const ux=dx/distance,uy=dy/distance,reticleGap=endGap??Math.min(12*unit,distance*.13);
 const end={x:cursor.x-ux*reticleGap,y:cursor.y-uy*reticleGap};
 const bend=Math.min(24*unit,distance*.055);
 // Keep the bow stable through small pointer movements and aligned with the target.
 const c={x:(end.x+source.x)/2-uy*bend,y:(end.y+source.y)/2+ux*bend};
 const tip=clamp(1-18*unit/distance,.68,.91),steps=20;
 const half=clamp(distance*.05,3*unit,17*unit);
 const width=(t:number)=>half*(1-.74*t);
 const point=(t:number,offset=0)=>{
  const k=1-t,x=k*k*source.x+2*k*t*c.x+t*t*end.x,y=k*k*source.y+2*k*t*c.y+t*t*end.y;
  const tx=k*(c.x-source.x)+t*(end.x-c.x),ty=k*(c.y-source.y)+t*(end.y-c.y),len=Math.hypot(tx,ty);
  return {x:x-ty*offset/len,y:y+tx*offset/len,angle:Math.atan2(ty,tx)*180/Math.PI};
 };
 const edge=(side:number)=>Array.from({length:steps+1},(_,i)=>{const t=i*tip/steps;return point(t,side*width(t));});
 const shoulder=Math.min(half*1.2,width(tip)*1.85);
 const contour=[...edge(1),point(tip,shoulder),end,point(tip,-shoulder),...edge(-1).reverse()];
 const projected=projection?.polygon(contour)??contour,d=svgPath(projected);
 if(!d)return null;
 const mid=tip/2,a=projection?.point(point(mid,-unit/2)),b=projection?.point(point(mid,unit/2));
 const outlineWidth=a&&b?Math.hypot(b.x-a.x,b.y-a.y)*.8:0;
 const marker=(t:number)=>{
  const p=point(t),scale=width(t)/10;
  const opacity=clamp(t/.1,0,1)*clamp((tip-t)/.16,0,1)*.9;
  return {x:p.x,y:p.y,angle:p.angle,scale,opacity};
 };
 return {d,projected,outlineWidth,length:distance-reticleGap,tip,marker,
  markerPath(t:number){
   const p=marker(t),angle=p.angle*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
   const vertices=CHEVRON.map(([x,y])=>({x:p.x+(x*cos-y*sin)*p.scale,y:p.y+(x*sin+y*cos)*p.scale}));
   return svgPath(projection?.polygon(vertices)??vertices);
  }
 };
}
