import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-unit-model-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));

test('attack arrows persist on both maps, follow the camera, and end on capture or army loss',async({page})=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/attack-harness',route=>route.fulfill({contentType:'text/html',body:'<link rel="stylesheet" href="/src/ui/style.css"><body style="margin:0"><div id="world" style="position:relative;width:1440px;height:960px"></div></body>'}));
 await page.goto('/attack-harness');
 await page.evaluate(async(raw)=>{
  const {default:refresh}=await import('/@react-refresh');refresh.injectIntoGlobalHook(window);
  (window as any).$RefreshReg$=()=>{};(window as any).$RefreshSig$=()=>((type:any)=>type);
  const {WorldRenderer}=await import('/src/render/WorldRenderer.ts');
  const {MAP,provinceByCode}=await import('/src/game/map.ts');
  const {applyGroupingCommand}=await import('/src/game/territoryEconomy.ts');
  const state=JSON.parse(JSON.parse(raw).body),from=provinceByCode('DEU-3487'),to=MAP[from].neighbors.find(id=>MAP[id].playable)!;
  state.provinces[from].owner=0;state.provinces[to].owner=1;
  const partner=MAP[to].neighbors.find(id=>id!==from&&MAP[id].playable)!;state.provinces[partner].owner=1;
  const merged=applyGroupingCommand(state,1,{type:'merge',mapId:state.map,expectedRevision:state.grouping.revision,groups:[state.grouping.atomToGroup[MAP[to].code],state.grouping.atomToGroup[MAP[partner].code]]});
  if(!merged.ok)throw Error('Cannot create merged strategic area fixture');state.grouping=merged.state;
  state.units=[{...state.units[0],owner:0,origin:from,province:from,target:to,destination:to,assault:to,...MAP[from].center}];
  const world:any=new WorldRenderer(document.querySelector('#world')!,()=>{},()=>{},()=>{});
  cancelAnimationFrame(world.animation);const frame=world.frame;world.frame=()=>{};
  const center={x:(MAP[from].center.x+MAP[to].center.x)/2,z:(MAP[from].center.z+MAP[to].center.z)/2};
  world.setInputContext('game');world.globalView=false;world.focus.set(center.x,0,center.z);world.desiredFocusZ=center.z;
  const draw=(distance=320)=>{
   world.distance=world.desiredDistance=world.lastCameraTarget=distance;world.lastRender=-Infinity;world.invalidated=true;
   world.update(structuredClone(state),from,'zh',0);frame(performance.now());
  };
  (window as any).attackTest={world,state,from,to,draw,centers:{[from]:MAP[from].center,[to]:MAP[to].center}};draw();
  const outline=world.dispatchTargetPath(to),members=world.dispatchBoundaries.get(to).members;
  if(members.length!==1||members[0]!==to)throw Error('Highlight expanded from its administrative target');
  const expected=world.boundaryEdges.filter(edge=>edge.atoms.includes(to)).length;
  if((outline.outline.match(/M/g)??[]).length!==expected)throw Error('Highlight does not match the administrative border');
 },fixture.value);
 const arrows=page.getByTestId('attack-arrows'),path=arrows.locator('path').first(),canvas=page.locator('#world canvas');
 await expect(arrows).toHaveAttribute('data-routes','1');await expect(path).toBeVisible();
 await expect(canvas).toHaveAttribute('data-unit-render-mode','2d');await expect(canvas).toHaveAttribute('data-rendered-sprites','0');
 const strategic=await path.getAttribute('d');await page.waitForTimeout(400);await expect(path).toBeVisible();
 const anchor=await page.evaluate(()=>{
  const t=(window as any).attackTest,p=t.world.unitPoint.set(t.state.units[0].x,.16,t.state.units[0].z).project(t.world.camera);
  return {x:(p.x+1)*1440/2,y:(1-p.y)*960/2};
 });
 const tail=strategic!.slice(1,-1).split('L').map(point=>point.split(',').map(Number));
 // The first and final body edges straddle the exact source anchor.
 expect((tail[0][0]+tail.at(-1)![0])/2).toBeCloseTo(anchor.x,0);
 expect((tail[0][1]+tail.at(-1)![1])/2).toBeCloseTo(anchor.y,0);
 const scale=await page.evaluate(()=>{
  const t=(window as any).attackTest,svg=document.querySelector('[data-testid="attack-arrows"]')!;
  const point=(id:number)=>{const p=t.centers[id],v=t.world.unitPoint.set(p.x,.16,p.z).project(t.world.camera);
   return {x:v.x*720,y:v.y*480};};
  const widthAt=(distance:number)=>{
   t.draw(distance);const d=svg.querySelector('path')!.getAttribute('d')!;
   const pairs=d.slice(1,-1).split('L').map(p=>p.split(',').map(Number));
   const [first,last]=[pairs[0],pairs.at(-1)!],a=point(t.from),b=point(t.to);
   return {tail:Math.hypot(first[0]-last[0],first[1]-last[1]),map:Math.hypot(a.x-b.x,a.y-b.y)};
  };
  const near=widthAt(320),far=widthAt(640);return {ribbon:near.tail/far.tail,map:near.map/far.map};
 });
 expect(scale.ribbon).toBeCloseTo(scale.map,2);expect(scale.ribbon).toBeGreaterThan(1.9);
 await page.evaluate(()=>(window as any).attackTest.draw());
 await page.screenshot({path:'artifacts/attack-arrows-2d.png'});
 await page.evaluate(()=>{const t=(window as any).attackTest;t.draw(80);});
 await expect(canvas).toHaveAttribute('data-unit-render-mode','3d');await expect(path).toBeVisible();expect(await path.getAttribute('d')).not.toBe(strategic);
 await page.screenshot({path:'artifacts/attack-arrows-3d.png'});
 await page.evaluate(()=>{const t=(window as any).attackTest;t.state.provinces[t.to].captor=0;t.state.provinces[t.to].capture=.05;t.draw();});
 await expect(arrows).toHaveAttribute('data-routes','0');await expect(arrows.locator('path')).toHaveCount(0);
 await page.evaluate(()=>{const t=(window as any).attackTest;t.state.provinces[t.to].captor=-1;t.state.provinces[t.to].capture=0;t.draw();});
 await expect(arrows.locator('path')).toHaveCount(0);
 await page.evaluate(()=>{const t=(window as any).attackTest;t.state.units=[{...t.state.units[0],id:t.state.nextId++}];t.draw();});
 await expect(path).toBeVisible();
 await page.evaluate(()=>{const t=(window as any).attackTest;t.state.units=[];t.draw();});
 await expect(arrows.locator('path')).toHaveCount(0);await expect(arrows).toHaveAttribute('data-routes','0');
 await page.evaluate(()=>(window as any).attackTest.world.dispose());await expect(arrows).toHaveCount(0);expect(errors).toEqual([]);
});
