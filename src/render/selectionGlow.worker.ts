import {innerGlowMesh} from './selectionGlow.ts';
import type {Vec2} from '../game/types.ts';
self.onmessage=({data}:{data:{land:Float32Array;edges:Float64Array;width:number}})=>{
 const triangles:Vec2[][]=[],segments:[Vec2,Vec2][]=[];
 for(let i=0;i<data.land.length;i+=9)triangles.push([0,3,6].map(j=>({x:data.land[i+j],z:data.land[i+j+2]})));
 for(let i=0;i<data.edges.length;i+=4)segments.push([{x:data.edges[i],z:data.edges[i+1]},{x:data.edges[i+2],z:data.edges[i+3]}]);
 const started=performance.now(),glow=innerGlowMesh(triangles,segments,data.width),positions=new Float32Array(glow.points.length*3),distance=Float32Array.from(glow.distance);
 for(let i=0;i<glow.points.length;i++){positions[i*3]=glow.points[i].x;positions[i*3+1]=.29;positions[i*3+2]=glow.points[i].z;}
 self.postMessage({positions,distance,elapsed:performance.now()-started},{transfer:[positions.buffer,distance.buffer]});
};
