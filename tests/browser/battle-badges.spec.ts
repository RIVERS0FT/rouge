import {test,expect} from '@playwright/test';

test('regional battle badge shows every side’s flag and count, follows the camera and never steals map input',async({page})=>{
 test.setTimeout(120000);
 await page.route('**/battle-badge-harness',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0"><div id="world" class="world"></div></body>'}));
 await page.goto('/battle-badge-harness');
 const data=await page.evaluate(async()=>{
  const {default:refresh}=await import('/@react-refresh');refresh.injectIntoGlobalHook(window);
  (window as any).$RefreshReg$=()=>{};(window as any).$RefreshSig$=()=>((value:any)=>value);
  await import('/src/ui/style.css');
  const {WorldRenderer}=await import('/src/render/WorldRenderer.ts');
  const {battleViews}=await import('/src/render/armyViews.ts');
  const {MAP}=await import('/src/game/map.ts');
  const region=MAP.find((p:any)=>p.code.startsWith('USA-')&&p.playable),center=region.center;
  const world:any=new WorldRenderer(document.querySelector('#world')!,()=>{},()=>{},()=>{});
  cancelAnimationFrame(world.animation);
  const players=[{id:0,flag:{type:'preset',id:'fr'}},{id:1,flag:{type:'preset',id:'es'}},{id:2,flag:{type:'preset',id:'jp'}}];
  const unit=(id:number,owner:number,x:number,z:number)=>({id,owner,x:center.x+x,z:center.z+z,kind:'infantry',hp:100,province:region.id});
  const state={players,units:[unit(1,0,0,0),unit(2,0,.7,0),unit(3,1,1.5,.3),unit(4,2,1,-.8),unit(5,2,1.2,-1),unit(6,2,.6,-1.1)],
   battles:[{id:1,region:region.id,start:0,last:0,sides:[{owner:0,losses:0},{owner:1,losses:0},{owner:2,losses:0}]}]};
  world.actor=0;world.state={players};world.battles=battleViews(state);world.resize();
  const frame=(x:number,distance:number,tilt:number)=>{
   world.focus.set(x,0,center.z);world.camera.position.set(x,Math.cos(tilt)*distance,center.z+Math.sin(tilt)*distance);
   world.camera.lookAt(world.focus);world.camera.updateMatrixWorld();world.drawBattleBadges();
  };
  (window as any).battleTest={world,frame,center};frame(center.x,1000,0);
  return {sides:world.battles[0].sides.length};
 });
 expect(data.sides).toBe(3);
 const badge=page.getByTestId('battle-badge');
 await expect(badge).toHaveCount(1);await expect(badge).toHaveAttribute('data-sides','3');
 // Largest side first; each side shows its own flag and its troops in the region.
 await expect(badge.locator('.battle-count')).toHaveText(['3','2','1']);
 await expect(badge.locator('.battle-flag:visible')).toHaveCount(3);
 const flags=await badge.locator('.battle-flag').evaluateAll((nodes:HTMLImageElement[])=>nodes.map(node=>node.src));
 expect(new Set(flags).size).toBe(3);
 const box=(await badge.boundingBox())!;
 expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName,{x:box.x+box.width/2,y:box.y+box.height/2})).toBe('CANVAS');
 await page.evaluate(()=>{const t=(window as any).battleTest;t.frame(t.center.x+75,185,.4);});
 const after=(await badge.boundingBox())!;expect(after.x).toBeLessThan(box.x-20);
 await page.evaluate(()=>{const t=(window as any).battleTest;t.world.battles=[];t.world.drawBattleBadges();});
 await expect(badge).toHaveCount(0);
});

