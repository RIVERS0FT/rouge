import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-unit-model-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));

test('a long offscreen route keeps a narrow ground outline at close zoom',async({page})=>{
 await page.route('**/arrow-perspective-harness',route=>route.fulfill({contentType:'text/html',body:'<link rel="stylesheet" href="/src/ui/style.css"><body></body>'}));
 await page.goto('/arrow-perspective-harness');
 const result=await page.evaluate(async()=>{
  const {AttackArrows}=await import('/src/render/attackArrows.ts'),{groundArrowProjection}=await import('/src/render/groundArrowProjection.ts'),THREE=await import('/node_modules/three/build/three.module.js');
  const arrows=new AttackArrows(document.body),camera=new THREE.PerspectiveCamera(40,1440/960,.4,20000);
  camera.up.set(0,0,-1);camera.position.set(0,40*Math.cos(.6),40*Math.sin(.6));camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const projection=groundArrowProjection(camera,1440,960,.16);
  const draw=(sourceY:number)=>{
   arrows.draw([{owner:0,from:1,to:2,units:1}],(_route,copy)=>copy===0?[{x:-200,y:sourceY},{x:0,y:0}]:null,projection,1440,960,()=> '#a04432');
   const paths=[...document.querySelectorAll<SVGPathElement>('.attack-arrows path')],outline=paths[1];
   const near=projection.point({x:.08,y:0})!,away=projection.point({x:0,y:-5})!;
   return {hasOutline:!!outline.getAttribute('d'),near:outline.isPointInFill(new DOMPoint(near.x,near.y)),away:paths.some(path=>path.isPointInFill(new DOMPoint(away.x,away.y))||path.isPointInStroke(new DOMPoint(away.x,away.y))),strokes:paths.map(path=>getComputedStyle(path).stroke)};
  };
  const visibleMidpoint=draw(100),hiddenMidpoint=draw(150);arrows.dispose();return [visibleMidpoint,hiddenMidpoint];
 });
 for(const resultAtMidpoint of result){
  expect(resultAtMidpoint.hasOutline).toBe(true);expect(resultAtMidpoint.near).toBe(true);expect(resultAtMidpoint.away).toBe(false);expect(resultAtMidpoint.strokes).toEqual(['none','none']);
 }
});

