import {test,expect,type Page} from '@playwright/test';

async function tick(page:Page){return Number(await page.getByTestId('game-clock').getAttribute('data-tick'));}
async function assertFullscreen(page:Page){
 const view=page.viewportSize()!,canvas=page.locator('.world canvas');
 await expect(canvas).toHaveAttribute('data-framing','cover');
 await expect(canvas).toHaveAttribute('data-viewport-width',String(view.width));
 await expect(canvas).toHaveAttribute('data-viewport-height',String(view.height));
 await expect(canvas).toHaveAttribute('data-settled','true',{timeout:15000});
 const box=await canvas.boundingBox();expect(box).toEqual({x:0,y:0,width:view.width,height:view.height});
 await expect(page.locator('.hud-bottom')).toHaveCount(0);
 // Region actions may use a section footer, but never a global bottom bar.
 await expect(page.locator('.is-game > footer')).toHaveCount(0);
 // Region actions may use a section footer, but never a global bottom bar. The
 // selected region's window stays mounted, hidden while it is not docked.
 const regionFooter=page.locator('#province-panel > footer.province-actions');
 await expect(regionFooter).toHaveCount(1);
 await expect(regionFooter.getByTestId('open-territory-management')).toHaveCount(1);
 await expect(page.locator('.is-game footer')).toHaveCount(1);
 const settings=await page.getByTestId('open-settings').boundingBox();
 expect(settings!.x).toBeGreaterThan(view.width-130);expect(settings!.y).toBeLessThan(25);
 const upgrade=await page.getByTestId('open-upgrades').boundingBox();
 const search=await page.getByTestId('map-search').boundingBox();
 const apart=(a:any,b:any)=>a.x+a.width<=b.x-4||b.x+b.width<=a.x-4||a.y+a.height<=b.y-4||b.y+b.height<=a.y-4;
 // Every primary control is on-screen and no two of them overlap.
 for(const rect of [settings,upgrade,search]){
  expect(rect).not.toBeNull();expect(rect!.x).toBeGreaterThanOrEqual(0);expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.x+rect!.width).toBeLessThanOrEqual(view.width);expect(rect!.y+rect!.height).toBeLessThanOrEqual(view.height);
 }
 expect(apart(search,upgrade)).toBe(true);expect(apart(search,settings)).toBe(true);expect(apart(upgrade,settings)).toBe(true);
 if(await page.locator('.app').getAttribute('data-layout')==='compact'){
  // The command rail becomes the bottom navigation; sheets start closed.
  for(const rect of [settings,upgrade,search])expect(rect!.height).toBeGreaterThanOrEqual(44);
  expect(upgrade!.y).toBeGreaterThan(view.height*.7);
  await expect(page.getByTestId('toggle-province-panel')).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('.province-panel')).toBeHidden();
 }else{
  // Grand-strategy layout: command rail on the left under the banner, the
  // docked region window beside it, the outliner on the right and the finder between.
  expect(upgrade!.x).toBeLessThan(80);expect(upgrade!.y).toBeGreaterThan(settings!.y+settings!.height);
  const dock=await page.locator('#province-panel').boundingBox(),outliner=await page.locator('#strategic-panel').boundingBox();
  expect(dock).not.toBeNull();expect(outliner).not.toBeNull();
  expect(dock!.x).toBeGreaterThan(upgrade!.x+upgrade!.width);expect(apart(dock,search)).toBe(true);expect(apart(outliner,search)).toBe(true);
  expect(outliner!.x).toBeGreaterThan(view.width*.6);
 }
 const d=Number(await canvas.getAttribute('data-distance')),height=2*d*Math.tan(Math.PI/9);
 expect(height).toBeLessThanOrEqual(1589.0625+1);
 expect(height*view.width/view.height).toBeLessThanOrEqual(3601);
 expect(Number(await canvas.getAttribute('data-ground-top'))).toBeGreaterThanOrEqual(-923.4391);
 expect(Number(await canvas.getAttribute('data-ground-bottom'))).toBeLessThanOrEqual(665.6236);
 expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBe(view.height);
}

