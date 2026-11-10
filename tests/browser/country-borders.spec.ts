import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
for(const touch of [false,true])test.describe(touch?'touch borders':'desktop borders',()=>{
 test.use({hasTouch:touch,isMobile:touch,viewport:touch?{width:390,height:844}:{width:1440,height:960}});
 test('country borders dominate internal borders in flat, relief and wrapped views',async({page})=>{
  test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/THREE|WebGL|shader/i.test(m.text()))errors.push(m.text());});
  const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-country-border-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
  await page.addInitScript(({key,value})=>{localStorage.setItem(key,value);localStorage.setItem('rouge.language','en');},fixture);
  await page.goto('/');await page.getByTestId('open-saves').click();
  await page.locator('.save-card').filter({hasText:'Country border fixture'}).getByRole('button',{name:'Load',exact:true}).click();
  await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:30000});
  const canvas=page.locator('canvas');await canvas.focus();await page.keyboard.press('Space');await expect(page.getByTestId('toggle-pause')).toHaveText('▶');
  await expect(canvas).toHaveAttribute('data-country-borders','true');await expect(canvas).toHaveAttribute('data-neutral-borders','independent-territories');
  await expect(canvas).toHaveAttribute('data-country-border-segments',String(fixture.counts.country));
  await expect(canvas).toHaveAttribute('data-management-border-segments',String(fixture.counts.internal));
  expect(fixture.counts.internal).toBeGreaterThan(0);expect(fixture.counts.country).toBeGreaterThan(fixture.counts.internal);
  await expect(canvas).toHaveAttribute('data-country-border-width','2.2');await expect(canvas).toHaveAttribute('data-selection-border-width','3');
  for(const code of [fixture.selectedCode,fixture.aiCode,'FJI-2619']){
   if(touch&&await page.getByTestId('toggle-province-panel').getAttribute('aria-expanded')==='true')await page.getByTestId('toggle-province-panel').tap();
   await page.getByTestId('map-search').fill(code);await page.locator('.map-search-results button').first().click();
   await canvas.focus();await page.keyboard.press('End');await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
   await expect.poll(async()=>(await canvas.getAttribute('data-selected-fill-color'))===(await canvas.getAttribute('data-selected-owner-color'))).toBe(true);
   expect(Number(await canvas.getAttribute('data-internal-border-opacity'))).toBeLessThanOrEqual(.23);
   await page.screenshot({path:`artifacts/country-borders-${touch?'touch':'desktop'}-${code}.png`});
  }
  await canvas.focus();await page.keyboard.press('Home');await expect(canvas).toHaveAttribute('data-view','far');await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await page.screenshot({path:`artifacts/country-borders-${touch?'touch':'desktop'}-strategic.png`});
  if(touch){await page.setViewportSize({width:844,height:390});await expect(canvas).toHaveAttribute('data-viewport-width','844');await expect(canvas).toHaveAttribute('data-country-border-width','2.2');}
  expect(errors).toEqual([]);
 });
});
