import { MAP, navigableInProvince } from './map.ts';
import type { GameState } from './types.ts';
export interface Grid {width:number;height:number;costs:Float32Array}
export interface Flow {width:number;height:number;goal:number;distance:Float32Array;next:Int32Array}
const DIRECTIONS=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
class Heap{
  data:[number,number][]=[];
  push(n:number,d:number){let i=this.data.length;this.data.push([n,d]);while(i>0){const p=(i-1)>>1;if(this.data[p][1]<=d)break;this.data[i]=this.data[p];i=p;}this.data[i]=[n,d];}
  pop():[number,number]|undefined{if(!this.data.length)return;const root=this.data[0],last=this.data.pop()!;if(!this.data.length)return root;let i=0;while(true){let c=i*2+1;if(c>=this.data.length)break;if(c+1<this.data.length&&this.data[c+1][1]<this.data[c][1])c++;if(this.data[c][1]>=last[1])break;this.data[i]=this.data[c];i=c;}this.data[i]=last;return root;}
}
/** Reverse Dijkstra: one shared integration/direction field per target and permission set. */
export function buildFlow(grid:Grid,goal:number):Flow{
  const{width,height,costs}=grid,distance=new Float32Array(width*height).fill(Infinity),next=new Int32Array(width*height).fill(-1);
  if(!Number.isInteger(goal)||goal<0||goal>=distance.length||!Number.isFinite(costs[goal]))return{width,height,goal,distance,next};
  const heap=new Heap();distance[goal]=0;next[goal]=goal;heap.push(goal,0);
  while(heap.data.length){const[i,d]=heap.pop()!;if(d>distance[i]+0.001)continue;const x=i%width,y=Math.floor(i/width);
    for(const[dx,dy]of DIRECTIONS){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;const ni=ny*width+nx;if(!Number.isFinite(costs[ni]))continue;
      if(dx&&dy&&(!Number.isFinite(costs[y*width+nx])||!Number.isFinite(costs[ny*width+x])))continue;
      const nd=d+(costs[i]+costs[ni])*0.5*(dx&&dy?Math.SQRT2:1);
      if(nd<distance[ni]-0.001){distance[ni]=nd;next[ni]=i;heap.push(ni,distance[ni]);}
    }
  }return{width,height,goal,distance,next};
}

export interface LocalFlow extends Flow { left:number; top:number; cellSize:number; from:number; target:number }
export function cellAt(x:number,z:number,flow:LocalFlow):number {
  const a=Math.floor((x-flow.left)/flow.cellSize),b=Math.floor((z-flow.top)/flow.cellSize);
  return a<0||b<0||a>=flow.width||b>=flow.height?-1:b*flow.width+a;
}
export function cellCenter(i:number,flow:LocalFlow) {
  return {x:flow.left+(i%flow.width+0.5)*flow.cellSize,z:flow.top+(Math.floor(i/flow.width)+0.5)*flow.cellSize};
}
/** The high-level route is a sequence of LAND-adjacent management regions.
 * No country permissions, sea shortcuts or teleportation are inferred from distance.
 * Optional blocked edges let the authoritative navigator reject sub-grid necks and
 * try a different corridor. Equal-cost routes are deterministic by region ID. */
export function findRegionRoute(from:number,target:number,blocked:ReadonlySet<string>=new Set()):number[]|null {
  if(!Number.isInteger(from)||!Number.isInteger(target)||!MAP[from]?.playable||!MAP[target]?.playable)return null;
  if(from===target)return [from];
  const distance=new Float64Array(MAP.length).fill(Infinity),parent=new Int32Array(MAP.length).fill(-1),heap=new Heap();
  distance[from]=0;heap.push(from,0);
  while(heap.data.length){
    const [id,cost]=heap.pop()!;if(cost>distance[id]+1e-9)continue;if(id===target)break;
    for(const next of MAP[id].neighbors){
      if(!MAP[next].playable||blocked.has(`${id}:${next}`))continue;
      const a=MAP[id].center,b=MAP[next].center,d=cost+Math.max(0.01,Math.hypot(b.x-a.x,b.z-a.z));
      if(d<distance[next]-1e-9){distance[next]=d;parent[next]=id;heap.push(next,d);}
    }
  }
  if(!Number.isFinite(distance[target]))return null;
  const path=[target];while(path[0]!==from){const id=parent[path[0]];if(id<0)return null;path.unshift(id);}return path;
}

export class Navigator {
  cache=new Map<string,LocalFlow>();builds=0;
  private invalidEdges=new Set<string>();
  /** Validate every local leg before accepting a remote order. Lazy checks avoid
   * rasterizing the entire world; impassable candidates are removed and replanned. */
  route(state:GameState,owner:number,from:number,target:number):number[]|null {
    for(;;){
      const path=findRegionRoute(from,target,this.invalidEdges);if(!path)return null;
      let valid=true;
      for(let i=1;i<path.length;i++){
        const flow=this.get(state,owner,path[i],path[i-1]),center=MAP[path[i-1]].center,cell=cellAt(center.x,center.z,flow);
        if(cell<0||!Number.isFinite(flow.distance[cell])){this.invalidEdges.add(`${path[i-1]}:${path[i]}`);valid=false;break;}
      }
      if(valid)return path;
    }
  }
  get(state:GameState,owner:number,target:number,from:number):LocalFlow {
    const key=`${from}:${target}`,cached=this.cache.get(key);if(cached)return cached;
    // A local land corridor, not a global coarse raster. Disjoint islands are not bridges.
    const a=MAP[from],b=MAP[target];if(!a?.playable||!b?.playable)throw new Error('unreachable');
    const bounds={left:Math.min(a.bounds.left,b.bounds.left),right:Math.max(a.bounds.right,b.bounds.right),top:Math.min(a.bounds.top,b.bounds.top),bottom:Math.max(a.bounds.bottom,b.bounds.bottom)};
    const cellSize=Math.max(bounds.right-bounds.left,bounds.bottom-bounds.top)/190;
    const left=bounds.left-cellSize*2,top=bounds.top-cellSize*2;
    const width=Math.ceil((bounds.right-left)/cellSize)+2,height=Math.ceil((bounds.bottom-top)/cellSize)+2;
    const costs=new Float32Array(width*height).fill(Infinity),meta={left,top,cellSize,width,height,from,target};
    let goal=-1,nearest=Infinity;
    for(let i=0;i<costs.length;i++){
      const x=left+(i%width+0.5)*cellSize,z=top+(Math.floor(i/width)+0.5)*cellSize;
      const inTarget=navigableInProvince(target,x,z),inSource=navigableInProvince(from,x,z);
      if(inTarget||inSource)costs[i]=1;
      const distance=(x-b.center.x)**2+(z-b.center.z)**2;
      if(inTarget&&distance<nearest){nearest=distance;goal=i;}
    }
    const result={...buildFlow({width,height,costs},goal),...meta};
    if(this.cache.size>=128)this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key,result);this.builds++;return result;
  }
  canMove(flow:LocalFlow,x:number,z:number,toX:number,toZ:number):boolean {
    if(!navigableInProvince(flow.from,x,z)&&!navigableInProvince(flow.target,x,z))return false;
    const count=Math.max(2,Math.ceil(Math.hypot(toX-x,toZ-z)/(flow.cellSize*0.2)));
    for(let i=1;i<=count;i++){
      const t=i/count,px=x+(toX-x)*t,pz=z+(toZ-z)*t;
      if(!navigableInProvince(flow.from,px,pz)&&!navigableInProvince(flow.target,px,pz))return false;
    }
    return true;
  }
  clear(){this.cache.clear();}
}
