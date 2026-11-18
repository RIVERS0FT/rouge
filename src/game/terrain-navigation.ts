var geometryReady=false;
import {kernel,storeData,setupGeometry} from './groundKernel.ts';
import data from '../generated/terrain-navigation.json' with {type:'json'};
import type {Vec2} from './types.ts';
export interface TravelPoint extends Vec2 {sea:boolean}
export interface TravelPlan {revision:string;points:TravelPoint[];index:number}
const bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer;
const vertexData=new Float64Array(bytes(data.vertices)),triangleData=new Uint32Array(bytes(data.triangles));
const surfaces=new Uint8Array(bytes(data.surface)),neighborData=new Int32Array(bytes(data.neighbors)),triangleCount=surfaces.length;
const vertex=(id:number)=>[vertexData[id*2],vertexData[id*2+1]];
const triangle=(id:number)=>[vertex(triangleData[id*3]),vertex(triangleData[id*3+1]),vertex(triangleData[id*3+2])];
function portal(id:number,n:number):number[]{const shared:number[]=[];for(let i=0;i<3;i++){const a=triangleData[id*3+i];for(let j=0;j<3;j++)if(a===triangleData[n*3+j]){shared.push(a);break;}}const a=vertex(shared[0]),b=vertex(shared[1]);return[n,...a,...b];}
export const TERRAIN_REVISION=data.revision;
const centerData=new Float64Array(triangleCount*2);
const center=(id:number)=>({x:centerData[id*2],z:centerData[id*2+1]});
// Packed CSR spatial index avoids millions of JS array/object references on phones.
const size=2,minX=Math.floor(data.bounds[0]/size),minZ=Math.floor(data.bounds[1]/size),cols=Math.floor(data.bounds[2]/size)-minX+1,rows=Math.floor(data.bounds[3]/size)-minZ+1;
const offsets=new Uint32Array(cols*rows+1),ranges=new Int16Array(triangleCount*4);
for(let i=0;i<triangleCount;i++){const t=triangle(i),xs=t.map(p=>p[0]),zs=t.map(p=>p[1]);centerData[i*2]=(xs[0]+xs[1]+xs[2])/3;centerData[i*2+1]=(zs[0]+zs[1]+zs[2])/3;
 const a=Math.floor(Math.min(...xs)/size)-minX,b=Math.floor(Math.max(...xs)/size)-minX,c=Math.floor(Math.min(...zs)/size)-minZ,d=Math.floor(Math.max(...zs)/size)-minZ;ranges.set([a,b,c,d],i*4);
 for(let z=c;z<=d;z++)for(let x=a;x<=b;x++)offsets[z*cols+x+1]++;
}
for(let i=1;i<offsets.length;i++)offsets[i]+=offsets[i-1];
const bucketIds=new Uint32Array(offsets.at(-1)!),cursor=offsets.slice();
for(let i=0;i<triangleCount;i++){const [a,b,c,d]=ranges.subarray(i*4,i*4+4);for(let z=c;z<=d;z++)for(let x=a;x<=b;x++)bucketIds[cursor[z*cols+x]++]=i;}
const bucket=(x:number,z:number)=>{const a=x-minX,b=z-minZ;if(a<0||b<0||a>=cols||b>=rows)return bucketIds.subarray(0,0);const id=b*cols+a;return bucketIds.subarray(offsets[id],offsets[id+1]);};
// Neighbor slots are packed, not paired with triangle edge slots.
const landBoundary=new Uint8Array(triangleCount);
for(let id=0;id<triangleCount;id++)if(surfaces[id]===1)for(let k=0;k<3;k++){
 const a=triangleData[id*3+k],b=triangleData[id*3+(k+1)%3];let shared=false;
 for(let j=0;j<3&&!shared;j++){
  const n=neighborData[id*3+j];if(n<0||surfaces[n]!==1)continue;
  let hasA=false,hasB=false;for(let v=0;v<3;v++){hasA ||= triangleData[n*3+v]===a;hasB ||= triangleData[n*3+v]===b;}
  shared=hasA&&hasB;
 }
 if(!shared)landBoundary[id]|=1<<k;
}
const cross=(a:number[],b:number[],p:Vec2)=>(b[0]-a[0])*(p.z-a[1])-(b[1]-a[1])*(p.x-a[0]);
// Exact original edge differences, packed once for repeated point tests.
const planes=new Float64Array(triangleCount*12);
for(let id=0;id<triangleCount;id++)for(let k=0;k<3;k++){
 const a=triangleData[id*3+k]*2,b=triangleData[id*3+(k+1)%3]*2,i=id*12+k*4;
 planes[i]=vertexData[a];planes[i+1]=vertexData[a+1];planes[i+2]=vertexData[b]-vertexData[a];planes[i+3]=vertexData[b+1]-vertexData[a+1];
}
function inTriangle(id:number,p:Vec2):boolean {
 const i=id*12,x=p.x,z=p.z;
 const a=planes[i+2]*(z-planes[i+1])-planes[i+3]*(x-planes[i]);
 const b=planes[i+6]*(z-planes[i+5])-planes[i+7]*(x-planes[i+4]);
 let positive=a>1e-8||b>1e-8,negative=a< -1e-8||b< -1e-8;if(positive&&negative)return false;
 const c=planes[i+10]*(z-planes[i+9])-planes[i+11]*(x-planes[i+8]);
 return !((positive||c>1e-8)&&(negative||c< -1e-8));
}
const pointHints=new Map<number,number>(),hintColumns=Math.ceil((data.bounds[2]-data.bounds[0])*2)+4;
function strictlyInside(id:number,p:Vec2):boolean {
 const i=id*12,x=p.x,z=p.z;
 const a=planes[i+2]*(z-planes[i+1])-planes[i+3]*(x-planes[i]);
 const b=planes[i+6]*(z-planes[i+5])-planes[i+7]*(x-planes[i+4]);
 const c=planes[i+10]*(z-planes[i+9])-planes[i+11]*(x-planes[i+8]);
 return a>1e-5&&b>1e-5&&c>1e-5||a< -1e-5&&b< -1e-5&&c< -1e-5;
}
function rememberTriangle(key:number,id:number){if(pointHints.size>=65536&&!pointHints.has(key))pointHints.delete(pointHints.keys().next().value!);pointHints.set(key,id);}
export function terrainAt(p:Vec2,landOnly=false):number {if(Number.isFinite(p.x)&&Number.isFinite(p.z)&&geometryReady)return kernel.kernelTerrainAt(p.x,p.z,landOnly);
 if(!Number.isFinite(p.x)||!Number.isFinite(p.z))return -1;
 const hintKey=Math.floor(p.z*2)*hintColumns+Math.floor(p.x*2),hint=pointHints.get(hintKey);
 if(hint!==undefined&&(!landOnly||surfaces[hint]===1)&&strictlyInside(hint,p))return hint;
 const x=Math.floor(p.x/size)-minX,z=Math.floor(p.z/size)-minZ;if(x<0||z<0||x>=cols||z>=rows)return -1;
 const cell=z*cols+x;let found=-1;
 for(let i=offsets[cell];i<offsets[cell+1];i++){const id=bucketIds[i];if(landOnly&&surfaces[id]!==1)continue;if(inTriangle(id,p)){if(surfaces[id]===1){rememberTriangle(hintKey,id);return id;}found=id;}}
 if(found>=0)rememberTriangle(hintKey,found);return found;
}
// Static physical walls share a packed spatial index. Queries can revisit an
// edge from adjacent cells: boolean rejection and minimum clearance are unchanged.
const wallSize=4,wallMinX=Math.floor(data.bounds[0]/wallSize),wallMinZ=Math.floor(data.bounds[1]/wallSize),wallCols=Math.floor(data.bounds[2]/wallSize)-wallMinX+1,wallRows=Math.floor(data.bounds[3]/wallSize)-wallMinZ+1;
let wallCount=0;for(const flags of landBoundary)for(let k=0;k<3;k++)if(flags&(1<<k))wallCount++;
const walls=new Float64Array(wallCount*7),wallOffsets=new Uint32Array(wallCols*wallRows+1);
{
 let index=0;
 for(let id=0;id<triangleCount;id++)if(landBoundary[id])for(let k=0;k<3;k++)if(landBoundary[id]&(1<<k)){
  const a=vertex(triangleData[id*3+k]),b=vertex(triangleData[id*3+(k+1)%3]),dx=b[0]-a[0],dz=b[1]-a[1];walls.set([...a,...b,dx,dz,dx*dx+dz*dz],index*7);index++;
  for(let z=Math.floor(Math.min(a[1],b[1])/wallSize)-wallMinZ;z<=Math.floor(Math.max(a[1],b[1])/wallSize)-wallMinZ;z++)for(let x=Math.floor(Math.min(a[0],b[0])/wallSize)-wallMinX;x<=Math.floor(Math.max(a[0],b[0])/wallSize)-wallMinX;x++)wallOffsets[z*wallCols+x+1]++;
 }
}
for(let i=1;i<wallOffsets.length;i++)wallOffsets[i]+=wallOffsets[i-1];
const wallIds=new Uint32Array(wallOffsets.at(-1)!);
{
 const cursor=wallOffsets.slice();
 for(let id=0;id<wallCount;id++){
  const i=id*7,ax=walls[i],az=walls[i+1],bx=walls[i+2],bz=walls[i+3];
  for(let z=Math.floor(Math.min(az,bz)/wallSize)-wallMinZ;z<=Math.floor(Math.max(az,bz)/wallSize)-wallMinZ;z++)for(let x=Math.floor(Math.min(ax,bx)/wallSize)-wallMinX;x<=Math.floor(Math.max(ax,bx)/wallSize)-wallMinX;x++)wallIds[cursor[z*wallCols+x]++]=i;
 }
}
function wallRange(left:number,top:number,right:number,bottom:number):[number,number,number,number] {
 return[Math.max(0,Math.floor(left/wallSize)-wallMinX),Math.max(0,Math.floor(top/wallSize)-wallMinZ),Math.min(wallCols-1,Math.floor(right/wallSize)-wallMinX),Math.min(wallRows-1,Math.floor(bottom/wallSize)-wallMinZ)];
}
/** Exact short land segment check using only physical boundary edges. Endpoints
 * on land plus no interior boundary crossing cannot jump an island or lake.
 * A supplied startTriangle must be terrainAt(a,true) for these exact coordinates. */
