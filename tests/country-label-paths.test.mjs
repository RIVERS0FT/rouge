import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCountryLabels} from '../src/render/countryLabels.ts';
import {buildBorderEdges} from '../src/render/territoryBorders.ts';
import {buildCountryPlacements,fitCountryCurve,projectCountryFont,countryCurveSegment,uprightCountryArc} from '../src/render/countryLabelPaths.ts';
import {WORLD_BOUNDS,wrapX} from '../src/game/geo.ts';
const bounds={left:-500,right:500,top:-500,bottom:500};
const rect=(x,z,w,h)=>[{x,z},{x:x+w,z},{x:x+w,z:z+h},{x,z:z+h}];
const region=(id,parts)=>({id,code:`test-${id}`,visible:true,parts});
function contains(ring,p){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<a.x+(b.x-a.x)*(p.z-a.z)/(b.z-a.z))inside=!inside;}return inside;}
const inside=(map,p)=>map.some(r=>r.parts.some(part=>contains(part[0],p)&&!part.slice(1).some(hole=>contains(hole,p))));
function placement(map,owners=map.map(()=>0),cache=new Map()){return buildCountryPlacements(map,owners,buildCountryLabels(map,owners),buildBorderEdges(map,bounds),cache,bounds);}

test('country arcs remain upright for both diagonals, vertical text and horizontal reversals',()=>{
 const cases=[
  [{x:100,y:100},{x:50,y:40},{x:0,y:0}],
  [{x:100,y:0},{x:40,y:60},{x:0,y:100}],
  [{x:0,y:0},{x:50,y:40},{x:100,y:100}],
  [{x:0,y:0},{x:0,y:50},{x:0,y:100}],
  [{x:0,y:100},{x:0,y:50},{x:0,y:0}],
  [{x:0,y:0},{x:-20,y:60},{x:10,y:100}],
  [{x:0,y:0},{x:30,y:60},{x:10,y:100}],
  [{x:0,y:0},{x:20,y:50},{x:0,y:100}],
 ];
 for(const points of cases){
  const before=structuredClone(points),arc=uprightCountryArc(...points);
  assert.ok(arc.length>0);assert.deepEqual(points,before,'cached geometry is never mutated');
  for(let i=0;i<=100;i++){
   const t=i/100,dx=(1-t)*(arc.control.x-arc.start.x)+t*(arc.end.x-arc.control.x),dy=(1-t)*(arc.control.y-arc.start.y)+t*(arc.end.y-arc.control.y);
   const angle=Math.atan2(dy,dx)*180/Math.PI;assert.ok(angle>=-90-1e-9&&angle<=90+1e-9,`upright tangent: ${angle}`);
  }
  if(points[1].x>=Math.min(points[0].x,points[2].x)&&points[1].x<=Math.max(points[0].x,points[2].x)){
   assert.deepEqual(arc.control,points[1]);
   const order=(a,b)=>a.x-b.x||a.y-b.y;
   assert.deepEqual([arc.start,arc.end].sort(order),[points[0],points[2]].sort(order),'reorienting preserves the entire original curve');
  }
 }
});

test('curved country corridors bend with the territory and protect whole glyphs, not just their baseline',()=>{
 const upper=Array.from({length:25},(_,i)=>{const x=i*5-60;return {x,z:.008*x*x-11};}),lower=upper.map(p=>({...p,z:p.z+22})).reverse(),map=[region(0,[[[...upper,...lower]]])];
 const p=placement(map).get(0),fit=fitCountryCurve(p,9);assert.ok(fit);assert.ok(fit.fontWorld>0);
 const curve=fit.curve,a=curve.points[0],b=curve.points.at(-1),mid=curve.points[Math.floor(curve.points.length/2)];
 assert.ok(Math.abs(mid.z-(a.z+b.z)/2)>2,'a real bend, not a rotated straight title');
 const turns=curve.points.slice(1,-1).map((p,i)=>{const a=curve.points[i],b=curve.points[i+2];return Math.sign((p.x-a.x)*(b.z-p.z)-(p.z-a.z)*(b.x-p.x));});assert.equal(new Set(turns.filter(Boolean)).size,1,'the curve has no second turn or inflection');
 for(const center of curve.points)for(let k=0;k<16;k++){const angle=k*Math.PI/8,radius=fit.fontWorld*1.2;assert.ok(inside(map,{x:center.x+Math.cos(angle)*radius,z:center.z+Math.sin(angle)*radius}));}
 const shorter=countryCurveSegment(curve,curve.length/2);assert.ok(Math.hypot(shorter.points[0].x-shorter.points.at(-1).x,shorter.points[0].z-shorter.points.at(-1).z)<Math.hypot(a.x-b.x,a.z-b.z));
});

