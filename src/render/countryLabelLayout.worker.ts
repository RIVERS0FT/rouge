import {MAP,BOUNDS} from '../game/map.ts';
import {buildCountryPlacements,type CountryPlacementCache} from './countryLabelPaths.ts';
import type {CountryLabel} from './countryLabels.ts';
import {buildBorderEdges} from './territoryBorders.ts';

const edges=buildBorderEdges(MAP,BOUNDS),cache:CountryPlacementCache=new Map();let campaign='';
self.onmessage=({data}:{data:{campaign:string;owners:number[];labels:CountryLabel[]}})=>{
 if(campaign!==data.campaign){campaign=data.campaign;cache.clear();}
 buildCountryPlacements(MAP,data.owners,data.labels,edges,cache);
 self.postMessage({type:'layout',campaign,entries:[...cache]});
};
// Shared map imports use top-level await. The parent must wait until this
// handler exists before sending its first ownership snapshot.
self.postMessage({type:'ready'});
