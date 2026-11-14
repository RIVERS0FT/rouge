import {test,expect} from '@playwright/test';

test('drawing the ocean after opaque land preserves full atlas pixels at flat, tilted and wrapped views',async({page},testInfo)=>{
 test.setTimeout(180000);
 await page.route('**/ocean-order-harness',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0"><div id="world" style="width:960px;height:640px"></div></body>'}));
 await page.goto('/ocean-order-harness');
 const result=await page.evaluate(async()=>{
  const {default:refresh}=await import('/@react-refresh');refresh.injectIntoGlobalHook(window);
  (window as any).$RefreshReg$=()=>{};(window as any).$RefreshSig$=()=>((type:any)=>type);
  const {WorldRenderer}=await import('/src/render/WorldRenderer.ts');
  const {createGame}=await import('/src/game/engine.ts');
  const {MAP,provinceByCode}=await import('/src/game/map.ts');
  const {WORLD_WIDTH,project}=await import('/src/game/geo.ts');
  const state=createGame([{name:'Ocean review',leader:'warden',loadout:['infantry']},{name:'Opponent',leader:'warden',loadout:['infantry']}],77,'ocean-order-review');
  const world:any=new WorldRenderer(document.querySelector('#world')!,()=>{},()=>{});
  cancelAnimationFrame(world.animation);const frame=world.frame;world.frame=()=>{};
  world.update(state,-1,'en');world.setInputContext('game');
  const seas:any[]=[];world.scene.traverse((o:any)=>{if(o.geometry?.type==='PlaneGeometry'&&o.position.y===-.25)seas.push(o);});
  const defaultOrders=seas.map(sea=>sea.renderOrder),gl=world.renderer.getContext();
  const capture=()=>{
   world.coastShadow.renderMask(world.renderer,world.camera,!world.globalView);
   world.renderer.render(world.scene,world.camera);
   const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
   gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
  };
  const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
  let time=performance.now();const views=[];
  const germany=MAP[provinceByCode('DEU-3487')].center,coast=project(8,54),pacific=project(179,0);
  for(const [id,point,distance] of [['global',germany,2200],['land',germany,60],['coast',coast,60],['wrapped',pacific,90]] as const){
   world.globalView=id==='global';world.focus.x=point.x;world.desiredFocusZ=point.z;
   world.distance=world.desiredDistance=distance;
   for(let i=0;i<100;i++){
    world.invalidated=true;frame(time+=20);await pause(20);
    if(world.mapSurface.pending.length===0&&world.renderer.domElement.dataset.reliefState==='ready')break;
   }
   world.flatMapCache.surface.visible=false;world.atlas.visible=true;
   for(const copy of world.repeats)copy.visible=!world.globalView;
   for(const sea of seas)sea.renderOrder=0;const original=capture();
   for(const sea of seas)sea.renderOrder=1;const optimized=capture();
   let differingPixels=0,worst=0;
   for(let i=0;i<original.length;i+=4){let delta=0;for(let c=0;c<4;c++)delta=Math.max(delta,Math.abs(original[i+c]-optimized[i+c]));if(delta>2)differingPixels++;worst=Math.max(worst,delta);}
   views.push({id,distance,differingPixels,worst});
  }
  const relief=world.renderer.domElement.dataset.reliefState;
  world.dispose();return {defaultOrders,views,relief,worldWidth:WORLD_WIDTH};
 });
 await testInfo.attach('ocean-order-pixels',{body:JSON.stringify(result,null,2),contentType:'application/json'});
 expect(result.relief).toBe('ready');
 expect(result.defaultOrders).toEqual([1,1,1]);
 for(const view of result.views)expect(view.differingPixels,JSON.stringify(view)).toBe(0);
});
