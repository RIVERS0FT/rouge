import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCountryComponents,regionAreas,overlaps,LabelCollisionIndex,COUNTRY_LABEL_LIMIT} from '../src/render/countryLabels.ts';
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
 assert.equal(COUNTRY_LABEL_LIMIT,32);
});
test('area and screen collision account for holes, HUD padding and dense unit buckets',()=>{
 const shape=cell(0,0,[]);shape.parts[0].push([{x:-1,z:-1},{x:1,z:-1},{x:1,z:1},{x:-1,z:1}]);assert.equal(regionAreas([shape])[0],96);
 const index=new LabelCollisionIndex(),rect={left:64,right:84,top:64,bottom:84};index.add(rect);
 for(const other of [{left:60,right:63,top:60,bottom:63},{left:75,right:99,top:75,bottom:99},{left:1,right:2,top:1,bottom:2}])assert.equal(index.collides(other),overlaps(other,rect,8));
});

test('stationary HUD changes invalidate the political label layout',()=>{
 const app=fs.readFileSync(new URL('../src/ui/App.tsx',import.meta.url),'utf8');
 assert.match(app,/useLayoutEffect\(\(\)=>\{world\.current\?\.refreshLabelLayout\(\);.*\[mobilePanel,paused,inputDevice,mapQuery,spectating,toast,selected,language,visibleDispatches\]/);
 assert.match(app,/visibleDispatches=JSON\.stringify\(game\?\.events\.slice\(-4\)\?\?\[\]\)/);
 const renderer=fs.readFileSync(new URL('../src/render/WorldRenderer.ts',import.meta.url),'utf8');
 const body=renderer.match(/refreshLabelLayout\(\)\{([\s\S]*?)\n  \}/)?.[1];assert.ok(body);
 const view={countryLabels:[{hidden:false},{hidden:true},{hidden:false}],lastLabels:100,invalidated:false};
 new Function(body).call(view);
 assert.ok(view.countryLabels.every(label=>label.hidden),'stale positions disappear synchronously before the next map frame');
 assert.equal(view.lastLabels,0);assert.equal(view.invalidated,true);
 assert.match(renderer,/\.map-search-results/);assert.match(renderer,/\.toast/);
});
