import {openMapSearch} from './map-search.ts';
import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';

test('region details exclude dispatched troops still inside the source after load and reload',async({page})=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-garrison-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
 await page.addInitScript(({key,value})=>localStorage.setItem(key,value),fixture);
 for(let pass=0;pass<2;pass++){
  await page.goto('/');await page.getByTestId('open-saves').click();
  await page.locator('.save-card').filter({hasText:'Garrison regression fixture'}).getByRole('button',{name:'载入',exact:true}).click();
  await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});await page.getByTestId('toggle-pause').click();
  await openMapSearch(page);await page.getByTestId('map-search').fill(fixture.selectedCode);await page.locator('.map-search-results button').first().click();
  await expect(page.getByTestId('region-capacity')).toContainText('6 / 12');
  await expect(page.getByTestId('region-capacity')).toHaveAttribute('title',/不含已派出部队/);
  await expect(page.getByTestId('army-total')).toHaveText('12');
  const canvas=page.locator('.world canvas'),plaque=page.locator(`.province-label[data-region="${fixture.selected}"]`);
  await expect(canvas).toHaveAttribute('data-settled','true');
  await expect(plaque).toBeVisible();
  await expect(plaque).toHaveAttribute('data-selected','true');
  await expect(plaque.locator('.province-plaque-count')).toHaveText('6');
  await expect(plaque).toHaveCSS('pointer-events','none');
  const source=await plaque.locator('img').getAttribute('src');
  expect(decodeURIComponent(source ?? '')).toMatch(/<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  expect(decodeURIComponent(source ?? '')).toContain('fill="#a15632"');
  expect(decodeURIComponent(source ?? '')).toContain('fill="#889977"');
  await expect.poll(()=>plaque.locator('img').evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await canvas.focus();await page.keyboard.press('Home');
  await expect(canvas).toHaveAttribute('data-settled','true');
  await expect(canvas).toHaveAttribute('data-province-labels','0');
  await openMapSearch(page);await page.getByTestId('map-search').fill(fixture.neutralCode);await page.locator('.map-search-results button').first().click();
  const neutral=page.locator('.province-label[data-selected="true"][data-owner="-1"]:visible');
  await expect(neutral.locator('.province-plaque-count')).toHaveText('0');
  await expect(neutral.locator('img')).toBeHidden();
  await expect(neutral.locator('.province-plaque-flag')).toHaveCSS('background-color','rgb(133, 137, 141)');
 }
 await page.screenshot({path:'artifacts/dispatched-garrison.png'});expect(errors).toEqual([]);
});
