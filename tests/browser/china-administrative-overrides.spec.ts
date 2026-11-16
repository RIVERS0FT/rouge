import {expect,test} from '@playwright/test';
import {loadMapOrderFixture} from './map-orders.ts';
import {openMapSearch} from './map-search.ts';

test('Beijing and Tianjin select Hebei and Shanghai selects Jiangsu in both languages',async({page})=>{
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
 const hebei=await openResult('北京','河北省');
 expect(await openResult('天津','河北省')).toBe(hebei);
 const jiangsu=await openResult('上海','江苏省');
 expect(hebei).not.toBe(jiangsu);
 await page.getByTestId('open-settings').click();
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.getByTestId('settings-resume').click();
 expect(await openResult('Tianjin','Hebei')).toBe(hebei);
 expect(await openResult('Shanghai','Jiangsu')).toBe(jiangsu);
});
