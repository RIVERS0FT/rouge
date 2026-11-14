import {openMapSearch} from './map-search.ts';
import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';

test('garrisons stay counted but invisible in both map modes for every faction and kind',async({page})=>{
 test.setTimeout(180000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 const fixture=JSON.parse(execFileSync(process.execPath,['--experimental-strip-types','tests/create-unit-model-fixture.mjs'],{encoding:'utf8',maxBuffer:16*1024*1024}));
 await page.addInitScript(({key,value})=>localStorage.setItem(key,value),fixture);
 await page.goto('/');await page.getByTestId('open-saves').click();
 await page.locator('.save-card').filter({hasText:'Unit model fixture'}).getByRole('button',{name:'载入',exact:true}).click();
 await expect(page.locator('.app')).toHaveAttribute('data-local-ready','true',{timeout:60000});
 await page.getByTestId('toggle-pause').click();
 const canvas=page.locator('.world canvas');
 for(const region of fixture.regions){
  await openMapSearch(page);await page.getByTestId('map-search').fill(region.code);await page.locator('.map-search-results button').first().click();
  await canvas.focus();await page.keyboard.press('End');for(let n=0;n<4;n++)await page.keyboard.press('+');
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await expect(canvas).toHaveAttribute('data-unit-render-mode','3d');
  await expect(page.getByTestId('region-capacity')).toContainText(`${fixture.count} / ${region.capacity}`);
  await expect(canvas).toHaveAttribute('data-rendered-instances','0');
  await expect(canvas).toHaveAttribute('data-total-units',String(fixture.total));
  // At strategic distance the same garrison is not rendered as sprites either.
  await canvas.focus();await page.keyboard.press('Home');
  await expect(canvas).toHaveAttribute('data-settled','true',{timeout:20000});
  await expect(canvas).toHaveAttribute('data-unit-render-mode','2d');
  await expect(canvas).toHaveAttribute('data-rendered-instances','0');
  await expect(canvas).toHaveAttribute('data-total-units',String(fixture.total));
  await page.screenshot({path:`artifacts/unit-model-count-${region.owner}.png`});
 }
 expect(errors).toEqual([]);
});
