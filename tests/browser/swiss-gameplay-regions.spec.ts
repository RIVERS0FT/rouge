import {expect,test} from '@playwright/test';
import {loadMapOrderFixture} from './map-orders.ts';
import {openMapSearch} from './map-search.ts';

test('former Swiss canton names select the correct West or East management region',async({page})=>{
 test.setTimeout(150000);
 await loadMapOrderFixture(page);
 const canvas=page.locator('.world canvas'),heading=page.locator('#province-panel h2');
 const openResult=async(query:string,label:string)=>{
  const search=await openMapSearch(page);await search.fill(query);
  const result=page.locator('.map-search-results button').filter({has:page.getByText(label,{exact:true})});
  await expect(result).toBeVisible();await result.click();
  await expect(heading).toHaveText(label);
  return canvas.getAttribute('data-selected-region');
 };
 const west=await openResult('沃州','西瑞士'),east=await openResult('沙夫豪森州','东瑞士');
 expect(west).not.toBe(east);
 expect(await openResult('巴塞尔城市州','东瑞士')).toBe(east);
 await page.getByTestId('open-settings').click();
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByTestId('settings-resume').click();
 expect(await openResult('Bern','West Switzerland')).toBe(west);
 expect(await openResult('Basel-Stadt','East Switzerland')).toBe(east);
});
