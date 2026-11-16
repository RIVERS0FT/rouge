import {expect,test} from '@playwright/test';
import {loadMapOrderFixture} from './map-orders.ts';
import {openMapSearch} from './map-search.ts';

test('Reviewed island place aliases select the exact shared gameplay destinations',async({page})=>{
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
 const caribbean=await select('安圭拉','东加勒比群岛');
 expect(await select('圣卢西亚','东加勒比群岛')).toBe(caribbean);
 expect(await select('格林纳达','东加勒比群岛')).toBe(caribbean);
 const guangdong=await select('香港','广东省');
 const taiwan=await select('澎湖县','台湾');
 expect(new Set([caribbean,guangdong,taiwan]).size).toBe(3);
 await page.getByTestId('open-settings').click();
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByTestId('settings-resume').click();
 expect(await select('Carriacou','Eastern Caribbean Islands')).toBe(caribbean);
 expect(await select('Hong Kong','Guangdong')).toBe(guangdong);
 expect(await select('Kinmen','Taiwan')).toBe(taiwan);
 await select('Kosrae','Federated States of Micronesia');
 await select('Salt Cay','Turks and Caicos Islands');
});
