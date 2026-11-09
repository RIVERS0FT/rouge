import {test,expect} from '@playwright/test';

test('mobile landscape: battle HUD and dialogs fit common phone viewports',async({page})=>{
 test.setTimeout(180000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [width,height] of [[844,390],[915,412],[667,375],[740,430]]){
  await page.setViewportSize({width,height});
  await page.goto('/');
  await expect(page.getByTestId('single-player')).toBeVisible();
  await page.getByTestId('single-player').click();
  await expect(page.getByTestId('begin-campaign')).toBeVisible();
  await page.getByTestId('begin-campaign').click();
  await expect(page.getByTestId('open-settings')).toBeVisible();
  await expect(page.locator('canvas')).toHaveAttribute('data-settled','true',{timeout:20000});
  const canvas=await page.locator('canvas').boundingBox();expect(canvas).toEqual({x:0,y:0,width,height});
  for(const selector of ['[data-testid="open-settings"]','[data-testid="open-upgrades"]','.commander-portrait','[data-testid=toggle-province-panel]']){
   const box=await page.locator(selector).boundingBox();expect(box).not.toBeNull();
   expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);
   expect(box!.x+box!.width).toBeLessThanOrEqual(width);expect(box!.y+box!.height).toBeLessThanOrEqual(height);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBe(height);
  await page.screenshot({path:`artifacts/mobile-landscape-${width}x${height}.png`});
  await page.getByTestId('open-settings').click();await expect(page.getByRole('dialog')).toBeVisible();
  let dialog=await page.getByRole('dialog').boundingBox();expect(dialog!.y).toBeGreaterThanOrEqual(0);expect(dialog!.y+dialog!.height).toBeLessThanOrEqual(height);
  await page.keyboard.press('Escape');await page.getByTestId('open-upgrades').click();await expect(page.getByRole('dialog')).toBeVisible();
  dialog=await page.getByRole('dialog').boundingBox();expect(dialog!.y+dialog!.height).toBeLessThanOrEqual(height);
  await page.keyboard.press('Escape');await page.reload();
 }
 expect(errors).toEqual([]);
});