export function terrainLocalSegment(a:Vec2,b:Vec2,startTriangle?:number):boolean {if(geometryReady)return Boolean(kernel.kernelLocalSegment(a.x,a.z,b.x,b.z,startTriangle??-2));
 const id=startTriangle??terrainAt(a,true);if(id<0)return false;if(inTriangle(id,b))return true;if(terrainAt(b,true)<0)return false;
 const dx=b.x-a.x,dz=b.z-a.z;
 const [left,top,right,bottom]=wallRange(Math.min(a.x,b.x),Math.min(a.z,b.z),Math.max(a.x,b.x),Math.max(a.z,b.z));
 for(let x=left;x<=right;x++)for(let z=top;z<=bottom;z++){const cell=z*wallCols+x;for(let i=wallOffsets[cell];i<wallOffsets[cell+1];i++){
  const k=wallIds[i],x=walls[k],z=walls[k+1],wx=walls[k+4],wz=walls[k+5],det=dx*wz-dz*wx;if(Math.abs(det)<1e-14)continue;
  const qx=x-a.x,qz=z-a.z,t=(qx*wz-qz*wx)/det,u=(qx*dz-qz*dx)/det;
  if(t>1e-9&&t<1-1e-9&&u>=-1e-9&&u<=1+1e-9)return false;
 }}
 return true;
}

