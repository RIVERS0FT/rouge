import {test,expect,type Page} from '@playwright/test';
test.use({hasTouch:true,isMobile:true});
async function fit(page:Page,selector:string,width:number,height:number){
 const rect=await page.locator(selector).boundingBox();expect(rect).not.toBeNull();
 expect(rect!.x).toBeGreaterThanOrEqual(0);expect(rect!.y).toBeGreaterThanOrEqual(0);
 expect(rect!.x+rect!.width).toBeLessThanOrEqual(width+1);expect(rect!.y+rect!.height).toBeLessThanOrEqual(height+1);
}
test('phone portrait and landscape keep setup, HUD and scrollable dialogs reachable',async({page})=>{
 test.setTimeout(180000);
 for(const [width,height]of [[390,844],[360,640],[844,390]]){
  await page.setViewportSize({width,height});await page.goto('/');
  await page.getByTestId('single-player').tap();
  await expect(page.getByRole('dialog')).toBeVisible();await fit(page,'[role=dialog]',width,height);
  await page.getByTestId('choose-unit-horseArtillery').tap();
  await page.getByTestId('begin-campaign').tap();await expect(page.getByTestId('open-settings')).toBeVisible();
  await expect(page.locator('canvas')).toHaveAttribute('data-settled','true');
  expect(await page.locator('canvas').boundingBox()).toEqual({x:0,y:0,width,height});
  for(const sel of ['[data-testid=open-settings]','[data-testid=open-upgrades]','[data-testid=toggle-province-panel]'])await fit(page,sel,width,height);
  expect(await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}))).toEqual({width,height});
  await page.getByTestId('toggle-province-panel').tap();await expect(page.getByTestId('toggle-province-panel')).toHaveAttribute('aria-expanded','true');await fit(page,'#province-panel',width,height);
  await page.getByTestId('toggle-strategic-panel').tap();await expect(page.getByTestId('toggle-province-panel')).toHaveAttribute('aria-expanded','false');await expect(page.getByTestId('toggle-strategic-panel')).toHaveAttribute('aria-expanded','true');
  await page.getByTestId('toggle-strategic-panel').tap();
  await page.getByTestId('open-upgrades').tap();await fit(page,'[role=dialog]',width,height);
  await page.getByTestId('upgrade-horseArtillery-speed').tap();
  await expect(page.getByTestId('upgrade-horseArtillery-speed').locator('..')).toContainText('1/8');
  await page.keyboard.press('Escape');await page.getByTestId('open-settings').tap();await fit(page,'[role=dialog]',width,height);
  await page.screenshot({path:`artifacts/mobile-touch-${width}x${height}.png`});
 }
});
test('pinch zoom, one-finger drag and cancellation do not cause accidental selection',async({page,context})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.getByTestId('single-player').tap();await page.getByTestId('begin-campaign').tap();
 await expect(page.locator('.view-controls')).toHaveCount(0);
 const canvas=page.locator('canvas');await expect(canvas).toHaveAttribute('data-ready','true');
 await page.locator('canvas').focus();await page.keyboard.press('Home');await expect(canvas).toHaveAttribute('data-settled','true');
 const distance=Number(await canvas.getAttribute('data-distance'));
 const cdp=await context.newCDPSession(page);
 const touch=async(type:string,points:{x:number;y:number;id:number}[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 await touch('touchStart',[{x:155,y:420,id:1},{x:235,y:420,id:2}]);
 await touch('touchMove',[{x:95,y:420,id:1},{x:295,y:420,id:2}]);
 await touch('touchEnd',[]);
 await expect(page.getByTestId('toggle-province-panel')).toHaveAttribute('aria-expanded','false');
 await expect.poll(async()=>Number(await canvas.getAttribute('data-distance'))).toBeLessThan(distance*.7);
 const x=Number(await canvas.getAttribute('data-focus-x'));
 await touch('touchStart',[{x:180,y:420,id:1}]);await touch('touchMove',[{x:230,y:420,id:1}]);await touch('touchEnd',[]);
 await expect.poll(async()=>Number(await canvas.getAttribute('data-focus-x'))).not.toBe(x);
 const before=await canvas.getAttribute('data-focus-x');
 await touch('touchStart',[{x:160,y:420,id:1}]);await touch('touchCancel',[]);
 // A move after a cancelled gesture cannot retain a stale dragging anchor.
 await canvas.dispatchEvent('pointermove',{pointerId:1,pointerType:'touch',clientX:300,clientY:500});
 expect(await canvas.getAttribute('data-focus-x')).toBe(before);
 await page.setViewportSize({width:844,height:390});await expect(canvas).toHaveAttribute('data-viewport-width','844');
 await fit(page,'[data-testid=toggle-province-panel]',844,390);await cdp.detach();
});
test('hybrid touch laptop switches hints by intent and modal context blocks all map actions',async({page})=>{
 await page.setViewportSize({width:1280,height:800});await page.goto('/');
 await page.getByTestId('single-player').click();await page.getByTestId('begin-campaign').click();
 const app=page.locator('.app'),canvas=page.locator('canvas');
 await expect(canvas).toHaveAttribute('data-input-context','game');
 await canvas.dispatchEvent('pointerdown',{pointerId:10,pointerType:'touch',clientX:600,clientY:400});
 await canvas.dispatchEvent('pointercancel',{pointerId:10,pointerType:'touch'});
 await expect(app).toHaveAttribute('data-input-device','touch');
 await expect(page.getByTestId('input-hint')).toHaveCount(0);
 await canvas.dispatchEvent('pointerdown',{pointerId:11,pointerType:'mouse',clientX:600,clientY:400});
 await canvas.dispatchEvent('pointercancel',{pointerId:11,pointerType:'mouse'});
 await expect(app).toHaveAttribute('data-input-device','touch');
 await page.keyboard.press('Shift');await expect(app).toHaveAttribute('data-input-device','touch');
 await page.keyboard.press('ArrowLeft');await expect(app).toHaveAttribute('data-input-device','mouse');
 await expect(page.getByTestId('input-hint')).toHaveCount(0);
 await page.getByTestId('open-settings').click();await expect(canvas).toHaveAttribute('data-input-context','blocked');
 await expect(canvas).toHaveAttribute('data-settled','true');
 const before=await canvas.evaluate(el=>[el.getAttribute('data-distance'),el.getAttribute('data-focus-x')]);
 await canvas.dispatchEvent('wheel',{deltaY:-800});
 await canvas.dispatchEvent('pointerdown',{pointerId:12,pointerType:'mouse',clientX:600,clientY:400});
 await canvas.dispatchEvent('pointermove',{pointerId:12,pointerType:'mouse',clientX:800,clientY:400});
 await canvas.dispatchEvent('pointerup',{pointerId:12,pointerType:'mouse',clientX:800,clientY:400});
 expect(await canvas.evaluate(el=>[el.getAttribute('data-distance'),el.getAttribute('data-focus-x')])).toEqual(before);
 await page.keyboard.press('Escape');await expect(canvas).toHaveAttribute('data-input-context','game');
});
