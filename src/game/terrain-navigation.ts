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
const size=40,minX=Math.floor(data.bounds[0]/size),minZ=Math.floor(data.bounds[1]/size),cols=Math.floor(data.bounds[2]/size)-minX+1,rows=Math.floor(data.bounds[3]/size)-minZ+1;
const offsets=new Uint32Array(cols*rows+1),ranges=new Int16Array(triangleCount*4);
for(let i=0;i<triangleCount;i++){const t=triangle(i),xs=t.map(p=>p[0]),zs=t.map(p=>p[1]);centerData[i*2]=(xs[0]+xs[1]+xs[2])/3;centerData[i*2+1]=(zs[0]+zs[1]+zs[2])/3;
 const a=Math.floor(Math.min(...xs)/size)-minX,b=Math.floor(Math.max(...xs)/size)-minX,c=Math.floor(Math.min(...zs)/size)-minZ,d=Math.floor(Math.max(...zs)/size)-minZ;ranges.set([a,b,c,d],i*4);
 for(let z=c;z<=d;z++)for(let x=a;x<=b;x++)offsets[z*cols+x+1]++;
}
for(let i=1;i<offsets.length;i++)offsets[i]+=offsets[i-1];
const bucketIds=new Uint32Array(offsets.at(-1)!),cursor=offsets.slice();
for(let i=0;i<triangleCount;i++){const [a,b,c,d]=ranges.subarray(i*4,i*4+4);for(let z=c;z<=d;z++)for(let x=a;x<=b;x++)bucketIds[cursor[z*cols+x]++]=i;}
const bucket=(x:number,z:number)=>{const a=x-minX,b=z-minZ;if(a<0||b<0||a>=cols||b>=rows)return bucketIds.subarray(0,0);const id=b*cols+a;return bucketIds.subarray(offsets[id],offsets[id+1]);};
const cross=(a:number[],b:number[],p:Vec2)=>(b[0]-a[0])*(p.z-a[1])-(b[1]-a[1])*(p.x-a[0]);
export function terrainAt(p:Vec2,landOnly=false):number {
 if(!Number.isFinite(p.x)||!Number.isFinite(p.z))return -1;
 let found=-1;
 for(const id of bucket(Math.floor(p.x/size),Math.floor(p.z/size))){if(landOnly&&surfaces[id]!==1)continue;const t=triangle(id),s=t.map((a,i)=>cross(a,t[(i+1)%3],p));if(s.every(v=>v>=-1e-8)||s.every(v=>v<=1e-8)){if(surfaces[id]===1)return id;found=id;}}
 return found;
}
/** Clip a segment to each candidate triangle and check interval union. Exact
 * convex clipping avoids sampling through thin islands/lakes. No admin borders. */
