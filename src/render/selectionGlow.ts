import type {Vec2} from '../game/types.ts';
export const SELECTION_GLOW_WIDTH=2;
export const SELECTION_GLOW_OPACITY=.24;
const cross=(a:Vec2,b:Vec2,p:Vec2)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
const bounds=(points:readonly Vec2[])=>({left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.z)),bottom:Math.max(...points.map(p=>p.z))});
const overlaps=(a:ReturnType<typeof bounds>,b:ReturnType<typeof bounds>,padding=0)=>a.left<=b.right+padding&&a.right>=b.left-padding&&a.top<=b.bottom+padding&&a.bottom>=b.top-padding;
const midpoint=(a:Vec2,b:Vec2):Vec2=>({x:(a.x+b.x)/2,z:(a.z+b.z)/2});
function segmentDistance(p:Vec2,a:Vec2,b:Vec2):number{
 const x=b.x-a.x,z=b.z-a.z,length=x*x+z*z,t=length?Math.max(0,Math.min(1,((p.x-a.x)*x+(p.z-a.z)*z)/length)):0;
 return Math.hypot(p.x-a.x-t*x,p.z-a.z-t*z);
}
/** Tessellate the land once, sampling the nearest finite boundary segment.
 * The old per-segment transparent strips overlapped at every bend: that changed
 * the brightness and exposed their triangular joins. A single distance field
 * cannot stack alpha. All subdivision and clipping stays inside the original
 * hole-aware land triangles, including crop edges and disconnected islands. */
export function innerGlowMesh(triangles:readonly (readonly Vec2[])[],segments:readonly (readonly [Vec2,Vec2])[],width=SELECTION_GLOW_WIDTH):{points:Vec2[];distance:number[]}{
 const result:{points:Vec2[];distance:number[]}={points:[],distance:[]};
 if(!triangles.length||!segments.length||!Number.isFinite(width)||width<=0)return result;
 const boxes=triangles.map(bounds),extent={left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity};
 for(const b of boxes){extent.left=Math.min(extent.left,b.left);extent.right=Math.max(extent.right,b.right);extent.top=Math.min(extent.top,b.top);extent.bottom=Math.max(extent.bottom,b.bottom);}
 const cell=Math.max(width*4,(extent.right-extent.left)/32,(extent.bottom-extent.top)/32),grid=new Map<string,number[]>();
 const cells=(b:ReturnType<typeof bounds>,visit:(key:string)=>void)=>{for(let x=Math.floor(b.left/cell);x<=Math.floor(b.right/cell);x++)for(let z=Math.floor(b.top/cell);z<=Math.floor(b.bottom/cell);z++)visit(`${x}:${z}`);};
 boxes.forEach((box,i)=>cells(box,key=>{const list=grid.get(key)??[];list.push(i);grid.set(key,list);}));
 const edgeBoxes=segments.map(bounds),nearby=triangles.map(()=>new Set<number>());
 edgeBoxes.forEach((box,i)=>cells({left:box.left-width,right:box.right+width,top:box.top-width,bottom:box.bottom+width},key=>{
  for(const t of grid.get(key)??[])if(overlaps(box,boxes[t],width))nearby[t].add(i);
 }));
 const emit=(points:Vec2[],distance:number[])=>{
  // Clip interpolated distance at the fade limit: no full-face transparent mesh.
  const clipped:{p:Vec2;d:number}[]=[];
  for(let i=0;i<3;i++){
   const j=(i+1)%3,p=points[i],q=points[j],d=distance[i],e=distance[j];
   if(d<width)clipped.push({p,d});
   if((d<width)!==(e<width)){const t=(width-d)/(e-d);clipped.push({p:{x:p.x+(q.x-p.x)*t,z:p.z+(q.z-p.z)*t},d:width});}
  }
  for(let i=1;i+1<clipped.length;i++){
   const tri=[clipped[0],clipped[i],clipped[i+1]];if(Math.abs(cross(tri[0].p,tri[1].p,tri[2].p))<1e-10)continue;
   for(const {p,d}of tri){result.points.push(p);result.distance.push(Math.max(0,d));}
  }
 };
 const refine=(points:Vec2[],candidates:number[],depth:number)=>{
  const box=bounds(points);candidates=candidates.filter(i=>overlaps(box,edgeBoxes[i],width));if(!candidates.length)return;
  const distance=(p:Vec2)=>{let nearest=Infinity;for(const i of candidates)nearest=Math.min(nearest,segmentDistance(p,...segments[i]));return nearest;};
  const values=points.map(distance),mids=points.map((p,i)=>midpoint(p,points[(i+1)%3])),midValues=mids.map(distance);
  const center={x:(points[0].x+points[1].x+points[2].x)/3,z:(points[0].z+points[1].z+points[2].z)/3},centerValue=distance(center);
  const lengths=points.map((p,i)=>Math.hypot(p.x-points[(i+1)%3].x,p.z-points[(i+1)%3].z));
  const longest=Math.max(...lengths),radius=Math.max(...points.map(p=>Math.hypot(p.x-center.x,p.z-center.z)));
  if(centerValue-radius>=width)return;
  // Long straight boundary pieces are exactly affine and need no dense grid.
  // Curved joins refine to subpixel-scale fade errors rather than wedge fans.
  const error=Math.max(Math.abs(centerValue-(values[0]+values[1]+values[2])/3),...midValues.map((d,i)=>Math.abs(d-(values[i]+values[(i+1)%3])/2)));
  if(depth<28&&longest>width/6&&(error>width*.008||Math.min(...values,...midValues,centerValue)>=width)){
   const i=lengths.indexOf(longest),j=(i+1)%3,k=(i+2)%3;
   refine([points[i],mids[i],points[k]],candidates,depth+1);refine([mids[i],points[j],points[k]],candidates,depth+1);
  }else emit(points,values);
 };
 triangles.forEach((triangle,i)=>{if(triangle.length===3)refine([...triangle],[...nearby[i]],0);});
 return result;
}