/** A land rectangle can enclose a lake even when all four edges are on land. */
export function terrainLandFootprint(corners:readonly Vec2[]):boolean {
 for(let i=0;i<corners.length;i++)if(!terrainLocalSegment(corners[i],corners[(i+1)%corners.length]))return false;
 const xs=corners.map(p=>p.x),zs=corners.map(p=>p.z);
 const [left,top,right,bottom]=wallRange(Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs));
 for(let z=top;z<=bottom;z++)for(let x=left;x<=right;x++){
  const cell=z*wallCols+x;
  for(let i=wallOffsets[cell];i<wallOffsets[cell+1];i++){
   const at=wallIds[i],px=walls[at],pz=walls[at+1];
   if(corners.every((a,j)=>{const b=corners[(j+1)%corners.length];return (b.x-a.x)*(pz-a.z)-(b.z-a.z)*(px-a.x)>1e-8;}))return false;
  }
 }
 return true;
}
/** Clip a segment to each candidate triangle and check interval union. Exact
 * convex clipping avoids sampling through thin islands/lakes. No admin borders. */
export function terrainSegment(a:Vec2,b:Vec2,sea:boolean):boolean {
 if(geometryReady){const result=kernel.kernelTerrainSegment(a.x,a.z,b.x,b.z,sea);if(result>=0)return Boolean(result);}
 const spans:[number,number][]=[];const seen=new Set<number>();
 for(let x=Math.floor(Math.min(a.x,b.x)/size);x<=Math.floor(Math.max(a.x,b.x)/size);x++)for(let z=Math.floor(Math.min(a.z,b.z)/size);z<=Math.floor(Math.max(a.z,b.z)/size);z++)for(const id of bucket(x,z)){
  if(seen.has(id)||surfaces[id]!== (sea?2:1))continue;seen.add(id);const t=triangle(id),orientation=cross(t[0],t[1],{x:t[2][0],z:t[2][1]})>=0?1:-1;let lo=0,hi=1;
  for(let k=0;k<3;k++){const c=orientation*cross(t[k],t[(k+1)%3],a),d=orientation*cross(t[k],t[(k+1)%3],b)-c;if(Math.abs(d)<1e-14){if(c<-1e-8){hi=-1;break;}}else {const at=(-1e-8-c)/d;if(d>0)lo=Math.max(lo,at);else hi=Math.min(hi,at);}}
  if(lo<=0&&hi>=1)return true; // Common short local moves stay in one triangle.
  if(lo<=hi&&hi>=0&&lo<=1)spans.push([Math.max(0,lo),Math.min(1,hi)]);
 }
 spans.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let end=0;for(const [lo,hi]of spans){if(lo>end+1e-8)return false;end=Math.max(end,hi);if(end>=1-1e-8)return true;}return false;
}
/** Distance to physical coast/lake/crop edges, capped at the requested radius.
 * Internal triangle and administrative borders do not form walls. */
