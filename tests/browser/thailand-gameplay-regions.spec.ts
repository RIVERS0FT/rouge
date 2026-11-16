import {expect,test} from '@playwright/test';
import {loadMapOrderFixture} from './map-orders.ts';
import {openMapSearch} from './map-search.ts';

test('Thai island and city aliases open the correct four gameplay territories',async({page})=>{
 test.setTimeout(150000);
 await loadMapOrderFixture(page);
 const canvas=page.locator('.world canvas'),heading=page.locator('#province-panel h2');
 const select=async(query:string,label:string)=>{
  const search=await openMapSearch(page);await search.fill(query);
  const result=page.locator('.map-search-results button').filter({has:page.getByText(label,{exact:true})});
  await expect(result).toBeVisible();await result.click();
  await expect(heading).toHaveText(label);
  const id=await canvas.getAttribute('data-selected-region');expect(id).not.toBeNull();
  return id;
 };
 const north=await select('清迈府','清迈');
 const central=await select('曼谷','曼谷');
 const northeast=await select('廊开府','呵叻');
 const south=await select('普吉府','泰南');
 expect(new Set([north,central,northeast,south]).size).toBe(4);
 await page.getByTestId('open-settings').click();
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByTestId('settings-resume').click();
 expect(await select('Nong Khai','Nakhon Ratchasima')).toBe(northeast);
 expect(await select('Phuket','Southern Thailand')).toBe(south);
});
