import {openMapSearch} from './map-search.ts';
import {test,expect} from './static-host.ts';

test('ocean labels are italic in both languages while land labels stay upright',async({page})=>{
 test.setTimeout(180000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  localStorage.setItem('rouge.language','zh');
  const original=CanvasRenderingContext2D.prototype.fillText;
  const labels:{name:string;font:string;differsFromUpright:boolean}[]=[];
  Object.assign(window,{__mapLabelDraws:labels});
  CanvasRenderingContext2D.prototype.fillText=function(text,x,y,maxWidth){
   if(maxWidth===undefined)original.call(this,text,x,y);else original.call(this,text,x,y,maxWidth);
   if(this.canvas.width!==512||this.canvas.height!==96||maxWidth!==490)return;
   // Compare the actual ocean texture with an upright rendering. This also
   // catches missing synthetic italics in CJK fallback fonts.
   let differsFromUpright=false;
   if(this.font.startsWith('italic ')){
    const upright=document.createElement('canvas');upright.width=512;upright.height=96;
    const context=upright.getContext('2d')!;context.textAlign=this.textAlign;
    context.font=this.font.replace(/italic\s+/, '');context.fillStyle=this.fillStyle;
    original.call(context,text,x,y,maxWidth);
    const actual=this.getImageData(0,0,512,96).data,normal=context.getImageData(0,0,512,96).data;
    differsFromUpright=actual.some((value,index)=>value!==normal[index]);
   }
   labels.push({name:text,font:this.font,differsFromUpright});
  };
 });
 await page.goto('/');
 await expect(page.locator('canvas[data-ready="true"]')).toBeVisible({timeout:30000});
 await page.getByTestId('single-player').click();await page.getByTestId('begin-campaign').click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:30000});
 const canvas=page.locator('.world canvas');await canvas.focus();await page.keyboard.press('Space');
 await expect(page.getByTestId('toggle-pause')).toHaveText('▶');
 // The atlas covers (rather than fits) the viewport. At 1440x960 the Pacific
 // and Arctic labels are correctly outside the viewport's label-safe area.
 const visibleOceanNames={zh:['大西洋','印度洋'],en:['ATLANTIC','INDIAN OCEAN']};
 for(const language of ['zh','en','zh'] as const){
  await page.getByTestId('open-settings').click();
  await page.getByRole('button',{name:language==='zh'?'简体中文':'English',exact:true}).click();
  await page.getByTestId('settings-resume').click();
  await canvas.focus();await page.keyboard.press('Home');
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await expect.poll(()=>page.evaluate(names=>{
   const labels=(window as any).__mapLabelDraws as {name:string;font:string;differsFromUpright:boolean}[];
   return names.every(name=>labels.some(label=>label.name===name&&label.font.startsWith('italic ')&&label.differsFromUpright));
  },visibleOceanNames[language])).toBe(true);
  await page.screenshot({path:`artifacts/ocean-labels-${language}.png`});
  await openMapSearch(page);await page.getByTestId('map-search').fill(language==='zh'?'江苏':'Jiangsu');
  await page.locator('.map-search-results button').first().click();
  await canvas.focus();await page.keyboard.press('End');
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  const province=page.locator('.province-label:visible').filter({hasText:language==='zh'?'江苏':'Jiangsu'}).first();
  await expect(province).toBeVisible();await expect(province).toHaveCSS('font-style','normal');
 }
 expect(errors).toEqual([]);
});

for(const viewport of [{width:1440,height:960},{width:390,height:844}])test(`ocean text scales with map zoom rather than screen pixels at ${viewport.width}px`,async({page})=>{
 test.setTimeout(120000);await page.setViewportSize(viewport);
 await page.route('**/ocean-scale-harness',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0"><div id="world" style="width:100vw;height:100vh"></div></body>'}));
 await page.goto('/ocean-scale-harness');
 const result=await page.evaluate(async()=>{
  const {default:refresh}=await import('/@react-refresh');refresh.injectIntoGlobalHook(window);
  (window as any).$RefreshReg$=()=>{};(window as any).$RefreshSig$=()=>((type:any)=>type);
  const {WorldRenderer}=await import('/src/render/WorldRenderer.ts');
  const {project,WORLD_WIDTH}=await import('/src/game/geo.ts');
  const THREE=await import('/node_modules/three/build/three.module.js');
  const world:any=new WorldRenderer(document.querySelector('#world')!,()=>{},()=>{});
  cancelAnimationFrame(world.animation);world.frame=()=>{};
  const point=project(-37,20),snapshots=[];let time=performance.now()+1000;
  for(const lang of ['en','zh'])for(const wrapped of [false,true])for(const distance of [2000,1000]){
   const x=point.x+(wrapped?WORLD_WIDTH:0);world.lang=lang;world.distance=distance;world.focus.set(x,0,point.z);
   world.camera.position.set(x,distance,point.z);world.camera.lookAt(x,0,point.z);world.camera.updateMatrixWorld();world.drawLabels(time+=200);
   const label=world.labels.find((label:any)=>label.sprite.visible&&label.key===`${lang==='en'?'ATLANTIC':'大西洋'}:true`);
   if(!label)throw Error(`Atlantic label missing: ${lang} ${wrapped} ${distance}`);
   const sprite=label.sprite,y=sprite.position.y;
   const screenWidth=(width:number)=>{const a=new THREE.Vector3(x-width/2,y,point.z).project(world.camera),b=new THREE.Vector3(x+width/2,y,point.z).project(world.camera);return (b.x-a.x)*world.viewportWidth/2;};
   world.renderer.render(world.scene,world.camera);
   snapshots.push({lang,wrapped,distance,worldWidth:sprite.scale.x,screenWidth:screenWidth(sprite.scale.x),mapIntervalWidth:screenWidth(100),x:sprite.position.x,expectedX:x,font:label.canvas.getContext('2d').font});
  }
  world.distance=499;world.drawLabels(time+=200);const nearOceanCount=world.labels.filter((label:any)=>label.sprite.visible&&label.key.endsWith(':true')).length;
  world.dispose();return {snapshots,nearOceanCount};
 });
 for(let i=0;i<result.snapshots.length;i+=2){
  const far=result.snapshots[i],near=result.snapshots[i+1];
  expect(far.worldWidth).toBe(near.worldWidth);
  const textRatio=near.screenWidth/far.screenWidth,mapRatio=near.mapIntervalWidth/far.mapIntervalWidth;
  expect(textRatio).toBeGreaterThan(1.99);expect(textRatio).toBeLessThan(2.01);expect(textRatio).toBeCloseTo(mapRatio,8);
  expect(far.x).toBe(far.expectedX);expect(near.x).toBe(near.expectedX);expect(far.font).toMatch(/^italic /);expect(near.font).toMatch(/^italic /);
 }
 expect(result.nearOceanCount).toBe(0);
});