export function terrainClearance(p:Vec2,radius:number,knownLand=false):number {if(geometryReady)return kernel.kernelClearance(p.x,p.z,radius,knownLand);
 if(!knownLand&&terrainAt(p,true)<0)return 0;
 let best=radius*radius;
 const [left,top,right,bottom]=wallRange(p.x-radius,p.z-radius,p.x+radius,p.z+radius);
 for(let x=left;x<=right;x++)for(let z=top;z<=bottom;z++){const cell=z*wallCols+x;for(let i=wallOffsets[cell];i<wallOffsets[cell+1];i++){
  const k=wallIds[i],x=walls[k],z=walls[k+1],dx=walls[k+4],dz=walls[k+5],l=walls[k+6];
  const t=l?Math.max(0,Math.min(1,((p.x-x)*dx+(p.z-z)*dz)/l)):0;
  best=Math.min(best,(p.x-x-t*dx)**2+(p.z-z-t*dz)**2);
 }}
 return Math.sqrt(best);
}
export const TRAVEL_LOCAL_OFFSET=2.5;
export function travelCorridorPoint(plan:TravelPlan,p:Vec2,lookahead=0):Vec2 {
 const a=plan.points[plan.index-1],b=plan.points[plan.index],dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz;
 const t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/l+lookahead/Math.sqrt(l))):0;
 return{x:a.x+t*dx,z:a.z+t*dz};
}
export function distanceToTravelSegment(plan:TravelPlan,p:Vec2):number {
 const q=travelCorridorPoint(plan,p);return Math.hypot(p.x-q.x,p.z-q.z);
}
class Heap {
 ids=new Uint32Array(128);costs=new Float64Array(128);length=0;value=0;
 push(id:number,cost:number){
  let i=this.length++;if(this.length>this.ids.length){const ids=new Uint32Array(this.ids.length*2),costs=new Float64Array(this.costs.length*2);ids.set(this.ids);costs.set(this.costs);this.ids=ids;this.costs=costs;}
  const ids=this.ids,costs=this.costs;
  while(i){const p=(i-1)>>1,pc=costs[p],pi=ids[p];if(!(cost<pc||cost===pc&&id<pi))break;ids[i]=pi;costs[i]=pc;i=p;}ids[i]=id;costs[i]=cost;
 }
 pop():number{
  const ids=this.ids,costs=this.costs,root=ids[0];this.value=costs[0];const length=--this.length,id=ids[length],cost=costs[length];
  if(length){let i=0;while(i*2+1<length){let c=i*2+1;
   if(c+1<length&&(costs[c+1]<costs[c]||costs[c+1]===costs[c]&&ids[c+1]<ids[c]))c++;
   if(!(costs[c]<cost||costs[c]===cost&&ids[c]<id))break;ids[i]=ids[c];costs[i]=costs[c];i=c;
  }ids[i]=id;costs[i]=cost;}return root;
 }
}
interface FieldPage {distance:Float64Array;next:Int32Array;settled:Uint8Array}
const FIELD_PAGE_BITS=8,FIELD_PAGE_SIZE=1<<FIELD_PAGE_BITS,FIELD_PAGE_MASK=FIELD_PAGE_SIZE-1;
class Field {
 pages:Array<FieldPage|undefined>=new Array(Math.ceil(triangleCount/FIELD_PAGE_SIZE));queue=new Heap();allocatedPages=0;
 page(id:number):FieldPage {
  const key=id>>>FIELD_PAGE_BITS;let page=this.pages[key];
  if(!page){const buffer=new ArrayBuffer(FIELD_PAGE_SIZE*13);page={distance:new Float64Array(buffer,0,FIELD_PAGE_SIZE).fill(Infinity),next:new Int32Array(buffer,FIELD_PAGE_SIZE*8,FIELD_PAGE_SIZE).fill(-1),settled:new Uint8Array(buffer,FIELD_PAGE_SIZE*12,FIELD_PAGE_SIZE)};this.pages[key]=page;this.allocatedPages++;}return page;
 }
}
const length=(a:Vec2,b:Vec2)=>Math.hypot(a.x-b.x,a.z-b.z);
// Physical land connectivity is static. Different islands need a sea route;
// proving that by exhausting a continent's Dijkstra search on every order is
// unnecessary. Administrative ownership never changes these components.
const landComponents=new Int32Array(triangleCount).fill(-1);
{
 const queue=new Int32Array(triangleCount);let component=0;
 for(let seed=0;seed<triangleCount;seed++)if(surfaces[seed]===1&&landComponents[seed]<0){
  let head=0,tail=1;queue[0]=seed;landComponents[seed]=component;
  while(head<tail){const id=queue[head++];for(let k=0;k<3;k++){const n=neighborData[id*3+k];if(n>=0&&surfaces[n]===1&&landComponents[n]<0){landComponents[n]=component;queue[tail++]=n;}}}
  component++;
 }
}
// Geometry is immutable. Cache the two exact center-to-portal lengths for each
// directed neighbor slot; speeds remain part of the field's per-query cost.
let edgeLengths:Float64Array|undefined;
let navigatorSerial=0;
export class TerrainNavigator {
 private nativeOwner=++navigatorSerial;
 private fields=new Map<string,Field>();builds=0;
 private trimFields(keep:Field){
  const bytes=(f:Field)=>f.allocatedPages*FIELD_PAGE_SIZE*13+f.pages.length*8+f.queue.ids.byteLength+f.queue.costs.byteLength;
  let memory=0;for(const field of this.fields.values())memory+=bytes(field);
  for(const [key,field]of this.fields){if(memory<=16*1024*1024&&this.fields.size<=32)break;if(field!==keep){memory-=bytes(field);this.fields.delete(key);}}
 }
 private field(goal:number,start:number,allowSea:boolean,landSpeed:number,seaSpeed:number,transferCost:number):Field {
   const key=`${goal}:${allowSea}:${landSpeed}:${seaSpeed}:${transferCost}`;let f=this.fields.get(key);
  if(!f){
   f=new Field();const page=f.page(goal);page.distance[goal&FIELD_PAGE_MASK]=0;page.next[goal&FIELD_PAGE_MASK]=goal;f.queue.push(goal,0);
   this.fields.set(key,f);this.builds++;
  }else {this.fields.delete(key);this.fields.set(key,f);}
  // Retain the frontier for the next soldier using this destination. Only the
  // requested start must be settled, rather than all 308,000 terrain triangles.
  if(f.pages[start>>>FIELD_PAGE_BITS]?.settled[start&FIELD_PAGE_MASK]){this.trimFields(f);return f;}
  const q=f.queue,lengths=edgeLengths??=new Float64Array(triangleCount*6).fill(NaN);
  while(q.length){const id=q.pop(),d=q.value,current=f.pages[id>>>FIELD_PAGE_BITS]!,currentOffset=id&FIELD_PAGE_MASK;if(d>current.distance[currentOffset]+1e-9)continue;for(let k=0;k<3;k++){const slot=id*3+k,n=neighborData[slot];if(n<0||!allowSea&&surfaces[n]!==1)continue;const offset=slot*2;
   if(Number.isNaN(lengths[offset])){const edge=portal(id,n),mid={x:(edge[1]+edge[3])/2,z:(edge[2]+edge[4])/2};lengths[offset]=length(center(id),mid);lengths[offset+1]=length(center(n),mid);}
     const nd=d+lengths[offset]/(surfaces[id]===2?seaSpeed:landSpeed)+lengths[offset+1]/(surfaces[n]===2?seaSpeed:landSpeed)+(surfaces[id]===surfaces[n]?0:transferCost);
   let page=f.pages[n>>>FIELD_PAGE_BITS];const offsetInPage=n&FIELD_PAGE_MASK,old=page?.distance[offsetInPage]??Infinity;
    if(nd<old-1e-9){page??=f.page(n);page.distance[offsetInPage]=nd;page.next[offsetInPage]=id;q.push(n,nd);}else if(Math.abs(nd-old)<=1e-9&&id<page!.next[offsetInPage])page!.next[offsetInPage]=id;
  }current.settled[currentOffset]=1;if(id===start)break;}
  this.trimFields(f);return f;
 }
 plan(from:Vec2,to:Vec2,landSpeed=1,seaSpeed=1,fromSea=false,transferCost=0):TravelPlan|null {
  if(!Number.isFinite(landSpeed)||landSpeed<=0||!Number.isFinite(seaSpeed)||seaSpeed<=0)return null;
   let start=terrainAt(from,!fromSea);
   if(fromSea&&start>=0&&surfaces[start]!==2)start=bucket(Math.floor(from.x/size),Math.floor(from.z/size)).find(id=>surfaces[id]===2&&inTriangle(id,from))??-1;
   const goal=terrainAt(to,true);if(start<0||goal<0)return null;
   if(!fromSea&&terrainSegment(from,to,false))return{revision:TERRAIN_REVISION,index:1,points:[{x:from.x,z:from.z,sea:false},{x:to.x,z:to.z,sea:false}]};
   const allowSea=fromSea||landComponents[start]!==landComponents[goal],before=Number(kernel.navigationBuilds.value),native=kernel.navigationField(goal,start,allowSea,landSpeed,seaSpeed,this.nativeOwner,transferCost);this.builds+=Number(kernel.navigationBuilds.value)-before;if(native===-1)return null;
   const f=native===-2?this.field(goal,start,allowSea,landSpeed,seaSpeed,transferCost):undefined;if(f&&!f.pages[start>>>FIELD_PAGE_BITS]?.settled[start&FIELD_PAGE_MASK])return null;
  const next=native>=0?new Int32Array(kernel.memory.buffer,native,triangleCount):undefined;
   const raw:TravelPoint[]=[{x:from.x,z:from.z,sea:fromSea},{...center(start),sea:fromSea}];let id=start,count=0;
  while(id!==goal){const n=next?next[id]:f!.pages[id>>>FIELD_PAGE_BITS]!.next[id&FIELD_PAGE_MASK];if(n<0||count++>triangleCount)return null;const edge=portal(id,n);raw.push({x:(edge[1]+edge[3])/2,z:(edge[2]+edge[4])/2,sea:surfaces[id]===2},{...center(n),sea:surfaces[n]===2});id=n;}
  raw.push({...to,sea:false});
  // String-pull within each continuous physical surface. Never skip coast changes.
  const points:TravelPoint[]=[raw[0]];let i=0;
  while(i<raw.length-1){let end=i+1;while(end+1<raw.length&&end<i+64&&raw[end+1].sea===raw[i+1].sea)end++;
   let chosen=i+1;for(let j=end;j>i+1;j--)if(terrainSegment(raw[i],raw[j],raw[i+1].sea)){chosen=j;break;}
   points.push({...raw[chosen],sea:raw[i+1].sea});i=chosen;
  }
  return{revision:TERRAIN_REVISION,points,index:1};
 }
 clear(){this.fields.clear();this.nativeOwner=++navigatorSerial;}
}
export function validateTravel(plan:TravelPlan,position:Vec2,destination:Vec2):boolean {
 if(!plan||plan.revision!==TERRAIN_REVISION||!Array.isArray(plan.points)||plan.points.length<2||plan.points.length>triangleCount*2+2||!Number.isInteger(plan.index)||plan.index<1||plan.index>=plan.points.length)return false;
 if(plan.points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.z)||typeof p.sea!=='boolean'))return false;
 if(length(plan.points.at(-1)!,destination)>1e-6)return false;
 for(let i=1;i<plan.points.length;i++)if(!terrainSegment(plan.points[i-1],plan.points[i],plan.points[i].sea))return false;
 const a=plan.points[plan.index-1],b=plan.points[plan.index],dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz,t=l?((position.x-a.x)*dx+(position.z-a.z)*dz)/l:0;
 // Original routes remain immutable and fully checked. Land units may be pushed
 // locally, but cannot bypass terrain or drift indefinitely off their corridor.
 if(!b.sea)return distanceToTravelSegment(plan,position)<=TRAVEL_LOCAL_OFFSET+1e-8&&terrainLocalSegment(position,travelCorridorPoint(plan,position));
 return t>=-1e-8&&t<=1+1e-8&&Math.hypot(position.x-a.x-t*dx,position.z-a.z-t*dz)<1e-4;
}

