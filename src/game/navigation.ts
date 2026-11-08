import { MAP, BOUNDS, provinceAt } from './map.ts';
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
export const CELL=0.8,WIDTH=130,HEIGHT=78;
const labels=new Int16Array(WIDTH*HEIGHT);
for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++)labels[y*WIDTH+x]=provinceAt(BOUNDS.left+(x+0.5)*CELL,BOUNDS.top+(y+0.5)*CELL);
export function cellAt(x:number,z:number):number{const a=Math.floor((x-BOUNDS.left)/CELL),b=Math.floor((z-BOUNDS.top)/CELL);return a<0||b<0||a>=WIDTH||b>=HEIGHT?-1:b*WIDTH+a;}
export function cellCenter(i:number){return{x:BOUNDS.left+(i%WIDTH+0.5)*CELL,z:BOUNDS.top+(Math.floor(i/WIDTH)+0.5)*CELL};}
export class Navigator{
  cache=new Map<string,Flow>();builds=0;
  get(state:GameState,owner:number,target:number):Flow{
    const key=`${owner}:${target}:${state.topology}`,old=this.cache.get(key);if(old)return old;
    const costs=new Float32Array(labels.length);
    for(let i=0;i<labels.length;i++){const id=labels[i];costs[i]=id>=0&&(state.provinces[id].owner===owner||id===target)?(MAP[id].terrain==='highland'?2:MAP[id].terrain==='forest'?1.4:1):Infinity;}
    const c=MAP[target].center,flow=buildFlow({width:WIDTH,height:HEIGHT,costs},cellAt(c.x,c.z));
    if(this.cache.size>=64)this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key,flow);this.builds++;return flow;
  }
  clear(){this.cache.clear();}
}
