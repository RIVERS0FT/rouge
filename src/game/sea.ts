import data from '../../data/sea-navigation.json' with {type:'json'};
import type {Vec2} from './types.ts';
export interface SeaPort {region:number;land:Vec2;shore:Vec2;sea:Vec2;node:number}
export interface SeaLeg {from:number;to:number;depart:Vec2;arrive:Vec2;waypoints:Vec2[]}
const edges=Uint8Array.from(atob(data.edges),c=>c.charCodeAt(0));
const byRegion=new Map<number,SeaPort[]>();
for(const p of data.ports){const list=byRegion.get(p.region)??[];list.push(p);byRegion.set(p.region,list);}
export function seaPorts(region:number):readonly SeaPort[]{return byRegion.get(region)??[];}
export function hasSeaPort(region:number):boolean{return byRegion.has(region);}
export function seaCellCenter(id:number):Vec2{return{x:data.left+(id%data.width+.5)*data.cell,z:data.top+(Math.floor(id/data.width)+.5)*data.cell};}
export const SEA_GRAPH={cell:data.cell,width:data.width,height:data.height,portCount:data.ports.length,atlas:data.atlas};
const distance=(a:Vec2,b:Vec2)=>Math.hypot(a.x-b.x,a.z-b.z);
class Heap{
 private values:[number,number][]=[];
 get length(){return this.values.length;}
 push(id:number,score:number){let i=this.values.length;this.values.push([id,score]);while(i>0){const p=(i-1)>>1,v=this.values[p];if(v[1]<score||(v[1]===score&&v[0]<=id))break;this.values[i]=v;i=p;}this.values[i]=[id,score];}
 pop():[number,number]{const root=this.values[0],last=this.values.pop()!;if(this.values.length){let i=0;while(i*2+1<this.values.length){let c=i*2+1;if(c+1<this.values.length&&(this.values[c+1][1]<this.values[c][1]||(this.values[c+1][1]===this.values[c][1]&&this.values[c+1][0]<this.values[c][0])))c++;const v=this.values[c];if(v[1]>last[1]||(v[1]===last[1]&&v[0]>=last[0]))break;this.values[i]=v;i=c;}this.values[i]=last;}return root;}
}
const cache=new Map<string,SeaLeg|null>();
const copy=(leg:SeaLeg|null):SeaLeg|null=>leg?{from:leg.from,to:leg.to,depart:{...leg.depart},arrive:{...leg.arrive},waypoints:leg.waypoints.map(p=>({...p}))}:null;
/** Multi-source Dijkstra on certified cardinal sea edges. No straight-line ocean
 * shortcuts, antipodal wrapping, lake routes or source/target center teleportation. */
export function seaRoute(from:number,to:number):SeaLeg|null{
 if(!Number.isInteger(from)||!Number.isInteger(to)||from===to)return null;
 const key=`${from}:${to}`;if(cache.has(key))return copy(cache.get(key)!);
 const starts=seaPorts(from),ends=seaPorts(to);if(!starts.length||!ends.length)return null;
 const dist=new Float64Array(edges.length).fill(Infinity),parent=new Int32Array(edges.length).fill(-1),origin=new Int32Array(edges.length).fill(-1),heap=new Heap();
 for(let i=0;i<starts.length;i++){const p=starts[i],d=distance(p.land,p.sea)+distance(p.sea,seaCellCenter(p.node));if(d<dist[p.node]){dist[p.node]=d;origin[p.node]=i;heap.push(p.node,d);}}
 const targets=new Map<number,SeaPort[]>();for(const p of ends){const list=targets.get(p.node)??[];list.push(p);targets.set(p.node,list);}
 let best=Infinity,end:SeaPort|undefined;
 while(heap.length){const [id,cost]=heap.pop();if(cost>dist[id]+1e-9)continue;if(cost>best)break;
  for(const port of targets.get(id)??[]){const total=cost+distance(seaCellCenter(id),port.sea)+distance(port.sea,port.land);if(total<best-1e-9){best=total;end=port;}}
  for(const [mask,delta]of [[1,1],[2,data.width],[4,-1],[8,-data.width]])if(edges[id]&mask){const next=id+delta,d=cost+data.cell;if(d<dist[next]-1e-9){dist[next]=d;parent[next]=id;origin[next]=origin[id];heap.push(next,d);}}
 }
 let result:SeaLeg|null=null;
 if(end){const start=starts[origin[end.node]],nodes=[end.node];while(parent[nodes[0]]>=0)nodes.unshift(parent[nodes[0]]);
  // Only remove collinear intermediate grid nodes: every retained segment is the
  // union of already checked edges, never an unverified diagonal across a coast.
  const compact=nodes.filter((id,i)=>i===0||i===nodes.length-1||id-nodes[i-1]!==nodes[i+1]-id);
  result={from,to,depart:{...start.land},arrive:{...end.land},waypoints:[start.land,start.shore,start.sea,...compact.map(seaCellCenter),end.sea,end.shore,end.land].map(p=>({...p}))};
 }
 if(cache.size>=128)cache.delete(cache.keys().next().value!);cache.set(key,result);return copy(result);
}
/** Saved routes must equal canonical graph paths, not arbitrary imported vertices. */
export function validateSeaLeg(value:unknown):value is SeaLeg{
 if(!value||typeof value!=='object')return false;const v=value as SeaLeg;
 const expected=seaRoute(v.from,v.to);if(!expected||!Array.isArray(v.waypoints)||v.waypoints.length!==expected.waypoints.length)return false;
 const equal=(a:Vec2|undefined,b:Vec2)=>!!a&&Number.isFinite(a.x)&&Number.isFinite(a.z)&&Math.abs(a.x-b.x)<1e-8&&Math.abs(a.z-b.z)<1e-8;
 return equal(v.depart,expected.depart)&&equal(v.arrive,expected.arrive)&&v.waypoints.every((p,i)=>equal(p,expected.waypoints[i]));
}
/** Position must stay on the CURRENT certified leg, not merely somewhere near sea. */
export function onSeaSegment(point:Vec2,a:Vec2,b:Vec2,tolerance=1e-5):boolean{
 if(![point.x,point.z,a.x,a.z,b.x,b.z].every(Number.isFinite))return false;
 const dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz;if(len===0)return distance(point,a)<=tolerance;
 const t=((point.x-a.x)*dx+(point.z-a.z)*dz)/len;if(t<0||t>1)return false;
 return Math.hypot(point.x-a.x-t*dx,point.z-a.z-t*dz)<=tolerance;
}