test('country text scales below 10 pixels and past 40 pixels without changing its world anchor or path',()=>{
 const fit=fitCountryCurve(placement([region(0,[[rect(-80,-40,160,80)]])]).get(0),5);
 assert.ok(fit);
 const anchor={...fit.curve.anchor},near=projectCountryFont(fit.fontWorld,2),closer=projectCountryFont(fit.fontWorld,4);
 assert.ok(near&&closer&&closer.screen>40);
 assert.equal(closer.screen,near.screen*2);
 assert.equal(near.world,closer.world);
 assert.deepEqual(countryCurveSegment(fit.curve,near.world*5/.86),countryCurveSegment(fit.curve,closer.world*5/.86));
 assert.deepEqual(fit.curve.anchor,anchor);
 const far=projectCountryFont(fit.fontWorld,.001);
 assert.ok(far&&far.screen>0&&far.screen<10);
 assert.equal(far.world,near.world);
 assert.deepEqual(countryCurveSegment(fit.curve,far.world*5/.86),countryCurveSegment(fit.curve,near.world*5/.86));
});

test('lakes, concave bays and separate islands cannot be used as text space',()=>{
 const map=[region(0,[[rect(-50,-50,100,100),rect(-18,-18,36,36)],[rect(200,0,12,12)]])],p=placement(map).get(0);
 assert.ok(p.curves.length);for(const curve of p.curves){assert.ok(curve.anchor.x<100);for(const point of curve.points)assert.ok(inside(map,point));}
 const short=fitCountryCurve(p,4),long=fitCountryCurve(p,40);assert.ok(long.fontWorld<short.fontWorld);
});

test('administrative seams do not reduce available land and ownership changes invalidate only affected cached layouts',()=>{
 const map=[region(0,[[rect(0,0,50,50)]]),region(1,[[rect(50,0,50,50)]]),region(2,[[rect(200,0,50,50)]])],cache=new Map(),first=placement(map,[0,0,1],cache),same=placement(map,[0,0,1],cache);
 assert.equal(first.get(0),same.get(0));assert.equal(first.get(1),same.get(1));
 assert.ok(first.get(0).curves.some(c=>c.points.some(p=>p.x<50)&&c.points.some(p=>p.x>50)));
 const changed=placement(map,[0,-1,1],cache);assert.notEqual(changed.get(0),first.get(0));assert.equal(changed.get(1),first.get(1));
 for(const curve of changed.get(0).curves)for(const point of curve.points)assert.ok(point.x<50);
 assert.equal(placement(map,[-1,-1,-1],cache).size,0);assert.equal(cache.size,0);
});

test('date-line countries keep the single arc inside one continuous unwrapped landmass',()=>{
 const map=[region(0,[[rect(1770,0,30,40)]]),region(1,[[rect(-1800,0,30,40)]])],owners=[0,0],before=JSON.stringify(map);
 const p=buildCountryPlacements(map,owners,buildCountryLabels(map,owners),buildBorderEdges(map,WORLD_BOUNDS)).get(0);
 assert.ok(p.curves.length);for(const curve of p.curves)for(const point of curve.points)assert.ok(inside(map,{x:wrapX(point.x),z:point.z}));
 assert.equal(JSON.stringify(map),before);
});
