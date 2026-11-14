import {MAP,BOUNDS} from '../game/map.ts';
import {buildBorderEdges,classifyBorder,borderPositions,type BorderEdge} from './territoryBorders.ts';
import {politicalRibbonGeometry} from './politicalTint.ts';
const edges=buildBorderEdges(MAP,BOUNDS);
self.onmessage=({data}:{data:{campaign:string;revision:number;owners:number[];groups:string[]}})=>{
 const internal:BorderEdge[]=[],countries:BorderEdge[]=[],painted:BorderEdge[]=[];
 for(const edge of edges){const kind=classifyBorder(edge,data.owners,data.groups);
  if(kind==='country')countries.push(edge);else if(kind==='internal')internal.push(edge);
  if((kind==='country'||kind==='coast')&&edge.atoms.some(id=>data.owners[id]>=0))painted.push(edge);
 }
 const admin=new Float32Array(borderPositions(internal,.24)),country=new Float32Array(borderPositions(countries,.28)),ribbon=politicalRibbonGeometry(painted);
 const attributes=Object.fromEntries(['aStart','aEnd','aPrevious','aNext'].map(name=>[name,ribbon.getAttribute(name).array]));
 self.postMessage({campaign:data.campaign,revision:data.revision,admin,country,attributes,segments:painted.length},{transfer:[admin.buffer,country.buffer,...Object.values(attributes).map(array=>array.buffer)]});
};
self.postMessage({type:'ready'});
