import {test,expect} from '@playwright/test';

test('map battle badge counts the two local armies, follows the camera, and reveals flags without stealing map input',async({page})=>{
 test.setTimeout(120000);
 await page.route('**/battle-badge-harness',route=>route.fulfill({contentType:'text/html',body:'<body style="margin:0"><div id="world" class="world"></div></body>'}));
 await page.goto('/battle-badge-harness');
 const data=await page.evaluate(async()=>{
  const {default:refresh}=await import('/@react-refresh');refresh.injectIntoGlobalHook(window);
  (window as any).$RefreshReg$=()=>{};(window as any).$RefreshSig$=()=>((value:any)=>value);
  await import('/src/ui/style.css');
  const {WorldRenderer}=await import('/src/render/WorldRenderer.ts');
  const {battleContacts}=await import('/src/render/battleContacts.ts');
  const {MAP}=await import('/src/game/map.ts');
  const center=MAP.find((p:any)=>p.code.startsWith('USA-')&&p.playable).center;
  const world:any=new WorldRenderer(document.querySelector('#world')!,()=>{},()=>{},()=>{});
  cancelAnimationFrame(world.animation);
  const players=[{id:0,flag:{type:'preset',id:'fr'}},{id:1,flag:{type:'preset',id:'es'}}];
  const unit=(id:number,owner:number,x:number,z:number)=>({id,owner,x:center.x+x,z:center.z+z,kind:'infantry',hp:100});
  world.actor=0;world.state={players};
  world.battles=battleContacts({players:[],units:[unit(1,0,0,0),unit(2,0,.7,0),unit(3,1,1.5,.3),unit(4,1,100,100)]});
  world.resize();
  const frame=(x:number,distance:number,tilt:number)=>{
   world.focus.set(x,0,center.z);world.camera.position.set(x,Math.cos(tilt)*distance,center.z+Math.sin(tilt)*distance);
   world.camera.lookAt(world.focus);world.camera.updateMatrixWorld();world.drawBattleBadges();
  };
  (window as any).battleTest={world,frame,center};frame(center.x,1000,0);
  return {players:world.state.players.length};
 });
 expect(data.players).toBe(2);
 const badge=page.getByTestId('battle-badge');
 await expect(badge).toHaveCount(1);await expect(badge.locator('.battle-side-first')).toHaveText('2');await expect(badge.locator('.battle-side-second')).toHaveText('1');
 await expect(badge.locator('.battle-flag:visible')).toHaveCount(0);
 const box=(await badge.boundingBox())!;
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await expect(badge.locator('.battle-flag:visible')).toHaveCount(2);
 const flags=await badge.locator('.battle-flag').evaluateAll((nodes:HTMLImageElement[])=>nodes.map(node=>node.src));
 expect(flags[0]).not.toBe(flags[1]);
 expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName,{x:box.x+box.width/2,y:box.y+box.height/2})).toBe('CANVAS');
 await page.mouse.move(4,4);await expect(badge.locator('.battle-flag:visible')).toHaveCount(0);
 await page.evaluate(()=>{const t=(window as any).battleTest;t.frame(t.center.x+75,185,.4);});
 const after=(await badge.boundingBox())!;expect(after.x).toBeLessThan(box.x-20);
 await page.evaluate(()=>{const t=(window as any).battleTest;t.world.battles=[];t.world.drawBattleBadges();});
 await expect(badge).toHaveCount(0);
});
