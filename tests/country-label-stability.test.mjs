import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {buildCountryLabels} from '../src/render/countryLabels.ts';
import {buildBorderEdges} from '../src/render/territoryBorders.ts';
import {buildCountryPlacements,fitCountryCurve} from '../src/render/countryLabelPaths.ts';
import {acceptCountryLayouts} from '../src/render/countryLayoutState.ts';
const bounds={left:-500,right:500,top:-500,bottom:500};
const rect=(x,z,w,h)=>[{x,z},{x:x+w,z},{x:x+w,z:z+h},{x,z:z+h}];
const region=(id,x,z,w,h)=>({id,visible:true,parts:[[rect(x,z,w,h)]]});
const layout=(map,owners,cache)=>buildCountryPlacements(map,owners,buildCountryLabels(map,owners),buildBorderEdges(map,bounds),cache,bounds);

test('a 2% gain cannot rotate a stable title by 90 degrees or change its font',()=>{
 const map=[region(0,0,0,100,101),region(1,100,0,2,101)],cache=new Map();
 const before=layout(map,[0,-1],cache).get(0),fit=fitCountryCurve(before,8),shape=JSON.stringify(before.curves);
 const gained=layout(map,[0,0],cache).get(0);
 assert.equal(gained,before);assert.equal(JSON.stringify(gained.curves),shape);assert.deepEqual(fitCountryCurve(gained,8),fit);
 const lostStrip=layout(map,[0,-1],cache).get(0);
 assert.equal(lostStrip,before,'Losing an addition outside the original corridor does not move the title');
 assert.equal(cache.get(0).members,'0');
});

test('loss of a detached possession keeps the existing legal title and texture identity',()=>{
 const map=[region(0,0,0,100,100),region(1,220,0,10,10)],cache=new Map();
 const before=layout(map,[0,0],cache).get(0),after=layout(map,[0,-1],cache).get(0);
 assert.equal(after,before);assert.equal(cache.get(0).members,'0');
});

test('a distant loss preserves the clearance corridor without rescanning world borders',()=>{
 const map=[region(0,0,0,100,100),region(1,220,0,10,10)],cache=new Map(),owners=[0,0],edges=buildBorderEdges(map,bounds);
 const before=buildCountryPlacements(map,owners,buildCountryLabels(map,owners),edges,cache,bounds).get(0);
 owners[1]=-1;
 const unrelatedBorders={[Symbol.iterator](){throw Error('A distant loss should not scan world borders');}};
 const after=buildCountryPlacements(map,owners,buildCountryLabels(map,owners),unrelatedBorders,cache,bounds).get(0);
 assert.equal(after,before);assert.equal(cache.get(0).members,'0');assert.deepEqual(fitCountryCurve(after,8),fitCountryCurve(before,8));
});

test('renderer replaces an invalid title synchronously, retains a third owner, and removes eliminated owners',()=>{
 const map=[region(0,0,0,100,101),region(1,220,0,40,40),region(2,-220,0,50,50)],cache=new Map();
 const before=layout(map,[0,0,2],cache),old=before.get(0),unchanged=before.get(2);
 const source=readFileSync(new URL('../src/render/WorldRenderer.ts',import.meta.url),'utf8');
 const method=source.slice(source.indexOf('  private requestCountryLayout('),source.indexOf('  private flushCountryLayout(')).replace('private requestCountryLayout','function requestCountryLayout').replaceAll('import.meta.url',JSON.stringify(import.meta.url));
 const request=new Function('MAP','BOUNDS','buildCountryPlacements',ts.transpile(method,{target:ts.ScriptTarget.ES2022})+';return requestCountryLayout;')(map,bounds,buildCountryPlacements);
 const world={ownerIds:[-1,0,2],countryComponents:buildCountryLabels(map,[-1,0,2]),countryCampaign:'current',countryPlacementCache:cache,countryPlacements:before,countryCurves:new Map(),boundaryEdges:buildBorderEdges(map,bounds),countryLayoutWorker:{},flushCountryLayout(){}};
 request.call(world);
 const next=world.countryPlacements.get(0);assert.ok(next);assert.notEqual(next,old);assert.ok(next.curves.length);
 for(const curve of next.curves)for(const p of curve.points)assert.ok(p.x>=220&&p.x<=260&&p.z>=0&&p.z<=40,'No transition through now-unowned land');
 assert.equal(world.countryPlacements.get(2),unchanged);assert.equal(world.countryPlacementCache.get(0).members,'1');
 world.ownerIds=[-1,-1,2];world.countryComponents=buildCountryLabels(map,world.ownerIds);request.call(world);
 assert.equal(world.countryPlacements.has(0),false);assert.equal(world.countryPlacementCache.has(0),false);
 assert.equal(world.countryPlacements.get(2),unchanged);
});

