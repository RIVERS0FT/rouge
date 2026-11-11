import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCountryLabels,regionMoments,countryTypography,overlaps,LabelCollisionIndex,labelIntersectsViewport,provinceNamesVisible} from '../src/render/countryLabels.ts';
import {MAP} from '../src/game/map.ts';
import {WORLD_WIDTH,project,nearestWorldX,wrapX} from '../src/game/geo.ts';
const rectangle=(left,top,right,bottom)=>[{x:left,z:top},{x:right,z:top},{x:right,z:bottom},{x:left,z:bottom}];
const cell=(id,x,z=0,width=10,height=10)=>({id,center:{x:999,z:999},neighbors:[],visible:true,parts:[[rectangle(x-width/2,z-height/2,x+width/2,z+height/2)]]});
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
const ownerLabel=(map,owners,owner=0)=>buildCountryLabels(map,owners).find(label=>label.owner===owner);

test('all disconnected territory contributes by polygon area, not region count or navigation centers',()=>{
 const map=[cell(0,0,0,20,20),cell(1,100,50,10,10),cell(2,-100,0),cell(3,0,500)];
 map[0].neighbors=[1];map[1].neighbors=[0]; // Connectivity does not choose a primary landmass.
 const label=ownerLabel(map,[0,0,-1,1]);close(label.area,500);close(label.anchor.x,20);close(label.anchor.z,10);
 assert.deepEqual(buildCountryLabels(map,[-1,-1,-1,-1]),[]);
 assert.equal(buildCountryLabels(map,[0,0,-1,1]).length,2);
 const split=[cell(0,-5,0,10,20),cell(1,5,0,10,20),cell(2,100,50)];
 assert.deepEqual(ownerLabel(split,[0,0,0]),label,'partitioning the same territory cannot change its center');
});

test('polygon shoelace moments handle concavity, holes and multipolygons independent of winding',()=>{
 const triangle=cell(0,0);triangle.parts=[[[{x:0,z:0},{x:12,z:0},{x:0,z:6}]]];
 const tri=ownerLabel([triangle],[0]);close(tri.area,36);close(tri.anchor.x,4);close(tri.anchor.z,2);
 const shape=cell(0,0,0,20,20);shape.parts[0].push(rectangle(2,-2,6,2));shape.parts.push([rectangle(38,-2,42,2)]);
 const label=ownerLabel([shape],[0]);close(label.area,400);close(label.anchor.x,1.44);close(label.anchor.z,0);
 const reversed={...shape,parts:shape.parts.map(part=>part.map(ring=>[...ring].reverse()))};
 assert.deepEqual(ownerLabel([reversed],[0]),label);
 const concave=cell(0,0);concave.parts=[[[{x:0,z:0},{x:4,z:0},{x:4,z:1},{x:1,z:1},{x:1,z:4},{x:0,z:4}]]];
 const l=ownerLabel([concave],[0]);close(l.area,7);close(l.anchor.x,9.5/7);close(l.anchor.z,9.5/7);
});

test('centroid may lie in the ocean or a hole and is never clamped to land or the crop',()=>{
 const islands=[cell(0,-50),cell(1,50)];assert.deepEqual(ownerLabel(islands,[0,0]).anchor,{x:0,z:0});
 const lake=cell(0,0,0,20,20);lake.parts[0].push(rectangle(-5,-5,5,5));
 assert.deepEqual(ownerLabel([lake],[0]).anchor,{x:0,z:0});
 const cropped=cell(0,0,-2000);cropped.visible=false;close(ownerLabel([cropped],[0]).anchor.z,-2000);
});

test('date-line islands and seam-crossing rings share one deterministic longitude sheet',()=>{
 const half=WORLD_WIDTH/2,islands=[cell(0,half-10,0,10,10),cell(1,-half+20,20,20,10)];
 const label=ownerLabel(islands,[0,0]);close(label.area,300);close(label.anchor.x,-half+10);close(label.anchor.z,40/3);
 assert.deepEqual(buildCountryLabels([...islands].reverse(),[0,0],regionMoments(islands)),[label]);
 const seam=cell(0,0);seam.parts=[[rectangle(half-10,-10,-half+10,10),rectangle(half-2,-2,-half+2,2)]];
 const crossing=ownerLabel([seam],[0]);close(crossing.area,384);close(crossing.anchor.x,-half);close(crossing.anchor.z,0);
 const shifted={...seam,parts:seam.parts.map(part=>part.map(ring=>ring.map(p=>({...p,x:p.x+WORLD_WIDTH*3}))))};
 assert.deepEqual(ownerLabel([shifted],[0]),crossing);
 const ring=seam.parts[0][0];seam.parts[0][0]=[...ring.slice(2),...ring.slice(0,2)];assert.deepEqual(ownerLabel([seam],[0]),crossing);
});

test('Miller projection moments are calculated in map coordinates rather than degree averages',()=>{
 const shape=cell(0,0);shape.parts=[[[project(10,0),project(30,0),project(30,60),project(10,60)]]];
 const label=ownerLabel([shape],[0]);close(label.anchor.x,200);close(label.anchor.z,(project(0,60).z+project(0,0).z)/2);
 assert.ok(Math.abs(label.anchor.z-project(0,30).z)>20);
});

