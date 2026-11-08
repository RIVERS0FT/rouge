import type { Vec2, ProvinceDef } from './types.ts';
export const BOUNDS={left:-52,right:52,top:-31,bottom:31};
// Fictional test theatre. These polygons are NOT real administrative boundaries.
const OUTLINE:Vec2[]=[[-48,-17],[-35,-27],[-8,-29],[21,-25],[42,-17],[49,0],[40,19],[18,27],[-10,28],[-36,20],[-50,3]].map(([x,z])=>({x,z}));
const NAMES:[string,string][]=[
 ['西岬','Westcape'],['青石','Greystone'],['高松','Highpine'],['北境','Northreach'],['银岭','Silverridge'],['白崖','Whitecliff'],['霜原','Frostfield'],['东望','Eastwatch'],
 ['暮湾','Duskbay'],['绿谷','Greenvale'],['橡林','Oakwood'],['铁丘','Ironhill'],['王冠','Crownlands'],['灰山','Ashmont'],['河口','Rivermouth'],['晨湾','Dawnbay'],
 ['潮岸','Tidecoast'],['丰原','Harvest'],['杉林','Cedarwood'],['中州','Midlands'],['长桥','Longbridge'],['红土','Redearth'],['金原','Goldfield'],['日岸','Sunshore'],
 ['南岬','Southcape'],['芦泽','Reedmarsh'],['麦田','Wheatfield'],['鹿原','Deerplain'],['石门','Stonegate'],['南岭','Southridge'],['松港','Pineharbor'],['星湾','Starbay'],
];
function clip(poly:Vec2[],a:number,b:number,c:number):Vec2[]{
  const result:Vec2[]=[];
  for(let i=0;i<poly.length;i++){
    const p=poly[i],q=poly[(i+1)%poly.length],dp=a*p.x+b*p.z-c,dq=a*q.x+b*q.z-c;
    if(dp<=1e-8)result.push(p);
    if((dp<0)!==(dq<0)){const t=dp/(dp-dq);result.push({x:p.x+(q.x-p.x)*t,z:p.z+(q.z-p.z)*t});}
  }return result;
}
const seeds=Array.from({length:32},(_,i)=>({x:-39+(i%8)*11+Math.sin(i*9.3)*2,z:-19+Math.floor(i/8)*12+Math.cos(i*3.7)*2}));
export const MAP:ProvinceDef[]=seeds.map((s,id)=>{
  let polygon=OUTLINE.map(p=>({...p}));
  for(let j=0;j<seeds.length;j++)if(j!==id){const t=seeds[j];polygon=clip(polygon,t.x-s.x,t.z-s.z,(t.x*t.x+t.z*t.z-s.x*s.x-s.z*s.z)/2);}
  const center=polygon.reduce((p,q)=>({x:p.x+q.x/polygon.length,z:p.z+q.z/polygon.length}),{x:0,z:0});
  return{id,name:NAMES[id],center,polygon,neighbors:[],terrain:[3,4,11,12,20,21,28].includes(id)?'highland':[2,9,10,18,25,26].includes(id)?'forest':'plain'};
});
for(const a of MAP)for(const b of MAP)if(a.id<b.id){
  const common=a.polygon.filter(p=>b.polygon.some(q=>Math.hypot(p.x-q.x,p.z-q.z)<1e-5));
  if(common.length>=2&&Math.hypot(common[0].x-common[1].x,common[0].z-common[1].z)>0.01){a.neighbors.push(b.id);b.neighbors.push(a.id);}
}
export function contains(polygon:Vec2[],x:number,z:number):boolean{
  let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;}return inside;
}
export function provinceAt(x:number,z:number):number{return MAP.find(p=>contains(p.polygon,x,z))?.id??-1;}
export function heightAt(x:number,z:number):number{
  const ridge=Math.exp(-Math.pow((x-0.28*z)/12,2));
  return 0.45+ridge*(1.7+1.2*Math.sin(z*0.36)**2)+0.24*Math.sin(x*0.42)*Math.cos(z*0.34);
}
