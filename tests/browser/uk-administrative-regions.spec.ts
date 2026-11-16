import {expect,test} from '@playwright/test';
import {loadMapOrderFixture} from './map-orders.ts';
import {openMapSearch} from './map-search.ts';

test('UK searches find the new bilingual ITL1 names and assign offshore islands to their regions',async({page})=>{
 test.setTimeout(150000);
 await loadMapOrderFixture(page);
 const title=page.locator('#province-panel h2');
 const openResult=async(query:string,label:string)=>{
  const search=await openMapSearch(page);await search.fill(query);
  const result=page.locator('.map-search-results button').filter({has:page.getByText(label,{exact:true})});
  await expect(result).toBeVisible();await result.click();
  await expect(title).toHaveText(label);
 };
 await openResult('GBR-2082','北爱尔兰');
 await openResult('GBR-2747','苏格兰');
 await openResult('GBR-2080','伦敦周边');
 await openResult('GBR-3409','伦敦周边');
 await page.getByTestId('open-settings').click();
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByTestId('settings-resume').click();
 await openResult('Westminster','London and Surrounding Areas');
 await openResult('Kent','London and Surrounding Areas');
 await openResult('Shetland','Scotland');
});
