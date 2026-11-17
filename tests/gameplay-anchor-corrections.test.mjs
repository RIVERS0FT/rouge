import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAP,SOURCE_MAP,BOUNDS,provinceAt,provinceByCode} from '../src/game/map.ts';
import {project,unproject} from '../src/game/geo.ts';
import {containsPart} from '../src/game/sourceMap.ts';
import {signedArea} from '../src/game/crop.ts';
import atlas from '../src/generated/world.js';

const corrections=JSON.parse(readFileSync(new URL('../data/gameplay-anchor-corrections.json',import.meta.url),'utf8'));
const source=new Map(SOURCE_MAP.map(atom=>[atom.code,atom]));
const regionOf=code=>MAP[provinceByCode(code)];
/** Distance from a point to the nearest land of another region, by ray marching (bisected). */
function borderDistance(id,c){
 let best=Infinity;
 for(let k=0;k<72;k++){
  const a=k*Math.PI/36,ux=Math.cos(a),uz=Math.sin(a);let inside=0;
  for(let d=.05;d<=12;d+=.05){
   if(provinceAt(c.x+ux*d,c.z+uz*d)===id){inside=d;continue;}
   let lo=inside,hi=d;for(let i=0;i<12;i++){const mid=(lo+hi)/2;if(provinceAt(c.x+ux*mid,c.z+uz*mid)===id)lo=mid;else hi=mid;}
   if(provinceAt(c.x+ux*hi,c.z+uz*hi)>=0)best=Math.min(best,hi);
   break;
  }
 }
 return best;
}
const area=region=>region.parts.reduce((sum,part)=>sum+Math.abs(signedArea(part[0]))-part.slice(1).reduce((n,hole)=>n+Math.abs(signedArea(hole)),0),0);

test('edge anchors move to the reviewed member or capital and keep the region name',()=>{
 for(const row of corrections.anchors){
  const group=atlas.gameplayGroups.find(g=>g.id===row.group),region=regionOf(row.to);
  assert.equal(group.anchorAtomId??null,row.from,`${row.group} still replaces its reviewed anchor`);
  assert.deepEqual(region.center,source.get(row.to).center,row.group);
  assert.deepEqual(region.name,group.displayName??row.displayName,row.group);
 }
 for(const row of corrections.centers){
  assert.deepEqual(source.get(row.atom).center,project(row.lonLat[0],row.lonLat[1]),row.atom);
 }
 // Constantine's town is the city itself, not Biskra on the Sahara border.
 const constantine=unproject(regionOf('DZA-2163').center.x,regionOf('DZA-2163').center.z);
 assert.ok(Math.abs(constantine.lon-6.61)<.1&&Math.abs(constantine.lat-36.37)<.1,JSON.stringify(constantine));
});

test('no town stands on a region edge, except in regions too small to hold one',()=>{
 const edges=[];
 for(const region of MAP){
  if(!region.playable)continue;
  const radius=Math.sqrt(area(region)/Math.PI);if(radius<1.5)continue;
  const distance=borderDistance(region.id,region.center);
  if(Number.isFinite(distance)&&(distance<1.6||distance<.1*radius))edges.push(`${region.code} ${region.name[1]} ${distance.toFixed(2)}`);
 }
 assert.deepEqual(edges,[]);
});

test('every atom center stays on the landmass holding its label point, not a first-listed islet or exclave',()=>{
 const centers=new Map(corrections.centers.map(row=>[row.atom,row.lonLat]));
 for(const province of atlas.provinces){
  const atom=source.get(province.id);if(!atom.playable)continue;
  const label=centers.get(province.id)??province.center,point=project(label[0],label[1]);
  // Label points beyond the map crop (far north) legitimately move into the visible part.
  const visible=point.x>=BOUNDS.left&&point.x<=BOUNDS.right&&point.z>=BOUNDS.top&&point.z<=BOUNDS.bottom;
  if(visible&&atom.parts.some(part=>containsPart(part,point.x,point.z)))assert.deepEqual(atom.center,point,province.id);
 }
 // Western Australia's town is on the mainland, not on a Kimberley islet.
 const western=unproject(regionOf('AUS-2651').center.x,regionOf('AUS-2651').center.z);
 assert.ok(western.lat<-20&&western.lon<125,JSON.stringify(western));
});
