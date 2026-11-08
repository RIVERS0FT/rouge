/** Build an offline, pinned Admin-1 atlas. No map server, API key or runtime downloads. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const revision='f1890d9f152c896d250a77557a5751a93d494776';
const source=`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${revision}/geojson/ne_10m_admin_1_states_provinces.geojson`;
const sha256='22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5';
const format=1,output=new URL('src/generated/world.json',root),cache=new URL('.cache/admin1.geojson',root);
try {const old=JSON.parse(await readFile(output,'utf8'));if(old.format===format&&old.sourceSha256===sha256&&old.provinces.length===4596){console.log('World atlas: verified source identity, using local generated atlas.');process.exit(0);}}catch{}
await mkdir(new URL('.cache/',root),{recursive:true});await mkdir(new URL('src/generated/',root),{recursive:true});
let raw;try{raw=await readFile(cache);}catch{
 console.log('Downloading pinned Natural Earth Admin-1 source (first setup only)…');
 const response=await fetch(source,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw new Error(`Map download failed: HTTP ${response.status}`);
 raw=Buffer.from(await response.arrayBuffer());
}
if(createHash('sha256').update(raw).digest('hex')!==sha256)throw new Error('Natural Earth source checksum mismatch; refusing to build.');
await writeFile(cache,raw);
const features=JSON.parse(raw).features.sort((a,b)=>a.properties.adm1_code.localeCompare(b.properties.adm1_code,'en'));
const pointKey=p=>`${Math.round(p[0]*1e6)},${Math.round(p[1]*1e6)}`;
function dist2(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;return(p[0]-a[0]-dx*t)**2+(p[1]-a[1]-dy*t)**2;}
// Keep the UNION of retained vertices across all rings. Shared source edges therefore
// retain identical vertices on both sides, unlike independent polygon simplification.
const keep=new Set(),edgeOwner=new Map(),neighbors=features.map(()=>new Set());
const polys=features.map(f=>f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates);
for(let id=0;id<polys.length;id++)for(const poly of polys[id])for(const ring of poly){
 const retained=new Set([0,ring.length-1]),stack=[[0,ring.length-1]];
 while(stack.length){const[a,b]=stack.pop();let max=0.025**2,at=-1;for(let i=a+1;i<b;i++){const d=dist2(ring[i],ring[a],ring[b]);if(d>max){max=d;at=i;}}if(at>=0){retained.add(at);stack.push([a,at],[at,b]);}}
 if(retained.size<4){retained.add(Math.floor((ring.length-1)/3));retained.add(Math.floor((ring.length-1)*2/3));}
 for(const i of retained)keep.add(pointKey(ring[i]));
 for(let i=1;i<ring.length;i++){
  const a=pointKey(ring[i-1]),b=pointKey(ring[i]);if(a===b)continue;
  const key=a<b?`${a}|${b}`:`${b}|${a}`,other=edgeOwner.get(key);
  if(other!==undefined&&other!==id){neighbors[id].add(other);neighbors[other].add(id);}else if(other===undefined)edgeOwner.set(key,id);
 }
}
function area(ring){let a=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++)a+=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];return Math.abs(a/2);}
function inside(ring,x,y){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
function inPoly(poly,p){return inside(poly[0],...p)&&!poly.slice(1).some(r=>inside(r,...p));}
function anchor(poly,hint){
 if(hint.every(Number.isFinite)&&inPoly(poly,hint))return hint;
 const ys=poly[0].map(p=>p[1]),min=Math.min(...ys),max=Math.max(...ys);let best=null,width=-1;
 // Interior scanline anchor, not a centroid that may lie in the ocean or a hole.
 for(let j=1;j<40;j++){const y=min+(max-min)*j/40,crossings=[];
  for(const r of poly)for(let i=0,k=r.length-1;i<r.length;k=i++){const a=r[i],b=r[k];if((a[1]>y)!==(b[1]>y))crossings.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]));}
  crossings.sort((a,b)=>a-b);for(let i=1;i<crossings.length;i++){const x=(crossings[i-1]+crossings[i])/2,w=crossings[i]-crossings[i-1];if(w>width&&inPoly(poly,[x,y])){width=w;best=[x,y];}}
 }if(!best)throw new Error('Could not find an interior province anchor');return best;
}
let points=0;
const provinces=features.map((f,id)=>{
 const p=f.properties;
 const geometry=polys[id].map(poly=>poly.map(r=>r.filter(v=>keep.has(pointKey(v))).map(v=>[+v[0].toFixed(6),+v[1].toFixed(6)]))).filter(poly=>poly[0].length>=4);
 // Source is already cut at the antimeridian. Never join disjoint parts with a fan.
 for(const poly of geometry)for(const ring of poly)for(let i=1;i<ring.length;i++)if(p.adm0_a3!=="ATA"&&Math.abs(ring[i][0]-ring[i-1][0])>180.00001)throw new Error(`Unsplit date-line edge: ${p.adm1_code}`);
 geometry.sort((a,b)=>area(b[0])-area(a[0]));points+=geometry.flat(1).reduce((n,r)=>n+r.length,0);
 const center=anchor(geometry[0],[p.longitude,p.latitude]);
 return {code:p.adm1_code,name:[p.name_zh||p.name,p.name_en||p.name],country:p.adm0_a3,countryName:p.admin,level:p.gn_level??null,center,neighbors:[...neighbors[id]].sort((a,b)=>a-b),geometry};
});
const result={format,source,sourceRevision:revision,sourceSha256:sha256,license:'Public domain',projection:'EPSG:3857',latitudeLimit:85.0511287798066,provinces};
await writeFile(output,JSON.stringify(result));console.log(`World atlas: ${provinces.length} administrative features; ${points} vertices; ${fileURLToPath(output)}`);
