import {expect,test} from '@playwright/test';
import {loadMapOrderFixture} from './map-orders.ts';
import {openMapSearch} from './map-search.ts';

test('Southeast Asia game regions expose former place aliases without extra game tiles',async({page})=>{
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
 const peninsula=await select('新加坡','马来半岛');
 const eastMalaysia=await select('纳闽','东马来西亚');
 const mekong=await select('安江省','湄公河');
 expect(new Set([peninsula,eastMalaysia,mekong]).size).toBe(3);
 await page.getByTestId('open-settings').click();
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByTestId('settings-resume').click();
 expect(await select('Singapore','Malay Peninsula')).toBe(peninsula);
 expect(await select('Labuan','East Malaysia')).toBe(eastMalaysia);
 expect(await select('An Giang','Mekong')).toBe(mekong);
});
