import {expect,test} from '@playwright/test';
import {loadMapOrderFixture} from './map-orders.ts';
import {openMapSearch} from './map-search.ts';

test('Paris searches lead to the bilingual Île-de-France region',async({page})=>{
 test.setTimeout(150000);
 await loadMapOrderFixture(page);
 const panelTitle=page.locator('#province-panel h2');
 const openResult=async(query:string,label:string)=>{
  const search=await openMapSearch(page);await search.fill(query);
  const result=page.locator('.map-search-results button').filter({has:page.getByText(label,{exact:true})});
  await expect(result).toBeVisible();await result.click();
  await expect(panelTitle).toHaveText(label);
 };
 await openResult('巴黎','法兰西岛');
 await openResult('塞纳-马恩省','法兰西岛');
 await page.getByTestId('open-settings').click();
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByTestId('settings-resume').click();
 await openResult('Paris','Île-de-France');
});