test('cached arrow contours match fresh projections after camera, viewport, strength and route changes',async({page})=>{
 await page.route('**/arrow-cache-harness',route=>route.fulfill({contentType:'text/html',body:'<body></body>'}));await page.goto('/arrow-cache-harness');
 const result=await page.evaluate(async()=>{
  const {AttackArrows}=await import('/src/render/attackArrows.ts'),{groundArrowProjection}=await import('/src/render/groundArrowProjection.ts'),THREE=await import('/node_modules/three/build/three.module.js');
  const cachedHost=document.createElement('div'),freshHost=document.createElement('div');document.body.append(cachedHost,freshHost);
  const cached=new AttackArrows(cachedHost),fresh=new AttackArrows(freshHost),camera=new THREE.PerspectiveCamera(45,1.5,.1,4000);
  let projections=0;
  const draw=(view:number,width:number,height:number,units:number,removed=false)=>{
   camera.aspect=width/height;camera.position.set(view,300,0);camera.up.set(0,0,-1);camera.lookAt(view,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
   const projection=groundArrowProjection(camera,width,height,.16),tracked={point:projection.point,polygon:(points:any)=>{projections++;return projection.polygon(points);}};
   const routes=removed?[]:[{owner:0,from:1,to:2,units}],ground=(_route:any,copy:number)=>[{x:-40+copy*3000,y:0},{x:40+copy*3000,y:0}] as [{x:number;y:number},{x:number;y:number}];
   cached.draw(routes,ground,tracked,width,height,()=> '#ff0000',`${view}:${width}:${height}`);fresh.draw(routes,ground,projection,width,height,()=> '#ff0000');
   return cachedHost.innerHTML===freshHost.innerHTML;
  };
  const equal=[draw(0,900,600,10)],initial=projections;equal.push(draw(0,900,600,9));const stationary=projections;
  equal.push(draw(3000,900,600,9),draw(3000,600,900,9),draw(9000,600,900,9),draw(0,900,600,9),draw(0,900,600,0,true));
  const remaining=cachedHost.querySelectorAll('path').length;cached.dispose();fresh.dispose();return {equal,initial,stationary,projections,remaining};
 });
 expect(result.equal.every(Boolean)).toBe(true);expect(result.initial).toBeGreaterThan(0);expect(result.stationary).toBe(result.initial);expect(result.projections).toBeGreaterThan(result.initial);expect(result.remaining).toBe(0);
});

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
 await expect(arrows).toHaveAttribute('data-routes','1');await expect(path).toHaveAttribute('d',/^M/);
 await expect(canvas).toHaveAttribute('data-unit-render-mode','2d');await expect(canvas).toHaveAttribute('data-route-overlay-visible','true');
 await expect(arrows).toHaveCSS('opacity','0');await expect(canvas).toHaveAttribute('data-rendered-sprites','0');
 const strategic=await path.getAttribute('d');await page.waitForTimeout(400);await expect(path).toHaveAttribute('d',/^M/);
 const anchor=await page.evaluate(()=>{
  const t=(window as any).attackTest,p=t.world.unitPoint.set(t.state.units[0].x,.16,t.state.units[0].z).project(t.world.camera);
  return {x:(p.x+1)*1440/2,y:(1-p.y)*960/2};
 });
 const tail=await path.evaluate(node=>{
  const element=node as SVGPathElement,matrix=element.getCTM()!;
  return element.getAttribute('d')!.slice(1,-1).split('L').map(pair=>{
   const [x,y]=pair.split(',').map(Number),p=new DOMPoint(x,y).matrixTransform(matrix);return [p.x,p.y];
  });
 });
 // The first and final body edges straddle the exact source anchor.
 expect((tail[0][0]+tail.at(-1)![0])/2).toBeCloseTo(anchor.x,0);
 expect((tail[0][1]+tail.at(-1)![1])/2).toBeCloseTo(anchor.y,0);
 const scale=await page.evaluate(()=>{
  const t=(window as any).attackTest,svg=document.querySelector('[data-testid="attack-arrows"]')!;
  const point=(id:number)=>{const p=t.centers[id],v=t.world.unitPoint.set(p.x,.16,p.z).project(t.world.camera);
   return {x:v.x*720,y:v.y*480};};
  const widthAt=(distance:number)=>{
   t.draw(distance);const body=svg.querySelector('path')!,d=body.getAttribute('d')!,matrix=body.getCTM()!;
   const pairs=d.slice(1,-1).split('L').map(pair=>{
    const [x,y]=pair.split(',').map(Number),p=new DOMPoint(x,y).matrixTransform(matrix);return [p.x,p.y];
   });
   const [first,last]=[pairs[0],pairs.at(-1)!],a=point(t.from),b=point(t.to);
   return {tail:Math.hypot(first[0]-last[0],first[1]-last[1]),map:Math.hypot(a.x-b.x,a.y-b.y)};
  };
  const near=widthAt(320),far=widthAt(640);return {ribbon:near.tail/far.tail,map:near.map/far.map};
 });
 expect(scale.ribbon).toBeCloseTo(scale.map,2);expect(scale.ribbon).toBeGreaterThan(1.9);
 await page.evaluate(()=>(window as any).attackTest.draw());
 await page.screenshot({path:'artifacts/attack-arrows-2d.png'});
 await page.evaluate(()=>{const t=(window as any).attackTest;t.draw(80);});
 await expect(canvas).toHaveAttribute('data-unit-render-mode','3d');await expect(canvas).toHaveAttribute('data-route-overlay-visible','true');await expect(path).toHaveAttribute('d',/^M/);expect(await path.getAttribute('d')).not.toBe(strategic);
 await page.screenshot({path:'artifacts/attack-arrows-3d.png'});
 await page.evaluate(()=>{const t=(window as any).attackTest;t.state.provinces[t.to].captor=0;t.state.provinces[t.to].capture=.05;t.draw();});
 await expect(arrows).toHaveAttribute('data-routes','0');await expect(arrows.locator('path')).toHaveCount(0);await expect(canvas).toHaveAttribute('data-route-overlay-visible','false');
 await page.evaluate(()=>{const t=(window as any).attackTest;t.state.provinces[t.to].captor=-1;t.state.provinces[t.to].capture=0;t.draw();});
 await expect(arrows.locator('path')).toHaveCount(0);
 await page.evaluate(()=>{const t=(window as any).attackTest;t.state.units=[{...t.state.units[0],id:t.state.nextId++}];t.draw();});
 await expect(path).toHaveAttribute('d',/^M/);
 await page.evaluate(()=>{const t=(window as any).attackTest;t.state.units=[];t.draw();});
 await expect(arrows.locator('path')).toHaveCount(0);await expect(arrows).toHaveAttribute('data-routes','0');
 await page.evaluate(()=>(window as any).attackTest.world.dispose());await expect(arrows).toHaveCount(0);expect(errors).toEqual([]);
});