test('stale worker replies cannot undo ownership, revive eliminated labels or churn unchanged objects',()=>{
 const old={owner:0,area:1,curves:[]},fresh={owner:0,area:2,curves:[]},members=new Map([[0,'1,2'],[2,'4']]),cache=new Map([[0,{members:'1,2',placement:fresh}]]),placements=new Map([[0,fresh]]);
 acceptCountryLayouts('new',members,cache,placements,{campaign:'old',entries:[[0,{members:'1,2',placement:old}]]});assert.equal(placements.get(0),fresh);
 acceptCountryLayouts('new',members,cache,placements,{campaign:'new',entries:[[0,{members:'1',placement:old}],[1,{members:'3',placement:old}]]});assert.equal(placements.get(0),fresh);assert.equal(placements.has(1),false);
 acceptCountryLayouts('new',members,cache,placements,structuredClone({campaign:'new',entries:[[0,{members:'1,2',placement:fresh}]]}));assert.equal(placements.get(0),fresh,'Structured clone must not replace unchanged identity');
 const newcomer={owner:2,area:1,curves:[]};acceptCountryLayouts('new',members,cache,placements,{campaign:'new',entries:[[2,{members:'4',placement:newcomer}]]});assert.equal(placements.get(2),newcomer);
});

test('same-key distance texture eviction restores a visible in-layer canvas fallback',()=>{
 const source=readFileSync(new URL('../src/render/countryLabelText.ts',import.meta.url),'utf8');
 const style=readFileSync(new URL('../src/ui/style.css',import.meta.url),'utf8');
 assert.match(source,/entry\.texture\?\?this\.rasterPreview\(entry\);mesh\.visible=!!texture/);
 assert.match(source,/mesh\.renderOrder=MAP_LAYERS\.countryName/);
 assert.match(source,/label\.dataset\.textRenderer=entry\.texture\?'distance-field':'canvas-preview'/);
 assert.match(style,/\.country-label>svg\{[^}]*visibility:hidden/);

 const renderer=readFileSync(new URL('../src/render/WorldRenderer.ts',import.meta.url),'utf8');
 assert.match(renderer,/if\(state\.campaign!==this\.countryCampaign\)\{\s*this\.countryPlacements\.clear\(\);this\.countryPlacementCache\.clear\(\);this\.countryCurves\.clear\(\)/);
});

test('cumulative doubling refits in the worker without blanking or resetting the baseline on each gain',()=>{
 const map=[region(0,0,0,10,10),...Array.from({length:12},(_,i)=>region(i+1,10+i,0,1,10))],edges=buildBorderEdges(map,bounds),cache=new Map(),owners=map.map((_,i)=>i===0?0:-1);
 const first=layout(map,owners,cache).get(0),initial=fitCountryCurve(first,8).fontWorld;
 const foreground=()=>buildCountryPlacements(map,owners,buildCountryLabels(map,owners),edges,cache,bounds,{deferGrowth:true});
 for(let id=1;id<=9;id++){owners[id]=0;assert.equal(foreground().get(0),first);assert.equal(first.area,100);assert.equal(cache.get(0).pendingGrowth,undefined);}
 owners[10]=0;const placements=foreground();assert.equal(placements.get(0),first);assert.equal(cache.get(0).pendingGrowth,true,'Old legal title remains committed while worker is pending');
 const workerCache=structuredClone(cache),worker=layout(map,owners,workerCache),entry=workerCache.get(0);
 assert.notEqual(worker.get(0),first);assert.equal(entry.placement.area,200);assert.ok(fitCountryCurve(entry.placement,8).fontWorld>initial*1.4);
 const members=new Map([[0,owners.flatMap((owner,id)=>owner===0?[id]:[]).join(',')]]);
 acceptCountryLayouts('campaign',members,cache,placements,{campaign:'campaign',entries:[[0,entry]]});
 const grown=placements.get(0);assert.notEqual(grown,first);assert.equal(grown.area,200);assert.equal(cache.get(0).pendingGrowth,undefined);
 owners[11]=0;assert.equal(foreground().get(0),grown);assert.equal(grown.area,200,'The next minor gain does not immediately refit or oscillate');
});

test('growth replacement requires matching latest membership and a completed material refit',()=>{
 const old={owner:0,area:100,curves:[]},placements=new Map([[0,old]]),cache=new Map([[0,{members:'0,1,2',placement:old,pendingGrowth:true}]]),members=new Map([[0,'0,1,2']]);
 acceptCountryLayouts('a',members,cache,placements,{campaign:'a',entries:[[0,{members:'0,1',placement:{...old,area:200}}]]});assert.equal(placements.get(0),old);
 acceptCountryLayouts('a',members,cache,placements,{campaign:'a',entries:[[0,{members:'0,1,2',placement:{...old,area:100}}]]});assert.equal(placements.get(0),old,'Same signature alone must not accept an unrefitted snapshot');
 acceptCountryLayouts('b',members,cache,placements,{campaign:'a',entries:[[0,{members:'0,1,2',placement:{...old,area:300}}]]});assert.equal(placements.get(0),old);
});

test('a narrower growth candidate never shrinks the existing title',async()=>{
 const {growthCountryCurves}=await import('../src/render/countryLabelPaths.ts');
 const curve=(length,clearance)=>({points:[{x:0,z:0},{x:length,z:0}],control:{x:length/2,z:0},anchor:{x:length/2,z:0},length,clearance});
 const previous=curve(100,10),narrow=curve(500,1),before={owner:0,area:100,curves:[previous]},after={owner:0,area:200,curves:growthCountryCurves([previous],[narrow])};
 for(const advance of [2,4,8,16,32,64,128,256])assert.ok(fitCountryCurve(after,advance).fontWorld>=fitCountryCurve(before,advance).fontWorld);
 assert.equal(fitCountryCurve(after,8).curve,previous,'No benefit means no relocation');
});
