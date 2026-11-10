import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCountryComponents,primaryCountryComponents,regionAreas,overlaps,LabelCollisionIndex,labelIntersectsViewport} from '../src/render/countryLabels.ts';
import {MAP,pointInProvince} from '../src/game/map.ts';
import {WORLD_WIDTH} from '../src/game/geo.ts';
const cell=(id,x,neighbors,visible=true)=>({id,center:{x,z:0},neighbors,visible,parts:[[[{x:x-5,z:-5},{x:x+5,z:-5},{x:x+5,z:5},{x:x-5,z:5}]]]});
test('current human/AI ownership groups connected land, excludes neutral and extinct countries',()=>{
 const map=[cell(0,0,[1]),cell(1,10,[0,2]),cell(2,20,[1,3]),cell(3,30,[2]),cell(4,80,[]),cell(5,90,[],false)];
 assert.deepEqual(buildCountryComponents(map,[-1,-1,-1,-1,-1,-1]),[]);
 const parts=buildCountryComponents(map,[0,0,1,-1,0,2]);
 assert.equal(parts.length,3);assert.equal(parts[0].owner,0);assert.equal(parts[0].area,200);assert.deepEqual(new Set(parts[0].anchors),new Set([0,1]));
 assert.equal(parts.filter(p=>p.owner===0).length,2);assert.ok(parts.every(p=>p.owner>=0&&p.owner!==2));
 const captured=buildCountryComponents(map,[1,1,1,-1,-1,2]);assert.equal(captured.length,1);assert.equal(captured[0].owner,1);assert.equal(captured[0].anchors.length,3);
});
test('country anchors stay on their controlled land, including wrapped islands',()=>{
 const owners=MAP.map(p=>p.visible?p.id%9:-1),parts=buildCountryComponents(MAP,owners);
 for(const part of parts)for(const id of part.anchors){assert.equal(owners[id],part.owner);assert.ok(pointInProvince(id,MAP[id].center.x,MAP[id].center.z),MAP[id].code);}
 const wrapped=[cell(0,WORLD_WIDTH/2-4,[1]),cell(1,-WORLD_WIDTH/2+4,[0])];assert.equal(buildCountryComponents(wrapped,[7,7]).length,1);
});
test('area and screen collision account for holes, HUD padding and dense unit buckets',()=>{
 const shape=cell(0,0,[]);shape.parts[0].push([{x:-1,z:-1},{x:1,z:-1},{x:1,z:1},{x:-1,z:1}]);assert.equal(regionAreas([shape])[0],96);
 const index=new LabelCollisionIndex(),rect={left:64,right:84,top:64,bottom:84};index.add(rect);
 for(const other of [{left:60,right:63,top:60,bottom:63},{left:75,right:99,top:75,bottom:99},{left:1,right:2,top:1,bottom:2}])assert.equal(index.collides(other),overlaps(other,rect,8));
});

test('country titles select one immutable largest-territory anchor, never a viewport fallback',()=>{
 const map=[cell(0,0,[1]),cell(1,10,[0]),cell(2,80,[]),cell(3,100,[])];
 const components=buildCountryComponents(map,[0,0,0,1]),primary=primaryCountryComponents(components);
 assert.equal(primary.length,2);assert.equal(primary[0].owner,0);assert.equal(primary[0].area,200);
 assert.deepEqual(primary.map(c=>c.anchors),[[components[0].anchors[0]],[3]]);
 assert.deepEqual(primaryCountryComponents([...components].reverse()),primary);
 assert.equal(components[0].anchors.length,2,'choosing one label does not mutate territory geometry');
 const renderer=fs.readFileSync(new URL('../src/render/WorldRenderer.ts',import.meta.url),'utf8');
 assert.match(renderer,/this\.drawLabels\(time\);[\s\S]*?this\.drawMapNames\(\);this\.renderer\.render/);
 assert.doesNotMatch(renderer.slice(renderer.indexOf('private drawLabels('),renderer.indexOf('private drawMapNames(')),/this\.drawMapNames/);
});

test('only the complete text bounds leaving the screen hides a map name',()=>{
 for(const rect of [{left:-30,right:1,top:20,bottom:40},{left:99,right:130,top:20,bottom:40},{left:20,right:40,top:-20,bottom:1},{left:20,right:40,top:99,bottom:130}])assert.ok(labelIntersectsViewport(rect,100,100));
 for(const rect of [{left:-30,right:-1,top:20,bottom:40},{left:101,right:130,top:20,bottom:40},{left:20,right:40,top:-20,bottom:-1},{left:20,right:40,top:101,bottom:130}])assert.equal(labelIntersectsViewport(rect,100,100),false);
 const renderer=fs.readFileSync(new URL('../src/render/WorldRenderer.ts',import.meta.url),'utf8'),names=renderer.slice(renderer.indexOf('private drawMapNames('),renderer.indexOf('private frame='));
 assert.doesNotMatch(names,/querySelectorAll|blockers|occupied|COUNTRY_LABEL_LIMIT|distance>=180|area\)\*scale<18/);
 assert.match(names,/for\(const province of MAP\)/);assert.match(names,/for\(const component of this.countryComponents\)/);
});
test('capture, loss, split and elimination update each owner anchor from actual territory',()=>{
 const map=[cell(0,0,[1]),cell(1,10,[0,2]),cell(2,20,[1])];
 const anchor=owners=>primaryCountryComponents(buildCountryComponents(map,owners)).find(c=>c.owner===0)?.anchors[0];
 assert.equal(anchor([0,0,-1]),0);assert.equal(anchor([0,0,0]),1,'new land moves the weighted interior anchor');
 assert.equal(anchor([0,-1,0]),0,'split chooses the largest stable component tie');
 assert.equal(anchor([-1,-1,0]),2,'lost original territory moves to remaining land');
 assert.equal(anchor([-1,-1,-1]),undefined);
 const many=Array.from({length:80},(_,id)=>cell(id,id*20,[]));assert.equal(primaryCountryComponents(buildCountryComponents(many,many.map(p=>p.id))).length,80,'no country count culling');
});
