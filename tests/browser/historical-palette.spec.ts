import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
for(const touch of [false,true])test.describe(touch?'touch palette':'desktop palette',()=>{
 test.use({hasTouch:touch,isMobile:touch,viewport:touch?{width:390,height:844}:{width:1440,height:960}});
 test('muted owner colors, neutral fill and original flag remain identifiable',async({page})=>{
  test.setTimeout(180000);
  const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-palette-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
  await page.addInitScript(({key,value})=>{localStorage.setItem(key,value);localStorage.setItem('rouge.language','en');},fixture);
  await page.goto('/');await page.getByTestId('open-saves').click();
  await page.locator('.save-card').filter({hasText:'Historical palette fixture'}).getByRole('button',{name:'Load',exact:true}).click();
  await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:30000});
  const canvas=page.locator('.world canvas');await expect(canvas).toHaveAttribute('data-input-context','game');
  await canvas.focus();await page.keyboard.press('Space');await expect(page.getByTestId('toggle-pause')).toHaveText('▶');
  await expect(page.getByTestId('faction-identity').locator('svg rect').first()).toHaveAttribute('fill','#ff0000');
  await expect(page.locator('.hud-top .faction-copy,.hud-top .commander-badge')).toHaveCount(0);
  await expect(page.locator('.dispatches')).toHaveCSS('background-image',/linear-gradient/);
  await expect(page.locator('.dispatches')).toContainText('Palette 16');
  for(const sample of fixture.samples){
   if(touch&&await page.getByTestId('toggle-province-panel').getAttribute('aria-expanded')==='true')await page.getByTestId('toggle-province-panel').tap();
   await page.getByTestId('map-search').fill(sample.code);await page.locator('.map-search-results button').first().click();
   await expect(canvas).toHaveAttribute('data-selected-fill-color',sample.color);
   await expect(canvas).toHaveAttribute('data-selected-owner-color',sample.color);
   await expect(canvas).toHaveAttribute('data-selection-style','outline-inner-glow');
   await expect.poll(async()=>Number(await canvas.getAttribute('data-selection-glow-vertices'))).toBeGreaterThan(0);
   if(touch)await page.getByTestId('toggle-province-panel').tap();
   await expect(page.locator('.province-owner')).toContainText(sample.name);
   // Selection is an outline plus bounded inner glow, never a replacement fill.
   await canvas.focus();await page.keyboard.press('End');await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
   await expect(canvas).toHaveAttribute('data-selected-fill-color',sample.color);
   if(sample.owner===0||sample.owner===15)await page.screenshot({path:`artifacts/historical-palette-${touch?'touch':'desktop'}-owner-${sample.owner}.png`});
  }
  if(touch){await page.setViewportSize({width:844,height:390});await expect(canvas).toHaveAttribute('data-viewport-width','844');}
  await page.screenshot({path:`artifacts/historical-palette-${touch?'touch':'desktop'}.png`});
 });
});
