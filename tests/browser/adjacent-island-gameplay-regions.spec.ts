import {expect,test} from '@playwright/test';
import {loadMapOrderFixture} from './map-orders.ts';
import {openMapSearch} from './map-search.ts';

test('Macau and nearby small island aliases select their final gameplay destinations',async({page})=>{
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
 const canton=await select('澳门','广东省');
 expect(await select('澳門','广东省')).toBe(canton);
 expect(await select('香港','广东省')).toBe(canton);
 const saipan=await select('提尼安岛','西密克罗尼西亚');
 expect(saipan).not.toBe(canton);
 await page.getByTestId('open-settings').click();
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByTestId('settings-resume').click();
 expect(await select('Macao','Guangdong')).toBe(canton);
 expect(await select('Saipan','West Micronesia')).toBe(saipan);
 const dutch=await select('Saba','West Indies');
 expect(await select('Bonaire','West Indies')).toBe(dutch);
 expect(await select('Redonda','West Indies')).toBe(dutch);
 expect(await select('Barbuda','West Indies')).toBe(dutch);
 await select('Anjouan','South Madagascar');
});
