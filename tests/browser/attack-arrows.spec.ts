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

test('an active attack order shows no route overlay on either map',async({page})=>{
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
 const canvas=page.locator('#world canvas');
 for(const [distance,mode] of [[320,'2d'],[80,'3d']] as const){
  await page.evaluate(distance=>(window as any).attackTest.draw(distance),distance);
  await expect(canvas).toHaveAttribute('data-unit-render-mode',mode);
  await expect(canvas).toHaveAttribute('data-route-overlay-visible','false');
  await expect(page.getByTestId('attack-arrows')).toHaveCount(0);
  await expect(page.getByTestId('dispatch-preview')).toBeHidden();
 }
 await page.evaluate(()=>(window as any).attackTest.world.dispose());expect(errors).toEqual([]);
});
