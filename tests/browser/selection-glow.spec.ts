import {test,expect} from '@playwright/test';
test('selection preserves owner fill and uses bounded inner glow in strategic and terrain views',async({page})=>{
 await page.goto('/');await page.getByTestId('single-player').click();await page.getByTestId('begin-campaign').click();
 const canvas=page.locator('canvas');
 await expect(canvas).toHaveAttribute('data-selection-style','outline-inner-glow');
 await expect.poll(async()=>Number(await canvas.getAttribute('data-selection-glow-vertices'))).toBeGreaterThan(0);
 await expect(canvas).not.toHaveAttribute('data-selection-glow-error');
 for(const key of ['Home','End']){
  await canvas.focus();await page.keyboard.press(key);await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await expect(canvas).toHaveAttribute('data-selected-fill-color',/^[0-9a-f]{6}$/);
  await expect.poll(async()=>(await canvas.getAttribute('data-selected-fill-color'))===(await canvas.getAttribute('data-selected-owner-color'))).toBe(true);
  await expect(canvas).toHaveAttribute('data-selection-glow-width','2');
 }
 for(const [width,height]of [[390,844],[844,390],[1440,960]]){
  await page.setViewportSize({width,height});await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await expect(canvas).toHaveAttribute('data-selected-fill-color',/^[0-9a-f]{6}$/);
  await expect.poll(async()=>(await canvas.getAttribute('data-selected-fill-color'))===(await canvas.getAttribute('data-selected-owner-color'))).toBe(true);
  expect(Number(await canvas.getAttribute('data-selection-glow-vertices'))).toBeGreaterThan(0);
 }
 const oldSelection=await canvas.getAttribute('data-selected-region');
 await page.getByTestId('map-search').fill('GRL-2743');await page.locator('.map-search-results button').first().click();
 await expect.poll(async()=>Number(await canvas.getAttribute('data-selection-glow-vertices'))).toBeGreaterThan(0);
 await expect(canvas).not.toHaveAttribute('data-selection-glow-error');
 await expect.poll(async()=>await canvas.getAttribute('data-selected-region')).not.toBe(oldSelection);
 await expect(canvas).toHaveAttribute('data-selected-fill-color',/^[0-9a-f]{6}$/);
  await expect.poll(async()=>(await canvas.getAttribute('data-selected-fill-color'))===(await canvas.getAttribute('data-selected-owner-color'))).toBe(true);
});