export function terrainSegment(a:Vec2,b:Vec2,sea:boolean):boolean {
 const spans:[number,number][]=[];const seen=new Set<number>();
 for(let x=Math.floor(Math.min(a.x,b.x)/size);x<=Math.floor(Math.max(a.x,b.x)/size);x++)for(let z=Math.floor(Math.min(a.z,b.z)/size);z<=Math.floor(Math.max(a.z,b.z)/size);z++)for(const id of bucket(x,z)){
  if(seen.has(id)||surfaces[id]!== (sea?2:1))continue;seen.add(id);const t=triangle(id),orientation=cross(t[0],t[1],{x:t[2][0],z:t[2][1]})>=0?1:-1;let lo=0,hi=1;
  for(let k=0;k<3;k++){const c=orientation*cross(t[k],t[(k+1)%3],a),d=orientation*cross(t[k],t[(k+1)%3],b)-c;if(Math.abs(d)<1e-14){if(c<-1e-8){hi=-1;break;}}else {const at=(-1e-8-c)/d;if(d>0)lo=Math.max(lo,at);else hi=Math.min(hi,at);}}
  if(lo<=hi&&hi>=0&&lo<=1)spans.push([Math.max(0,lo),Math.min(1,hi)]);
 }
 spans.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let end=0;for(const [lo,hi]of spans){if(lo>end+1e-8)return false;end=Math.max(end,hi);if(end>=1-1e-8)return true;}return false;
}
class Heap {
 a:[number,number][]=[];
 less(a:[number,number],b:[number,number]){return a[1]<b[1]||(a[1]===b[1]&&a[0]<b[0]);}
 push(n:number,d:number){const v:[number,number]=[n,d];let i=this.a.length;this.a.push(v);while(i){const p=(i-1)>>1;if(!this.less(v,this.a[p]))break;this.a[i]=this.a[p];i=p;}this.a[i]=v;}
 pop(){const root=this.a[0],last=this.a.pop()!;if(this.a.length){let i=0;while(i*2+1<this.a.length){let c=i*2+1;if(c+1<this.a.length&&this.less(this.a[c+1],this.a[c]))c++;if(!this.less(this.a[c],last))break;this.a[i]=this.a[c];i=c;}this.a[i]=last;}return root;}
}
interface Field {distance:Float64Array;next:Int32Array}
const length=(a:Vec2,b:Vec2)=>Math.hypot(a.x-b.x,a.z-b.z);
export class TerrainNavigator {
 private fields=new Map<string,Field>();builds=0;
 private field(goal:number,allowSea:boolean,landSpeed:number,seaSpeed:number):Field {
  const key=`${goal}:${allowSea}:${landSpeed}:${seaSpeed}`,cached=this.fields.get(key);if(cached)return cached;
  const distance=new Float64Array(triangleCount).fill(Infinity),next=new Int32Array(triangleCount).fill(-1),q=new Heap();distance[goal]=0;next[goal]=goal;q.push(goal,0);
  while(q.a.length){const [id,d]=q.pop()!;if(d>distance[id]+1e-9)continue;for(const n of neighborData.subarray(id*3,id*3+3)){if(n<0)continue;const edge=portal(id,n);if(!allowSea&&surfaces[n]!==1)continue;const mid={x:(edge[1]+edge[3])/2,z:(edge[2]+edge[4])/2};const nd=d+length(center(id),mid)/(surfaces[id]===2?seaSpeed:landSpeed)+length(center(n),mid)/(surfaces[n]===2?seaSpeed:landSpeed);
   if(nd<distance[n]-1e-9){distance[n]=nd;next[n]=id;q.push(n,nd);}else if(Math.abs(nd-distance[n])<=1e-9&&id<next[n])next[n]=id;
  }}
  const f={distance,next};if(this.fields.size>=4)this.fields.delete(this.fields.keys().next().value!);this.fields.set(key,f);this.builds++;return f;
 }
 plan(from:Vec2,to:Vec2,landSpeed=1,seaSpeed=1):TravelPlan|null {
  if(!Number.isFinite(landSpeed)||landSpeed<=0||!Number.isFinite(seaSpeed)||seaSpeed<=0)return null;
  const start=terrainAt(from,true),goal=terrainAt(to,true);if(start<0||goal<0)return null;
  if(terrainSegment(from,to,false))return{revision:TERRAIN_REVISION,index:1,points:[{...from,sea:false},{...to,sea:false}]};
  let f=this.field(goal,false,landSpeed,seaSpeed);if(!Number.isFinite(f.distance[start]))f=this.field(goal,true,landSpeed,seaSpeed);if(!Number.isFinite(f.distance[start]))return null;
  const raw:TravelPoint[]=[{...from,sea:false},{...center(start),sea:false}];let id=start,count=0;
  while(id!==goal){const n=f.next[id];if(n<0||count++>triangleCount)return null;const edge=portal(id,n);raw.push({x:(edge[1]+edge[3])/2,z:(edge[2]+edge[4])/2,sea:surfaces[id]===2},{...center(n),sea:surfaces[n]===2});id=n;}
  raw.push({...to,sea:false});
  // String-pull within each continuous physical surface. Never skip coast changes.
  const points:TravelPoint[]=[raw[0]];let i=0;
  while(i<raw.length-1){let end=i+1;while(end+1<raw.length&&end<i+64&&raw[end+1].sea===raw[i+1].sea)end++;
   let chosen=i+1;for(let j=end;j>i+1;j--)if(terrainSegment(raw[i],raw[j],raw[i+1].sea)){chosen=j;break;}
   points.push({...raw[chosen],sea:raw[i+1].sea});i=chosen;
  }
  return{revision:TERRAIN_REVISION,points,index:1};
 }
 clear(){this.fields.clear();}
}
export function validateTravel(plan:TravelPlan,position:Vec2,destination:Vec2):boolean {
 if(!plan||plan.revision!==TERRAIN_REVISION||!Array.isArray(plan.points)||plan.points.length<2||plan.points.length>triangleCount*2+2||!Number.isInteger(plan.index)||plan.index<1||plan.index>=plan.points.length)return false;
 if(plan.points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.z)||typeof p.sea!=='boolean'))return false;
 if(length(plan.points.at(-1)!,destination)>1e-6)return false;
 for(let i=1;i<plan.points.length;i++)if(!terrainSegment(plan.points[i-1],plan.points[i],plan.points[i].sea))return false;
 const a=plan.points[plan.index-1],b=plan.points[plan.index],dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz,t=l?((position.x-a.x)*dx+(position.z-a.z)*dz)/l:0;
 return t>=-1e-8&&t<=1+1e-8&&Math.hypot(position.x-a.x-t*dx,position.z-a.z-t*dz)<1e-4;
}
