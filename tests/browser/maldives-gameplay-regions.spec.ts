import {expect,test} from '@playwright/test';
import {loadMapOrderFixture} from './map-orders.ts';
import {openMapSearch} from './map-search.ts';

test('atoll and Malé search aliases resolve to the bilingual Ceylon gameplay region',async({page})=>{
 test.setTimeout(150000);
 await loadMapOrderFixture(page);
 const canvas=page.locator('.world canvas'),title=page.locator('#province-panel h2');
 const openResult=async(query:string,label:string)=>{
  const search=await openMapSearch(page);await search.fill(query);
  const result=page.locator('.map-search-results button').filter({has:page.getByText(label,{exact:true})});
  await expect(result).toBeVisible();await result.click();
  await expect(title).toHaveText(label);
  return canvas.getAttribute('data-selected-region');
 };
 const region=await openResult('MDV-5223','锡兰');
 expect(await openResult('马累','锡兰')).toBe(region);
 expect(await openResult('MDV-5243','锡兰')).toBe(region);
 expect(await openResult('IOT+00?','锡兰')).toBe(region);
 await page.getByTestId('open-settings').click();
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByTestId('settings-resume').click();
 expect(await openResult('Malé','Ceylon')).toBe(region);
});
