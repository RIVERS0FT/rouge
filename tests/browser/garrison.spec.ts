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
  await page.getByTestId('map-search').fill(fixture.selectedCode);await page.locator('.map-search-results button').first().click();
  await expect(page.getByTestId('region-capacity')).toContainText('6 / 12');
  await expect(page.getByTestId('region-capacity')).toHaveAttribute('title',/不含已派出部队/);
  await expect(page.getByTestId('army-total')).toHaveText('12');
 }
 await page.screenshot({path:'artifacts/dispatched-garrison.png'});expect(errors).toEqual([]);
});