setupGeometry('setupTerrain',[storeData(planes),storeData(surfaces),storeData(offsets),storeData(bucketIds),storeData(walls),storeData(wallOffsets),storeData(wallIds),size,minX,minZ,cols,rows,wallSize,wallMinX,wallMinZ,wallCols,wallRows]);

const segmentSize=8,segmentMinX=Math.floor(data.bounds[0]/segmentSize),segmentMinZ=Math.floor(data.bounds[1]/segmentSize),segmentCols=Math.floor(data.bounds[2]/segmentSize)-segmentMinX+1,segmentRows=Math.floor(data.bounds[3]/segmentSize)-segmentMinZ+1;
const segmentOffsets=new Uint32Array(segmentCols*segmentRows+1),segmentRanges=new Int16Array(triangleCount*4);
for(let id=0;id<triangleCount;id++){
 const i=id*12,left=Math.floor(Math.min(planes[i],planes[i+4],planes[i+8])/segmentSize)-segmentMinX,right=Math.floor(Math.max(planes[i],planes[i+4],planes[i+8])/segmentSize)-segmentMinX,top=Math.floor(Math.min(planes[i+1],planes[i+5],planes[i+9])/segmentSize)-segmentMinZ,bottom=Math.floor(Math.max(planes[i+1],planes[i+5],planes[i+9])/segmentSize)-segmentMinZ;segmentRanges.set([left,right,top,bottom],id*4);
 for(let z=top;z<=bottom;z++)for(let x=left;x<=right;x++)segmentOffsets[z*segmentCols+x+1]++;
}
for(let i=1;i<segmentOffsets.length;i++)segmentOffsets[i]+=segmentOffsets[i-1];const segmentIds=new Uint32Array(segmentOffsets.at(-1)!),segmentCursor=segmentOffsets.slice();
for(let id=0;id<triangleCount;id++){const k=id*4;for(let z=segmentRanges[k+2];z<=segmentRanges[k+3];z++)for(let x=segmentRanges[k];x<=segmentRanges[k+1];x++)segmentIds[segmentCursor[z*segmentCols+x]++]=id;}
setupGeometry('setupSegments',[storeData(segmentOffsets),storeData(segmentIds),segmentSize,segmentMinX,segmentMinZ,segmentCols,segmentRows]);

setupGeometry('setupNavigation',[storeData(neighborData),storeData(centerData),storeData(new Float64Array(triangleCount*6).fill(NaN)),triangleCount]);
geometryReady=true;
