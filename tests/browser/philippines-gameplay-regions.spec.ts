import {expect,test} from '@playwright/test';
import {loadMapOrderFixture} from './map-orders.ts';
import {openMapSearch} from './map-search.ts';

test('Philippines island and city aliases open the correct three gameplay territories',async({page})=>{
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
 const luzon=await select('巴丹群岛省','吕宋');
 const visayas=await select('拉普拉普','维萨亚斯');
 const mindanao=await select('塔威塔威省','棉兰老');
 expect(new Set([luzon,visayas,mindanao]).size).toBe(3);
 await page.getByTestId('open-settings').click();
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByTestId('settings-resume').click();
 expect(await select('Manila','Luzon')).toBe(luzon);
 expect(await select('Cebu','Visayas')).toBe(visayas);
 expect(await select('Davao','Mindanao')).toBe(mindanao);
});