test('full-screen HUD: settings, archives, focus, pause preservation and responsive edges',async({page})=>{
 test.setTimeout(180000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await page.getByTestId('single-player').click();await page.getByTestId('begin-campaign').click();
 await expect(page.getByTestId('open-settings')).toBeVisible();
 await assertFullscreen(page);
 await page.getByTestId('toggle-pause').click();
 await page.screenshot({path:'artifacts/fullscreen-hud-1440.png'});
 // Saving is only available inside settings, not in a remaining hidden bottom bar.
 await expect(page.getByTestId('settings-save')).toHaveCount(0);
 await page.getByTestId('open-settings').click();
 await expect(page.getByRole('dialog')).toHaveAccessibleName('设置');
 await expect(page.getByTestId('settings-save')).toBeEnabled();
 await page.waitForTimeout(250);const stopped=await tick(page);await page.waitForTimeout(350);expect(await tick(page)).toBe(stopped);
 await page.screenshot({path:'artifacts/settings-zh.png'});
 await page.keyboard.press('Shift+Tab');
 expect(await page.evaluate(()=>document.querySelector('[role="dialog"]')!.contains(document.activeElement))).toBe(true);
 await page.getByTestId('settings-save').click();
 await expect(page.getByRole('dialog')).toHaveCount(1);
 await page.getByPlaceholder('存档名称').fill('Fullscreen slot');await page.getByTestId('create-save').click();
 await expect(page.locator('.save-card').filter({hasText:'Fullscreen slot'})).toBeVisible();
 await page.screenshot({path:'artifacts/settings-archives.png'});
 // Escape works even from a text field: archives → settings → game.
 await page.getByPlaceholder('存档名称').focus();await page.keyboard.press('Escape');
 await expect(page.getByTestId('settings-save')).toBeVisible();
 await page.getByRole('button',{name:'English',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveAccessibleName('Settings');
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByTestId('open-settings')).toBeFocused();
 const stillPaused=await tick(page);await page.waitForTimeout(350);expect(await tick(page)).toBe(stillPaused);
 await page.getByTestId('toggle-pause').click();
 await expect.poll(()=>tick(page)).toBeGreaterThan(stillPaused);
 // A running solo game pauses temporarily, then resumes automatically.
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeVisible();
 await page.waitForTimeout(150);const pausedTick=await tick(page);await page.waitForTimeout(350);expect(await tick(page)).toBe(pausedTick);
 await page.getByTestId('settings-resume').click();await expect.poll(()=>tick(page)).toBeGreaterThan(pausedTick);
 await page.getByTestId('toggle-pause').click();
 await page.getByTestId('open-upgrades').click();await page.getByTestId('upgrade-infantry-attack').click();
 await expect(page.locator('.upgrade-card').first()).toContainText('1/8');
 // The military window is docked, not modal: the map keeps accepting input.
 await expect(page.locator('.world canvas')).toHaveAttribute('data-input-context','game');
 await page.keyboard.press('Escape');await expect(page.locator('#military-panel')).toHaveCount(0);
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('#province-panel')).toBeHidden();
 await page.getByTestId('toggle-province-panel').click();await expect(page.locator('#province-panel')).toBeVisible();
 for(const [width,height] of [[1280,720],[800,600],[2560,1080]]){
  await page.setViewportSize({width,height});await assertFullscreen(page);
  await page.screenshot({path:`artifacts/fullscreen-hud-${width}.png`});
 }
 await page.setViewportSize({width:1440,height:960});await assertFullscreen(page);
 // Pan to both latitude limits and zoom out: no blank polar bands appear.
 for(const y of [930,190]){
  await page.mouse.move(760,550);await page.mouse.down();await page.mouse.move(760,y,{steps:10});await page.mouse.up();
  await page.locator('.world canvas').focus();await page.keyboard.press('-');await assertFullscreen(page);
 }
 await page.reload();await page.getByTestId('open-saves').click();
 await page.locator('.save-card').filter({hasText:'Fullscreen slot'}).getByRole('button',{name:'Load',exact:true}).click();
 await expect(page.getByTestId('commander-portrait')).toHaveAttribute('data-leader','warden');
 await expect(page.getByTestId('open-settings')).toBeVisible();
 expect(errors).toEqual([]);
});
