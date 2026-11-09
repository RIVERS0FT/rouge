/** Offline, deterministic transport graph derived only from the shipped land atlas.
 * Run after prepare:map: node --experimental-strip-types scripts/build-sea.ts */
import fs from 'node:fs';
import {MAP,BOUNDS,navigableInProvince} from '../src/game/map.ts';
import {waterPoint,waterSegment,coastSegment} from '../src/game/sea-geometry.ts';
import type {Vec2} from '../src/game/types.ts';
const cell=10,width=Math.floor((BOUNDS.right-BOUNDS.left)/cell),height=Math.floor((BOUNDS.bottom-BOUNDS.top)/cell);
const center=(i:number)=>({x:BOUNDS.left+(i%width+.5)*cell,z:BOUNDS.top+(Math.floor(i/width)+.5)*cell});
const edges=new Uint8Array(width*height),water=new Uint8Array(edges.length);
for(let i=0;i<water.length;i++)water[i]=Number(waterPoint(center(i)));
for(let i=0;i<edges.length;i++)if(water[i]){
 if(i%width+1<width&&water[i+1]&&waterSegment(center(i),center(i+1))){edges[i]|=1;edges[i+1]|=4;}
 if(Math.floor(i/width)+1<height&&water[i+width]&&waterSegment(center(i),center(i+width))){edges[i]|=2;edges[i+width]|=8;}
}
// Keep only open-ocean-connected water. Coarse-grid sealed straits and inland lakes
// are deliberately unavailable rather than inventing a water connection.
const ocean=new Uint8Array(edges.length),queue:number[]=[];
for(let i=0;i<edges.length;i++)if(water[i]&&(i%width===0||i%width===width-1||i<width||i>=edges.length-width)){ocean[i]=1;queue.push(i);}
for(let j=0;j<queue.length;j++){const i=queue[j];for(const [mask,delta]of [[1,1],[2,width],[4,-1],[8,-width]])if((edges[i]&mask)&&!ocean[i+delta]){ocean[i+delta]=1;queue.push(i+delta);}}
for(let i=0;i<edges.length;i++)if(!ocean[i])edges[i]=0;
type Port={region:number;land:Vec2;shore:Vec2;sea:Vec2;node:number};
const ports:Port[]=[];
for(const p of MAP)if(p.playable){
 const ring=p.parts[p.navigationPart][0],candidates:Port[]=[];
 for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length],len=Math.hypot(b.x-a.x,b.z-a.z);if(len<.1)continue;
  const shore={x:(a.x+b.x)/2,z:(a.z+b.z)/2},nx=-(b.z-a.z)/len*.03,nz=(b.x-a.x)/len*.03;
  let land={x:shore.x+nx,z:shore.z+nz},sea={x:shore.x-nx,z:shore.z-nz};
  if(!navigableInProvince(p.id,land.x,land.z)){[land,sea]=[sea,land];}
  if(!navigableInProvince(p.id,land.x,land.z)||!waterPoint(sea)||!coastSegment(land,sea,shore))continue;
  const gx=Math.floor((sea.x-BOUNDS.left)/cell),gz=Math.floor((sea.z-BOUNDS.top)/cell),near:number[]=[];
  for(let z=Math.max(0,gz-2);z<=Math.min(height-1,gz+2);z++)for(let x=Math.max(0,gx-2);x<=Math.min(width-1,gx+2);x++){const id=z*width+x;if(ocean[id]&&edges[id])near.push(id);}
  near.sort((a,b)=>Math.hypot(center(a).x-sea.x,center(a).z-sea.z)-Math.hypot(center(b).x-sea.x,center(b).z-sea.z)||a-b);
  const node=near.find(id=>waterSegment(sea,center(id)));if(node!==undefined)candidates.push({region:p.id,land,shore,sea,node});
 }
 candidates.sort((a,b)=>Math.hypot(a.land.x-p.center.x,a.land.z-p.center.z)-Math.hypot(b.land.x-p.center.x,b.land.z-p.center.z)||a.node-b.node);
 // Several distinct water cells permit fallback around a blocked local land approach.
 const seen=new Set<number>();for(const port of candidates)if(!seen.has(port.node)){seen.add(port.node);ports.push(port);if(seen.size>=4)break;}
}
const result={format:1,atlas:'854f3b999cce9a0a7f85968cfe0ec95d4c4cb52a8e9c9bb5c5ef8c17b86b8449',cell,width,height,left:BOUNDS.left,top:BOUNDS.top,edges:Buffer.from(edges).toString('base64'),ports};
fs.writeFileSync('data/sea-navigation.json',JSON.stringify(result));
console.log(`Sea graph: ${width}x${height}, ${queue.length} open-ocean cells, ${ports.length} ports in ${new Set(ports.map(p=>p.region)).size} regions.`);
