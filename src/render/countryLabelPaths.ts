import {nearestWorldX,wrapX,WORLD_BOUNDS} from '../game/geo.ts';
import type {ProvinceDef,Vec2} from '../game/types.ts';
import type {Rect} from '../game/crop.ts';
import type {BorderEdge} from './territoryBorders.ts';
import type {CountryLabel} from './countryLabels.ts';

export interface CountryCurve {points:Vec2[];control:Vec2;anchor:Vec2;length:number;clearance:number}
export interface CountryPlacement {owner:number;area:number;curves:CountryCurve[]}
export type CountryPlacementCache=Map<number,{members:string;placement:CountryPlacement}>;
interface Grid {left:number;top:number;cell:number;cols:number;rows:number;inside:Uint8Array;distance:Float32Array}
type Edge={a:Vec2;b:Vec2};
const GRID_SIZE=112;

type ScreenPoint={x:number;y:number};
type ScreenArc={start:ScreenPoint;control:ScreenPoint;end:ScreenPoint};

/** Keep every screen-space tangent within +/-90 degrees. Reversing a quadratic
 * preserves its shape; if it doubles back horizontally, use its longer monotone
 * section instead of moving the control point outside the validated land path. */
export function uprightCountryArc(start:ScreenPoint,control:ScreenPoint,end:ScreenPoint):ScreenArc&{length:number}{
 const measure=({start:a,control:c,end:b}:ScreenArc)=>{
  let length=0,previous=a;
  for(let i=1;i<=64;i++){const t=i/64,s=1-t,p={x:s*s*a.x+2*s*t*c.x+t*t*b.x,y:s*s*a.y+2*s*t*c.y+t*t*b.y};length+=Math.hypot(p.x-previous.x,p.y-previous.y);previous=p;}
  return length;
 };
 let arc={start,control,end};
 const denominator=start.x-2*control.x+end.x,t=denominator?(start.x-control.x)/denominator:0;
 if(t>0&&t<1){
  const lerp=(a:ScreenPoint,b:ScreenPoint)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  const a=lerp(start,control),b=lerp(control,end),mid=lerp(a,b),first={start,control:a,end:mid},last={start:mid,control:b,end};
  arc=measure(first)>=measure(last)?first:last;
 }
 if(arc.end.x<arc.start.x||(arc.end.x===arc.start.x&&arc.end.y>arc.start.y))arc={start:arc.end,control:arc.control,end:arc.start};
 return {...arc,length:measure(arc)};
}

function raster(edges:readonly Edge[],bounds:Rect):Grid{
 const cell=Math.max(bounds.right-bounds.left,bounds.bottom-bounds.top)/GRID_SIZE||1;
 const left=bounds.left-cell*2,top=bounds.top-cell*2,cols=Math.ceil((bounds.right-bounds.left)/cell)+4,rows=Math.ceil((bounds.bottom-bounds.top)/cell)+4;
 const inside=new Uint8Array(cols*rows);
 // Union boundaries have no administrative seams. Even/odd spans preserve holes.
 for(let y=0;y<rows;y++){
  const z=top+(y+.5)*cell,crossings:number[]=[];
  for(const {a,b} of edges)if((a.z>z)!==(b.z>z))crossings.push(a.x+(b.x-a.x)*(z-a.z)/(b.z-a.z));
  crossings.sort((a,b)=>a-b);
  for(let j=0;j+1<crossings.length;j+=2){const start=Math.max(0,Math.ceil((crossings[j]-left)/cell-.5)),end=Math.min(cols,Math.ceil((crossings[j+1]-left)/cell-.5));inside.fill(1,y*cols+start,y*cols+end);}
 }
 // A title belongs to one connected landmass. It must not bridge offshore islands.
 const seen=new Uint8Array(inside.length);let largest:number[]=[];
 for(let seed=0;seed<inside.length;seed++)if(inside[seed]&&!seen[seed]){
  const queue=[seed];seen[seed]=1;
  for(let i=0;i<queue.length;i++){const p=queue[i],x=p%cols,y=Math.floor(p/cols);
   for(const n of [x>0?p-1:-1,x+1<cols?p+1:-1,y>0?p-cols:-1,y+1<rows?p+cols:-1])if(n>=0&&inside[n]&&!seen[n]){seen[n]=1;queue.push(n);}
  }
  if(queue.length>largest.length)largest=queue;
 }
 inside.fill(0);for(const p of largest)inside[p]=1;
 const distance=new Float32Array(inside.length);for(let i=0;i<inside.length;i++)distance[i]=inside[i]?GRID_SIZE*2:0;
 // Conservative chessboard distance, not an optimistic diagonal approximation.
 for(let y=1;y<rows-1;y++)for(let x=1;x<cols-1;x++){const i=y*cols+x;if(inside[i])distance[i]=Math.min(distance[i],1+Math.min(distance[i-1],distance[i-cols-1],distance[i-cols],distance[i-cols+1]));}
 for(let y=rows-2;y>0;y--)for(let x=cols-2;x>0;x--){const i=y*cols+x;if(inside[i])distance[i]=Math.min(distance[i],1+Math.min(distance[i+1],distance[i+cols-1],distance[i+cols],distance[i+cols+1]));}
 return {left,top,cell,cols,rows,inside,distance};
}