test('capture, loss, split, elimination and cached geometry update whole-country anchors',()=>{
 const map=[cell(0,0),cell(1,10),cell(2,20)],geometry=regionMoments(map);
 const anchor=owners=>buildCountryLabels(map,owners,geometry).find(c=>c.owner===0)?.anchor.x;
 close(anchor([0,0,-1]),5);close(anchor([0,0,0]),10);close(anchor([0,-1,0]),10);
 close(anchor([-1,-1,0]),20);assert.equal(anchor([-1,-1,-1]),undefined);
 const captured=buildCountryLabels(map,[1,1,0],geometry);close(captured.find(c=>c.owner===1).anchor.x,5);
 const many=Array.from({length:80},(_,id)=>cell(id,id*20));assert.equal(buildCountryLabels(many,many.map(p=>p.id)).length,80);
 const renderer=fs.readFileSync(new URL('../src/render/WorldRenderer.ts',import.meta.url),'utf8');
 assert.match(renderer,/if\(ownershipChanged\|\|state\.campaign!==this\.countryCampaign\)/);
 assert.equal((renderer.match(/buildCountryLabels\(MAP/g)??[]).length,1,'only ownership/campaign updates rebuild country anchors');
 const names=renderer.slice(renderer.indexOf('private drawMapNames('),renderer.indexOf('private frame='));
 assert.doesNotMatch(names,/buildCountryLabels|regionMoments|countryAnchorRevision|country\?24/);
});

test('real atlas moments remain finite and bounded for every current faction',()=>{
 const owners=MAP.map(p=>p.visible?p.id%9:-1),geometry=regionMoments(MAP),labels=buildCountryLabels(MAP,owners,geometry);
 assert.equal(labels.length,9);
 for(const label of labels){assert.ok(label.area>0);assert.ok(Number.isFinite(label.anchor.z));assert.equal(wrapX(label.anchor.x),label.anchor.x);}
 const independentArea=geometry.reduce((sum,parts,id)=>sum+(owners[id]>=0?parts.reduce((n,p)=>n+p.area,0):0),0);
 assert.ok(Math.abs(labels.reduce((sum,l)=>sum+l.area,0)-independentArea)<1e-6);
});

test('country typography has readable bounds and keeps long names compact without hiding them',()=>{
 const short=countryTypography('大明',10000,2),long=countryTypography('阿尔汉格尔斯克共和国',10000,2);
 assert.ok(short.font>long.font);assert.ok(short.spacing>long.spacing);
 for(const area of [0,1,1000,1e10])for(const scale of [.001,.1,1,100])for(const name of ['A','France','中华人民共和国','Very long country name that remains complete']){
  const style=countryTypography(name,area,scale);assert.ok(style.font>=13&&style.font<=24);assert.ok(style.spacing>0);
 }
 const css=fs.readFileSync(new URL('../src/ui/style.css',import.meta.url),'utf8');
 assert.match(css,/\.country-label\{font-weight:500;color:#24352e/);assert.match(css,/paint-order:stroke fill/);
});

test('screen collision accounts for HUD padding and dense unit buckets',()=>{
 const index=new LabelCollisionIndex(),rect={left:64,right:84,top:64,bottom:84};index.add(rect);
 for(const other of [{left:60,right:63,top:60,bottom:63},{left:75,right:99,top:75,bottom:99},{left:1,right:2,top:1,bottom:2}])assert.equal(index.collides(other),overlaps(other,rect,8));
});

test('only the complete text bounds leaving the screen hides a map name',()=>{
 for(const rect of [{left:-30,right:1,top:20,bottom:40},{left:99,right:130,top:20,bottom:40},{left:20,right:40,top:-20,bottom:1},{left:20,right:40,top:99,bottom:130}])assert.ok(labelIntersectsViewport(rect,100,100));
 for(const rect of [{left:-30,right:-1,top:20,bottom:40},{left:101,right:130,top:20,bottom:40},{left:20,right:40,top:-20,bottom:-1},{left:20,right:40,top:101,bottom:130}])assert.equal(labelIntersectsViewport(rect,100,100),false);
 const renderer=fs.readFileSync(new URL('../src/render/WorldRenderer.ts',import.meta.url),'utf8'),names=renderer.slice(renderer.indexOf('private drawMapNames('),renderer.indexOf('private frame='));
 assert.doesNotMatch(names,/querySelectorAll|blockers|occupied|COUNTRY_LABEL_LIMIT|distance>=180|area\)\*scale<18/);
 assert.match(names,/for\(const province of MAP\)/);assert.match(names,/for\(const component of this.countryComponents\)/);
 assert.match(renderer,/this\.drawLabels\(time\);[\s\S]*?this\.drawMapNames\(\);this\.renderer\.render/);
 assert.doesNotMatch(renderer.slice(renderer.indexOf('private drawLabels('),renderer.indexOf('private drawMapNames(')),/this\.drawMapNames/);
});

test('province names retain the original below-500 zoom range independently of country names',()=>{
 assert.equal(provinceNamesVisible(100),true);assert.equal(provinceNamesVisible(499.999),true);
 assert.equal(provinceNamesVisible(500),false);assert.equal(provinceNamesVisible(800),false);
 const renderer=fs.readFileSync(new URL('../src/render/WorldRenderer.ts',import.meta.url),'utf8');
 assert.match(renderer,/if\(provinceNamesVisible\(this\.distance\)\)\{[\s\S]*?this\.provinceLabels[\s\S]*?\}else for\(const label of this\.provinceLabels\.values\(\)\)label\.hidden=true;\s*for\(const component of this\.countryComponents\)/);
});
