import {test,expect} from '@playwright/test';
test('selection preserves owner fill and uses bounded inner glow in strategic and terrain views',async({page},testInfo)=>{
 await page.goto('/');await page.getByTestId('single-player').click();await page.getByTestId('begin-campaign').click();
 test.setTimeout(150000);
 const canvas=page.locator('canvas');
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await expect(page.locator('.modal-backdrop')).toHaveCount(0);
 await canvas.focus();await page.keyboard.press('Space');await expect(page.getByTestId('toggle-pause')).toHaveText('▶');
 await expect(canvas).toHaveAttribute('data-selection-style','outline-inner-glow');
 await expect.poll(async()=>Number(await canvas.getAttribute('data-selection-glow-vertices'))).toBeGreaterThan(0);
 await expect(canvas).not.toHaveAttribute('data-selection-glow-error');
 await expect(canvas).toHaveAttribute('data-selection-glow-coverage','single-nearest-boundary');
 await expect(canvas).toHaveAttribute('data-selection-glow-opacity','0.24');
 for(const key of ['Home','End']){
  await canvas.focus();await page.keyboard.press(key);
  if(key==='End')for(let i=0;i<6;i++)await page.keyboard.press('=');
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await expect(canvas).toHaveAttribute('data-selected-fill-color',/^[0-9a-f]{6}$/);
  await expect.poll(async()=>(await canvas.getAttribute('data-selected-fill-color'))===(await canvas.getAttribute('data-selected-owner-color'))).toBe(true);
  await expect(canvas).toHaveAttribute('data-selection-glow-width','2');
  await expect(canvas).toHaveAttribute('data-view',key==='Home'?'far':'near');
  await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true');
  await page.screenshot({path:testInfo.outputPath(`selection-glow-${key}.png`)});
 }
 for(const [width,height]of [[390,844],[844,390],[1440,960]]){
  await page.setViewportSize({width,height});await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await expect(canvas).toHaveAttribute('data-selected-fill-color',/^[0-9a-f]{6}$/);
  await expect.poll(async()=>(await canvas.getAttribute('data-selected-fill-color'))===(await canvas.getAttribute('data-selected-owner-color'))).toBe(true);
  expect(Number(await canvas.getAttribute('data-selection-glow-vertices'))).toBeGreaterThan(0);
  await page.screenshot({path:testInfo.outputPath(`selection-glow-${width}x${height}.png`)});
 }
 // Explicit complex coast, enclosed holes and smallest close-up island evidence.
 for(const code of ['GRL-2743','HUN-3138','FJI-2619']){
  await page.getByTestId('map-search').fill(code);await page.locator('.map-search-results button').first().click();
  await canvas.focus();await page.keyboard.press('End');
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await expect(canvas).toHaveAttribute('data-selection-glow-pending','false',{timeout:20000});
  await expect.poll(async()=>Number(await canvas.getAttribute('data-selection-glow-vertices'))).toBeGreaterThan(0);
  await expect(canvas).not.toHaveAttribute('data-selection-glow-error');
  await expect.poll(async()=>(await canvas.getAttribute('data-selected-fill-color'))===(await canvas.getAttribute('data-selected-owner-color'))).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`selection-glow-${code}.png`)});
 }
});