function distanceSquaredToSegment(p:Vec2,{a,b}:Edge):number{
 const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
 return (p.x-a.x-t*dx)**2+(p.z-a.z-t*dz)**2;
}

function curveFromRidge(ridge:Vec2[],edges:readonly Edge[],bounds:Rect):CountryCurve|null{
 if(ridge.length<6)return null;
 const start=ridge[0],end=ridge[ridge.length-1];let cx=0,cz=0,denominator=0;
 // Least-squares quadratic with exactly one control point. Its signed curvature
 // cannot reverse, so even a winding country receives only one gentle bend.
 for(let i=1;i+1<ridge.length;i++){const t=i/(ridge.length-1),s=1-t,w=2*s*t;cx+=w*(ridge[i].x-s*s*start.x-t*t*end.x);cz+=w*(ridge[i].z-s*s*start.z-t*t*end.z);denominator+=w*w;}
 const control={x:cx/denominator,z:cz/denominator},points:Vec2[]=[];
 for(let k=0;k<=64;k++){const t=k/64,s=1-t;points.push({x:s*s*start.x+2*s*t*control.x+t*t*end.x,z:s*s*start.z+2*s*t*control.z+t*t*end.z});}
 let clearance=Infinity,length=0,longestStep=0;
 for(let i=0;i<points.length;i++){
  const p=points[i];let inside=false,d=Math.min(p.z-bounds.top,bounds.bottom-p.z),square=Infinity;
  for(const edge of edges){square=Math.min(square,distanceSquaredToSegment(p,edge));const {a,b}=edge;if((a.z>p.z)!==(b.z>p.z)&&p.x<a.x+(b.x-a.x)*(p.z-a.z)/(b.z-a.z))inside=!inside;}
  d=Math.min(d,Math.sqrt(square));
  if(!inside)return null;clearance=Math.min(clearance,d);
  if(i){const step=Math.hypot(p.x-points[i-1].x,p.z-points[i-1].z);length+=step;longestStep=Math.max(longestStep,step);}
 }
 // Distance is 1-Lipschitz: protect the intervals between validation samples too.
 clearance-=longestStep/2;if(clearance<=0)return null;
 const mid=pointAlong(points,length/2),shift=wrapX(mid.x)-mid.x;
 return {points:points.map(p=>({x:p.x+shift,z:p.z})),control:{x:control.x+shift,z:control.z},anchor:{x:mid.x+shift,z:mid.z},length,clearance};
}

function pointAlong(points:readonly Vec2[],distance:number):Vec2{
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],step=Math.hypot(b.x-a.x,b.z-a.z);if(distance<=step){const t=distance/(step||1);return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};}distance-=step;}
 return {...points[points.length-1]};
}

export function countryCurveSegment(curve:CountryCurve,length:number):{points:Vec2[];control:Vec2}{
 const parameter=(distance:number)=>{for(let i=1;i<curve.points.length;i++){const a=curve.points[i-1],b=curve.points[i],step=Math.hypot(b.x-a.x,b.z-a.z);if(distance<=step)return (i-1+distance/(step||1))/(curve.points.length-1);distance-=step;}return 1;};
 const t0=parameter(Math.max(0,(curve.length-length)/2)),t1=parameter(Math.min(curve.length,(curve.length+length)/2)),a=curve.points[0],b=curve.points[curve.points.length-1],c=curve.control;
 const at=(t:number)=>({x:(1-t)**2*a.x+2*(1-t)*t*c.x+t*t*b.x,z:(1-t)**2*a.z+2*(1-t)*t*c.z+t*t*b.z});
 const start=at(t0),control={x:start.x+(t1-t0)*((1-t0)*(c.x-a.x)+t0*(b.x-c.x)),z:start.z+(t1-t0)*((1-t0)*(c.z-a.z)+t0*(b.z-c.z))};
 return {points:Array.from({length:65},(_,i)=>at(t0+(t1-t0)*i/64)),control};
}