test('army nameplate shows only flag and strength, follows its lead battalion, and selects an own army',async({page})=>{
 test.setTimeout(120000);
 // The map fills the viewport, as in the game, so camera distances map to realistic pixel scales.
 await page.route('**/army-plaque-harness',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0"><div id="world" class="world" style="position:fixed;inset:0"></div></body>'}));
 await page.goto('/army-plaque-harness');
 await page.evaluate(async()=>{
  const {default:refresh}=await import('/@react-refresh');refresh.injectIntoGlobalHook(window);
  (window as any).$RefreshReg$=()=>{};(window as any).$RefreshSig$=()=>((value:any)=>value);
  await import('/src/ui/style.css');
  const {WorldRenderer}=await import('/src/render/WorldRenderer.ts');
  const {MAP}=await import('/src/game/map.ts');
  const region=MAP.find((p:any)=>p.code.startsWith('USA-')&&p.playable),center=region.center;
  const selected:number[]=[];
  const world:any=new WorldRenderer(document.querySelector('#world')!,()=>{},()=>{},()=>{},(id:number)=>selected.push(id));
  cancelAnimationFrame(world.animation);
  const players=[{id:0,flag:{type:'preset',id:'fr'}},{id:1,flag:{type:'preset',id:'es'}}];
  const lead=(owner:number,x:number)=>({id:10+owner,owner,x:center.x+x,z:center.z,kind:'infantry',hp:100,target:1,province:1});
  world.actor=0;world.state={players};world.lang='en';
  world.armies=[{id:4,owner:0,count:12,to:1,lead:lead(0,0),region:1,position:lead(0,0)},{id:5,owner:1,count:7,to:1,lead:lead(1,40),region:1,position:lead(1,40)}];
  // Resizing restarts the render loop; stop it so only this harness's camera projects nameplates.
  world.resize();cancelAnimationFrame(world.animation);
  const frame=(x:number,distance:number)=>{
   world.focus.set(x,0,center.z);world.camera.position.set(x,distance,center.z);world.camera.lookAt(world.focus);world.camera.updateMatrixWorld();world.drawArmyPlaques();
  };
  (window as any).armyTest={world,frame,center,selected,region};frame(center.x+20,1000);
 });
 const plaques=page.getByTestId('army-plaque');
 await expect(plaques).toHaveCount(2);
 const own=page.locator('.army-plaque[data-army="4"]'),enemy=page.locator('.army-plaque[data-army="5"]');
 await expect(own.locator('.army-plaque-count')).toHaveText('12');await expect(enemy.locator('.army-plaque-count')).toHaveText('7');
 await expect(own.locator('.army-plaque-flag')).toBeVisible();await expect(own).toHaveText('12');
 // Only an own nameplate selects; another country's nameplate lets the click through.
 await own.click();await enemy.click({force:true});
 expect(await page.evaluate(()=>(window as any).armyTest.selected)).toEqual([4]);
 const before=(await own.boundingBox())!;
 await page.evaluate(()=>{const t=(window as any).armyTest;const view=t.world.armies[0];view.lead=view.position={...view.lead,x:t.center.x+10};t.frame(t.center.x+20,1000);});
 const moved=(await own.boundingBox())!;expect(moved.x).toBeGreaterThan(before.x+5);
 // Nameplates never overlap: the nearer enemy one gives way to the own army.
 await expect(enemy).toHaveCount(0);
 await page.evaluate(()=>{const t=(window as any).armyTest;t.world.setSelectedArmy(4);t.frame(t.center.x+20,1000);});
 await expect(own).toHaveAttribute('data-selected','true');
 await page.evaluate(()=>{
  const {world,frame,center,region}=(window as any).armyTest;
  world.armies=[{...world.armies[0],phase:'enter',to:region.id,region:region.id,position:{x:center.x+80,z:center.z}}];
  world.plaqueTerritories=[{id:region.id,anchor:center,name:region.name,members:[region.id]}];
  world.state.provinces={[region.id]:{owner:1}};
  frame(center.x+2,240);world.distance=240;
  world.drawProvincePlaques(world.viewportWidth,world.viewportHeight);world.drawArmyPlaques();
 });
 const town=page.locator('.province-label:visible').first(),townBox=(await town.boundingBox())!,pinned=(await own.boundingBox())!;
 expect(Math.abs(townBox.x+townBox.width/2-pinned.x-pinned.width/2)).toBeLessThan(1);
 expect(pinned.y+pinned.height).toBeLessThanOrEqual(townBox.y+1);
 await expect(own).toHaveAttribute('data-phase','enter');
});
