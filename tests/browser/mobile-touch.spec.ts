import {waitForRuntime} from './readiness.ts';
import {test,expect,type Page} from '@playwright/test';
test.use({hasTouch:true,isMobile:true});
async function ready(page:Page){
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await expect(page.locator('.world canvas')).toHaveAttribute('data-input-context','game');
 await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function fit(page:Page,selector:string,width:number,height:number){
 const rect=await page.locator(selector).boundingBox();expect(rect).not.toBeNull();
 expect(rect!.x).toBeGreaterThanOrEqual(0);expect(rect!.y).toBeGreaterThanOrEqual(0);
 expect(rect!.x+rect!.width).toBeLessThanOrEqual(width+1);expect(rect!.y+rect!.height).toBeLessThanOrEqual(height+1);
}
for(const [width,height]of [[390,844],[360,640],[844,390],[568,320]])test(`phone ${width}x${height} keeps setup, HUD and scrollable dialogs reachable`,async({page,context})=>{
 test.setTimeout(180000);
  await page.setViewportSize({width,height});await page.goto('/');
  await page.getByTestId('single-player').tap();await waitForRuntime(page);
  await expect(page.locator('.setup-modal')).toBeVisible();await fit(page,'.setup-modal',width,height);
  await page.getByTestId('choose-unit-horseArtillery').tap();
  await page.getByTestId('begin-campaign').tap();await ready(page);await expect(page.getByTestId('open-settings')).toBeVisible();
  await expect(page.locator('.world canvas')).toHaveAttribute('data-settled','true');
  expect(await page.locator('.world canvas').boundingBox()).toEqual({x:0,y:0,width,height});
  const rail=page.locator('.hud-rail'),railBox=(await rail.boundingBox())!,card=(await page.getByTestId('commander-portrait').boundingBox())!;
  expect(await rail.evaluate(element=>getComputedStyle(element).flexDirection)).toBe('column');
  expect(railBox.x).toBeCloseTo(card.x);
  expect(railBox.y+railBox.height).toBeLessThan(card.y);
  expect(height-card.y-card.height).toBe(8);
  for(const button of await rail.locator('button').all()){
    const bounds=(await button.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  if(height===320)expect(await rail.evaluate(element=>element.scrollHeight>element.clientHeight)).toBe(true);
  for(const sel of ['[data-testid=open-settings]','[data-testid=open-upgrades]','[data-testid=toggle-province-panel]'])await fit(page,sel,width,height);
  expect(await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}))).toEqual({width,height});
  // Use real touch events, not clicks in a resized desktop browser.
  const portrait=page.getByTestId('portrait-talents');
  await expect(portrait).toHaveAttribute('title',/查看领袖天赋/);
  await expect(page.getByTestId('commander-portrait')).toHaveText('指挥官');
  await portrait.tap();await expect(page.getByRole('dialog',{name:'领袖天赋',exact:true})).toBeVisible();
  await expect(page.locator('.world canvas')).toHaveAttribute('data-input-context','blocked');
  await page.getByRole('button',{name:'关闭',exact:true}).tap();await expect(page.getByRole('dialog')).toHaveCount(0);
  if(height===320){
    // Swipe up inside the compact rail, not the map, to reveal the last item.
    const cdp=await context.newCDPSession(page);
    const point={x:Math.round(railBox.x+railBox.width/2),y:Math.round(railBox.y+railBox.height-12)};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
    for(const offset of [20,45,80])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,y:point.y-offset}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(()=>rail.evaluate(element=>element.scrollTop)).toBeGreaterThan(0);
    await cdp.detach();
  }
  await page.getByTestId('mobile-talents').tap();await expect(page.getByRole('dialog',{name:'领袖天赋',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'关闭',exact:true}).tap();await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.world canvas')).toHaveAttribute('data-input-context','game');
  // The rail can be scrolled on a short phone; tapping its first item again
  // should also scroll it back into reach.
  await page.getByTestId('toggle-province-panel').tap();await expect(page.getByTestId('toggle-province-panel')).toHaveAttribute('aria-expanded','true');await fit(page,'#province-panel',width,height);
  const province=(await page.locator('#province-panel').boundingBox())!;
  expect(province.x).toBeGreaterThan(railBox.x+railBox.width);
  expect(province.y).toBeCloseTo(railBox.y);
  await page.getByTestId('toggle-strategic-panel').tap();await expect(page.getByTestId('toggle-province-panel')).toHaveAttribute('aria-expanded','false');await expect(page.getByTestId('toggle-strategic-panel')).toHaveAttribute('aria-expanded','true');
  const strategic=(await page.locator('.strategic-panel').boundingBox())!;
  expect(width-strategic.x-strategic.width).toBe(8);
  expect(strategic.y).toBeCloseTo(railBox.y);
  await page.getByTestId('toggle-strategic-panel').tap();
  await page.getByTestId('open-upgrades').tap();await fit(page,'#military-panel',width,height);
  await page.getByTestId('upgrade-horseArtillery-speed').tap();
  await expect(page.getByTestId('upgrade-horseArtillery-speed').locator('..')).toContainText('1/8');
  await page.keyboard.press('Escape');await page.getByTestId('open-settings').tap();await fit(page,'[role=dialog]',width,height);
  await page.screenshot({path:`artifacts/mobile-touch-${width}x${height}.png`});
});
test('pinch zoom, one-finger drag and cancellation do not cause accidental selection',async({page,context})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.getByTestId('single-player').tap();await page.getByTestId('begin-campaign').tap();await ready(page);
 await expect(page.locator('.view-controls')).toHaveCount(0);
 const canvas=page.locator('.world canvas');await expect(canvas).toHaveAttribute('data-ready','true');
 await page.locator('.world canvas').focus();await page.keyboard.press('Home');await expect(canvas).toHaveAttribute('data-settled','true');
 const distance=Number(await canvas.getAttribute('data-distance'));
 const cdp=await context.newCDPSession(page);
 const touch=async(type:'touchStart'|'touchMove'|'touchEnd'|'touchCancel',points:{x:number;y:number;id:number}[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
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
 await page.getByTestId('single-player').click();await page.getByTestId('begin-campaign').click();await ready(page);
 const app=page.locator('.app'),canvas=page.locator('.world canvas');
 await expect(canvas).toHaveAttribute('data-input-context','game');
 await canvas.dispatchEvent('pointerdown',{pointerId:10,pointerType:'touch',clientX:600,clientY:400});
 await canvas.dispatchEvent('pointercancel',{pointerId:10,pointerType:'touch'});
 await expect(app).toHaveAttribute('data-input-device','touch');
 await expect(page.getByTestId('input-hint')).toHaveCount(0);
 // Compatibility mouse events follow touch immediately. Keep this sequence
 // within one browser task so CI tracing/RPC delays cannot exceed the 800ms window.
 await canvas.evaluate(el=>{
  for(const [type,pointerId,pointerType] of [
   ['pointerdown',11,'touch'],['pointercancel',11,'touch'],
   ['pointerdown',12,'mouse'],['pointercancel',12,'mouse'],
  ] as const)el.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId,pointerType,clientX:600,clientY:400}));
 });
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