function candidates(grid:Grid,edges:readonly Edge[],bounds:Rect):CountryCurve[]{
 const curves:CountryCurve[]=[];let maximum=0;for(const d of grid.distance)maximum=Math.max(maximum,d);
 for(const vertical of [false,true])for(const fraction of [.25,.45,.65]){
  const cols=vertical?grid.rows:grid.cols,rows=vertical?grid.cols:grid.rows,threshold=Math.max(1.5,maximum*fraction),parent=new Int16Array(cols*rows);parent.fill(-1);
  let previous=new Float32Array(rows),best=-1,bestX=-1,bestY=-1;
  const at=(x:number,y:number)=>vertical?x*grid.cols+y:y*grid.cols+x;
  for(let x=0;x<cols;x++){
   const current=new Float32Array(rows);
   for(let y=0;y<rows;y++)if(grid.inside[at(x,y)]&&grid.distance[at(x,y)]>=threshold){
    let score=0,from=-1;
    for(let dy=-2;dy<=2;dy++){const py=y+dy;if(py<0||py>=rows||!previous[py])continue;const value=previous[py]-.12*Math.abs(dy);if(value>score){score=value;from=py;}}
    current[y]=score+1+.08*grid.distance[at(x,y)]/Math.max(1,maximum);parent[x*rows+y]=from;
    if(current[y]>best){best=current[y];bestX=x;bestY=y;}
   }
   previous=current;
  }
  const ridge:Vec2[]=[];
  for(let x=bestX,y=bestY;x>=0&&y>=0;x--){const gx=vertical?y:x,gy=vertical?x:y;ridge.push({x:grid.left+(gx+.5)*grid.cell,z:grid.top+(gy+.5)*grid.cell});y=parent[x*rows+y];}
  ridge.reverse();if(vertical)ridge.reverse();
  const curve=curveFromRidge(ridge,edges,bounds);if(curve)curves.push(curve);
  else for(const [from,to] of [[.12,.88],[0,.6],[.4,1],[.25,.75]]){const smaller=curveFromRidge(ridge.slice(Math.floor(from*ridge.length),Math.ceil(to*ridge.length)),edges,bounds);if(smaller)curves.push(smaller);}
 }
 return curves.sort((a,b)=>b.length*Math.sqrt(b.clearance)-a.length*Math.sqrt(a.clearance)).slice(0,4);
}

export function buildCountryPlacements(map:readonly ProvinceDef[],owners:readonly number[],labels:readonly CountryLabel[],borders:readonly BorderEdge[],cache:CountryPlacementCache=new Map(),bounds:Rect=WORLD_BOUNDS):Map<number,CountryPlacement>{
 const members=new Map<number,number[]>(),outlines=new Map<number,BorderEdge[]>(),result=new Map<number,CountryPlacement>();
 for(const province of map){const owner=owners[province.id];if(owner>=0&&province.visible){const ids=members.get(owner)??[];ids.push(province.id);members.set(owner,ids);}}
 for(const edge of borders){const held=[...new Set(edge.atoms.map(id=>owners[id]??-1))];if(edge.atoms.length>1&&held.length===1)continue;
  for(const owner of held)if(owner>=0){const list=outlines.get(owner)??[];list.push(edge);outlines.set(owner,list);}
 }
 for(const label of labels){
  const signature=(members.get(label.owner)??[]).join(','),old=cache.get(label.owner);if(old?.members===signature){result.set(label.owner,old.placement);continue;}
  const edges=(outlines.get(label.owner)??[]).map(({a,b})=>({a:{x:nearestWorldX(a.x,label.anchor.x),z:a.z},b:{x:nearestWorldX(b.x,label.anchor.x),z:b.z}}));
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;for(const {a,b} of edges)for(const p of [a,b]){left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.min(top,p.z);bottom=Math.max(bottom,p.z);}
  let curves:CountryCurve[]=[];
  if(edges.length&&right>left&&bottom>top){
   let grid=raster(edges,{left,right,top,bottom});
   // Refine around the principal connected landmass so distant possessions do
   // not consume the resolution needed for its bays, narrow necks and lakes.
   let x0=grid.cols,x1=0,y0=grid.rows,y1=0;
   for(let y=0;y<grid.rows;y++)for(let x=0;x<grid.cols;x++)if(grid.inside[y*grid.cols+x]){x0=Math.min(x0,x);x1=Math.max(x1,x+1);y0=Math.min(y0,y);y1=Math.max(y1,y+1);}
   if(x1>x0&&y1>y0){grid=raster(edges,{left:grid.left+x0*grid.cell,right:grid.left+x1*grid.cell,top:grid.top+y0*grid.cell,bottom:grid.top+y1*grid.cell});curves=candidates(grid,edges,bounds);}
  }
  const placement={owner:label.owner,area:label.area,curves};cache.set(label.owner,{members:signature,placement});result.set(label.owner,placement);
 }
 for(const owner of cache.keys())if(!result.has(owner))cache.delete(owner);
 return result;
}

/** Circle clearance bounds whole glyphs, accents and their outline, not merely
 * their baseline. A long name therefore reduces size instead of crossing water. */
export function fitCountryCurve(placement:CountryPlacement,advanceEm:number):{curve:CountryCurve;fontWorld:number}|null{
 let best:{curve:CountryCurve;fontWorld:number}|null=null;
 for(const curve of placement.curves){const fontWorld=Math.min(curve.clearance/1.25,curve.length*.86/Math.max(1,advanceEm));if(!best||fontWorld>best.fontWorld)best={curve,fontWorld};}
 return best;
}
